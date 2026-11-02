import {
  ConnectorError,
  PathEscapesRootsError,
  type CollectionImportContext,
  type CollectionImportSnapshot,
  type I18nKey,
} from "@ludiary/contracts";

// ADR 87. The file is untrusted: nothing from it ever reaches an error or a log (point 13, ALTO).
export const COLLECTIONS_ROOT = "userdata";
const FILE_PARTS = ["config", "cloudstorage", "cloud-storage-namespace-1.json"] as const;
const MAX_FILE_BYTES = 8 * 1024 * 1024;
const MAX_VALUE_CHARS = 1024 * 1024; // shortcut: UTF-16 units stand for bytes; the 8 MiB file cap bounds the total anyway
const MAX_PAIRS = 20_000;
const MAX_KEY = 256;
const MAX_COLLECTIONS = 1000; // snapshot barrier, not Ludiary's limit (ADR 87 point 13)
const MAX_DISTINCT_IDS = 100_000;
const PREFIX = "user-collections.";
const STEAMID_BASE = 76561197960265728n;
const MAX_ACCOUNT = 0xffffffff;

const NOT_FOUND = "connectors.steam.collections.notFound" as I18nKey;
const ACCOUNT_NOT_FOUND = "connectors.steam.collections.accountNotFound" as I18nKey;
const AMBIGUOUS = "connectors.steam.collections.ambiguous" as I18nKey;

const unexpected = (what: string): ConnectorError => new ConnectorError("store.unexpected-response", what); // never a cause

const own = (o: object, k: string): boolean => Object.hasOwn(o, k);
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** SteamID64 -> accountid (SC8), or null when it does not have the shape or the result is out of range. */
function accountIdOf(steamId: string): string | null {
  if (!/^7656119\d{10}$/.test(steamId)) return null;
  const n = BigInt(steamId) - STEAMID_BASE;
  return n >= 1n && n <= BigInt(MAX_ACCOUNT) ? n.toString() : null;
}

/** An appid as an integer 1..2^32-1 or a text of 1 to 10 digits with that value; null otherwise. */
function appId(v: unknown): string | null {
  let n: number;
  if (typeof v === "number") n = v;
  else if (typeof v === "string" && /^\d{1,10}$/.test(v)) n = Number(v);
  else return null;
  return Number.isInteger(n) && n >= 1 && n <= MAX_ACCOUNT ? String(n) : null;
}

async function findFiles(ctx: CollectionImportContext): Promise<{ file: string; source: "connected" | "single-folder"; escaped: number }> {
  const roots = ctx.locations.filter((l) => l.declarationId === "steam-root").map((l) => ctx.fs.join(l.path, COLLECTIONS_ROOT));
  let escaped = 0;
  const fail = (messageKey: I18nKey, msg: string): ConnectorError => {
    ctx.log.info("Steam collections file not usable", { reason: messageKey === AMBIGUOUS ? "ambiguous" : messageKey === ACCOUNT_NOT_FOUND ? "account-not-found" : "not-found", escapedFolders: escaped });
    return new ConnectorError("scan.root-unreadable", msg, { messageKey });
  };
  const has = async (file: string): Promise<boolean> => {
    try {
      return await ctx.fs.exists(file);
    } catch (e) {
      if (e instanceof PathEscapesRootsError) {
        escaped++; // a junction leaving userdata: skipped
        return false;
      }
      throw e;
    }
  };

  const secret = await ctx.secrets.get("steamId");
  if (secret) {
    const id = accountIdOf(secret.reveal());
    if (id === null) throw fail(NOT_FOUND, "The connected Steam account has no usable account folder");
    for (const r of roots) {
      ctx.signal.throwIfAborted();
      const file = ctx.fs.join(r, id, ...FILE_PARTS);
      if (await has(file)) return { file, source: "connected", escaped }; // searched in every steam-root; never falls back to another account
    }
    throw fail(escaped > 0 ? NOT_FOUND : ACCOUNT_NOT_FOUND, "No collections file for the connected Steam account");
  }

  const found = new Map<string, string>(); // accountid -> file; the same folder in two roots counts once
  for (const r of roots) {
    ctx.signal.throwIfAborted();
    let names: readonly { name: string; isDirectory: boolean }[];
    try {
      if (!(await ctx.fs.exists(r))) continue;
      names = await ctx.fs.readDir(r);
    } catch (e) {
      if (e instanceof PathEscapesRootsError) {
        escaped++;
        continue;
      }
      throw e;
    }
    for (const d of names) {
      if (!d.isDirectory || !/^\d{1,10}$/.test(d.name)) continue;
      const n = Number(d.name);
      if (n < 1 || n > MAX_ACCOUNT) continue;
      const key = String(n);
      const file = ctx.fs.join(r, d.name, ...FILE_PARTS);
      if (!found.has(key) && (await has(file))) found.set(key, file);
    }
  }
  if (found.size === 0) throw fail(NOT_FOUND, "No Steam collections file found");
  if (found.size > 1) throw fail(AMBIGUOUS, "Several Steam accounts have a collections file; connect the account to choose");
  return { file: [...found.values()][0] as string, source: "single-folder", escaped };
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined; // the SyntaxError quotes input: it is dropped here, with no cause
  }
}

