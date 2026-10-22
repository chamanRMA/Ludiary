// Validation of everything a connector returns (ADR 40 rule 4, ADR 72). Pure except for LocalFiles lookups.
import type { EntryMedia, ExternalIds, InstalledEntry, LocalFiles, ResolvedLocation, StoreConnector } from "@ludiary/contracts";
import { ConnectorError } from "@ludiary/contracts";
import type { CoreLogger, ScannedEntry } from "./model";
import { normalizeTitle } from "./normalize";

export const MAX_ENTRIES = 10_000;
export const MAX_DISCOVERED_ROOTS = 64;
const CONTROL = /\p{Cc}/u;
const ID_FORBIDDEN = /[\p{Cc}\p{Zl}\p{Zp}]/u;
const MAX_URL = 2048;

export const isNonEmptyText = (s: unknown, max: number): s is string =>
  typeof s === "string" && s.trim().length > 0 && s.length <= max && !CONTROL.test(s);

export function validateMedia(media: unknown, hosts: readonly string[]): EntryMedia | undefined {
  if (!media || typeof media !== "object") return undefined;
  const out: { coverUrl?: string; heroUrl?: string; iconUrl?: string } = {};
  for (const key of ["coverUrl", "heroUrl", "iconUrl"] as const) {
    const v = (media as Record<string, unknown>)[key];
    if (typeof v !== "string" || v.length > MAX_URL || CONTROL.test(v)) continue;
    let u: URL;
    try {
      u = new URL(v);
    } catch {
      continue;
    }
    if (u.protocol !== "https:" || u.username !== "" || u.password !== "" || !hosts.includes(u.hostname.toLowerCase())) continue;
    out[key] = u.href;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function validateExternalIds(ids: unknown): ExternalIds | undefined {
  if (!ids || typeof ids !== "object") return undefined;
  const out: { igdb?: string; rawg?: string; steamAppId?: string } = {};
  for (const key of ["igdb", "rawg", "steamAppId"] as const) {
    const v = (ids as Record<string, unknown>)[key];
    if (typeof v === "string" && v.length > 0 && v.length <= 64 && !CONTROL.test(v)) out[key] = v;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function validateLaunchData(d: unknown): Record<string, string> | null | "invalid" {
  if (d === undefined || d === null) return null;
  if (typeof d !== "object" || Array.isArray(d)) return "invalid";
  const entries = Object.entries(d as Record<string, unknown>);
  if (entries.length > 16) return "invalid";
  const out: Record<string, string> = {};
  for (const [k, v] of entries) {
    if (k.length === 0 || k.length > 64 || typeof v !== "string" || v.length > 1024) return "invalid";
    out[k] = v;
  }
  return out;
}

export interface ValidateEntriesArgs {
  entries: unknown;
  /** Paths of the roots of the scan context. */
  roots: readonly string[];
  connector: Pick<StoreConnector, "id" | "mediaHosts">;
  files: LocalFiles;
  log: CoreLogger;
}

export async function insideAny(files: LocalFiles, path: string, roots: readonly string[]): Promise<boolean> {
  for (const r of roots) if (await files.isInside(path, r)) return true;
  return false;
}

/**
 * Keeps the valid entries; an invalid one is dropped and logged (no title or path in the log). A repeated id keeps the first.
 * DLC entries and entries without a store id are not stored in this cut (ADR 52 and 72): dropped and counted.
 */
export async function validateEntries(a: ValidateEntriesArgs): Promise<ScannedEntry[]> {
  if (!Array.isArray(a.entries)) {
    throw new ConnectorError("store.unexpected-response", "scanInstalled returned entries that are not a list");
  }
  const list = a.entries as readonly InstalledEntry[];
  if (list.length > MAX_ENTRIES) a.log.warn("Scan returned too many entries; extra ones ignored", { connector: a.connector.id, count: list.length });
  const out: ScannedEntry[] = [];
  const seen = new Set<string>();
  let invalid = 0;
  let unsupported = 0;
  let duplicates = 0;
  for (const e of list.slice(0, MAX_ENTRIES)) {
    if (!e || typeof e !== "object") {
      invalid++;
      continue;
    }
    const id = e.storeGameId;
    if (id === undefined) {
      unsupported++;
      continue;
    }
    if (typeof id !== "string" || id.length < 1 || id.length > 64 || id.trim() === "" || ID_FORBIDDEN.test(id)) {
      invalid++;
      continue;
    }
    if (e.kind !== "game" && e.kind !== "dlc") {
      invalid++;
      continue;
    }
    if (!isNonEmptyText(e.title, 300)) {
      invalid++;
      continue;
    }
    if (typeof e.installPath !== "string" || !a.files.isAbsolute(e.installPath) || !(await insideAny(a.files, e.installPath, a.roots))) {
      invalid++;
      continue;
    }
    const launchData = validateLaunchData(e.launchData);
    if (launchData === "invalid") {
      invalid++;
      continue;
    }
    if (e.kind === "dlc") {
      unsupported++;
      continue;
    }
    if (seen.has(id)) {
      duplicates++;
      continue;
    }
    seen.add(id);
    const title = e.title.trim();
    const media = validateMedia(e.media, a.connector.mediaHosts);
    const externalIds = validateExternalIds(e.externalIds);
    out.push({
      storeGameId: id,
      kind: "game",
      title,
      normalizedTitle: normalizeTitle(title),
      installPath: a.files.normalize(e.installPath),
      launchData,
      ...(externalIds ? { externalIds } : {}),
      ...(media ? { media } : {}),
    });
  }
  if (invalid + unsupported + duplicates > 0) {
    a.log.warn("Some scan entries were not stored", { connector: a.connector.id, invalid, unsupported, duplicates });
  }
  return out;
}

export interface ValidatedRoot {
  path: string;
  pathKey: string;
  declarationId: string;
  tag: string | null;
}

/** Discovered roots (ADR 72): absolute, existing directory, at most 64, declared by the connector, no repeats. */
export async function validateDiscoveredRoots(
  returned: unknown,
  connector: Pick<StoreConnector, "id" | "locations">,
  files: LocalFiles,
  log: CoreLogger,
): Promise<ValidatedRoot[]> {
  if (!Array.isArray(returned)) throw new ConnectorError("store.unexpected-response", "discoverRoots did not return a list");
  const declared = new Set(connector.locations.map((l) => l.id));
  const out: ValidatedRoot[] = [];
  const keys = new Set<string>();
  let dropped = 0;
  for (const r of returned as readonly ResolvedLocation[]) {
    if (out.length >= MAX_DISCOVERED_ROOTS) {
      dropped++;
      continue;
    }
    if (!r || typeof r.path !== "string" || typeof r.declarationId !== "string" || !declared.has(r.declarationId) || !files.isAbsolute(r.path) || !files.isLocalPath(r.path)) {
      dropped++;
      continue;
    }
    const path = files.normalize(r.path);
    const key = files.compareKey(path);
    if (keys.has(key) || !(await files.isDirectory(path))) {
      dropped++;
      continue;
    }
    keys.add(key);
    const tag = typeof r.tag === "string" && /^[a-z0-9-]{1,32}$/.test(r.tag) ? r.tag : null;
    out.push({ path, pathKey: key, declarationId: r.declarationId, tag });
  }
  if (dropped > 0) log.warn("Some discovered roots were ignored", { connector: connector.id, dropped });
  return out;
}