export async function importSteamCollections(ctx: CollectionImportContext): Promise<CollectionImportSnapshot> {
  const { file, source, escaped } = await findFiles(ctx);
  const bytes = await ctx.fs.readBytes(file, MAX_FILE_BYTES);
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes); // a leading BOM is removed
  } catch {
    throw unexpected("The Steam collections file is not valid UTF-8");
  }
  const root = parseJson(text);
  if (root === undefined) throw unexpected("The Steam collections file is not valid JSON (it may be half written)");
  if (!Array.isArray(root) || root.length > MAX_PAIRS) throw unexpected("The Steam collections file has an unexpected shape");

  const skipped = { dynamic: 0, deleted: 0, hidden: 0, invalid: 0, limitSnapshot: 0, limitIds: 0 };
  const distinct = new Set<string>();
  const collections = new Map<string, { sourceId: string; name: string; storeGameIds: string[] }>(); // by Steam collection id
  const favorites = new Set<string>();

  // Reads a list of appids; keeps new ones within the global cap.
  const ids = (v: unknown): string[] => {
    if (v === undefined) return [];
    if (!Array.isArray(v)) {
      skipped.invalid++;
      return [];
    }
    const out: string[] = [];
    for (const x of v) {
      const a = appId(x);
      if (a === null) skipped.invalid++;
      else out.push(a);
    }
    return out;
  };
  const admit = (list: Iterable<string>): string[] => {
    const out: string[] = [];
    for (const a of list) {
      if (!distinct.has(a)) {
        if (distinct.size >= MAX_DISTINCT_IDS) {
          skipped.limitIds++;
          continue;
        }
        distinct.add(a);
      }
      out.push(a);
    }
    return out;
  };

  for (const pair of root) {
    ctx.signal.throwIfAborted();
    if (!Array.isArray(pair) || pair.length !== 2) continue;
    const [key, entry] = pair as [unknown, unknown];
    if (typeof key !== "string" || key.length > MAX_KEY || !key.startsWith(PREFIX)) continue;
    if (!isObj(entry)) {
      skipped.invalid++;
      continue;
    }
    if (own(entry, "is_deleted") && entry["is_deleted"] === true) {
      skipped.deleted++;
      continue;
    }
    const raw = own(entry, "value") ? entry["value"] : undefined;
    const inner = typeof raw === "string" && raw.length <= MAX_VALUE_CHARS ? parseJson(raw) : undefined;
    if (!isObj(inner)) {
      skipped.invalid++;
      continue;
    }
    if (own(inner, "filterSpec")) {
      skipped.dynamic++;
      continue;
    }
    const id = own(inner, "id") ? inner["id"] : undefined;
    if (typeof id !== "string") {
      skipped.invalid++;
      continue;
    }
    const removed = new Set(ids(own(inner, "removed") ? inner["removed"] : undefined));
    const members = [...new Set(ids(own(inner, "added") ? inner["added"] : undefined))].filter((a) => !removed.has(a)); // SC2
    if (id === "hidden") {
      skipped.hidden += members.length; // games hidden in Steam, not the one collection
      continue;
    }
    if (id === "favorite") {
      for (const a of admit(members)) favorites.add(a);
      continue;
    }
    const name = own(inner, "name") ? inner["name"] : undefined;
    if (typeof name !== "string") {
      skipped.invalid++;
      continue;
    }
    if (!/^[!-~]{1,64}$/.test(id) || collections.has(id)) {
      skipped.invalid++; // ADR 88: sourceId is 1-64 printable ASCII; a repeated one keeps the first
      continue;
    }
    if (collections.size >= MAX_COLLECTIONS) {
      skipped.limitSnapshot++;
      continue;
    }
    collections.set(id, { sourceId: id, name, storeGameIds: admit(members) });
  }

  ctx.log.info("Steam collections read", {
    account: source,
    escapedFolders: escaped,
    collections: collections.size,
    favorites: favorites.size,
    ...skipped,
  });
  return { collections: [...collections.values()], favorites: [...favorites], accountSource: source, skipped };
}
