// Owned games: `configurations` first (no network), then GraphQL; spaceId -> registry id through the cache (ADR 80, point 9).
import { ConnectorError, makeSecret, type EntryMedia, type LibrarySnapshot, type StoreEntry, type SyncContext } from "@ludiary/contracts";
import { APP_ID, expiredError, k, refreshSession, throwForStatus } from "./auth";
import { MAX_CONFIGURATIONS_BYTES, parseConfigurations, type CacheResult } from "./cache";

export const GRAPHQL_URL = "https://public-ubiservices.ubi.com/v1/profiles/me/uplay/graphql";
// Fields of Lutris and Galaxy (assumption UB5), without viewer.id or the API covers.
export const GRAPHQL_QUERY =
  "query AllGames { viewer { ownedGames: games(filterBy: {isOwned: true}) { totalCount nodes { spaceId name viewer { meta { ownedPlatformGroups { type } } } } } } }";
export const CDN_ASSETS = "https://static3.cdn.ubi.com/orbit/uplay_launcher_3_0/assets/";
const CACHE_DECLARATION = "ubisoft-cache";
const MAX_NODES = 50_000;
const MAX_TITLE = 300;
const UUID_RE = /^[0-9a-fA-F]{8}-([0-9a-fA-F]{4}-){3}[0-9a-fA-F]{12}$/;
const THUMB_RE = /^[A-Za-z0-9_-]{1,128}\.(jpg|jpeg|png)$/;

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

async function readCache(ctx: SyncContext): Promise<CacheResult> {
  const fs = ctx.fs;
  if (fs === undefined) {
    throw new ConnectorError("scan.discovery-unavailable", "Library locations were not resolved (automatic detection is off)", {
      messageKey: k("needsAutoDetection"),
    });
  }
  for (const loc of ctx.libraryLocations ?? []) {
    if (loc.declarationId !== CACHE_DECLARATION) continue;
    const file = fs.join(loc.path, "configurations");
    if (!(await fs.exists(file))) continue;
    return parseConfigurations(await fs.readBytes(file, MAX_CONFIGURATIONS_BYTES));
  }
  throw new ConnectorError("scan.root-unreadable", "Ubisoft Connect configurations cache not found", { messageKey: k("errors.noCache") });
}

function media(thumb: string | null): EntryMedia | undefined {
  return thumb !== null && THUMB_RE.test(thumb) ? { coverUrl: CDN_ASSETS + thumb } : undefined;
}

const isPc = (groups: unknown): boolean =>
  Array.isArray(groups) &&
  groups.some((g) => (Array.isArray(g) ? g : [g]).some((p) => isObject(p) && p["type"] === "PC")); // groups of platforms or platforms (UB5)

export async function listUbisoftLibrary(ctx: SyncContext): Promise<LibrarySnapshot> {
  const cache = await readCache(ctx); // before renewing: a missing cache costs no renewal
  const session = await refreshSession(ctx);

  const res = await ctx.http.request({
    method: "POST",
    url: GRAPHQL_URL,
    headers: { authorization: makeSecret("Ubi_v1 t=" + session.ticket.reveal()), "ubi-appid": APP_ID, "ubi-sessionid": session.sessionId },
    body: { json: { operationName: "AllGames", query: GRAPHQL_QUERY } },
  });
  if (res.status === 401 || res.status === 403) throw expiredError("Ubisoft graphql");
  if (res.status !== 200) throwForStatus(res, "Ubisoft graphql");
  const body = await res.json();
  const errors = isObject(body) ? body["errors"] : undefined;
  const owned = isObject(body) && isObject(body["data"]) && isObject(body["data"]["viewer"]) ? body["data"]["viewer"]["ownedGames"] : undefined;
  const nodes = isObject(owned) ? owned["nodes"] : undefined;
  if ((Array.isArray(errors) ? errors.length > 0 : errors != null) || !Array.isArray(nodes)) {
    throw new ConnectorError("store.unexpected-response", "Ubisoft graphql answer has errors or no nodes list");
  }
  if (nodes.length > MAX_NODES) throw new ConnectorError("store.unexpected-response", "Ubisoft graphql answer is too long");
  const totalCount = isObject(owned) ? owned["totalCount"] : undefined;

  const entries = new Map<string, StoreEntry>();
  const n = { notPc: 0, untranslated: 0, invalidThumb: 0, bad: 0 };
  for (const node of nodes) {
    const spaceId = isObject(node) ? node["spaceId"] : undefined;
    if (!isObject(node) || typeof spaceId !== "string" || !UUID_RE.test(spaceId)) {
      n.bad++;
      continue;
    }
    if (!isPc(isObject(node["viewer"]) && isObject(node["viewer"]["meta"]) ? node["viewer"]["meta"]["ownedPlatformGroups"] : undefined)) {
      n.notPc++;
      continue;
    }
    const hit = cache.bySpace.get(spaceId.toLowerCase());
    if (hit === undefined) {
      n.untranslated++;
      continue;
    }
    if (entries.has(hit.id)) continue;
    // eslint-disable-next-line no-control-regex
    const name = typeof node["name"] === "string" ? node["name"].replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, MAX_TITLE) : "";
    const m = media(hit.thumb);
    if (m === undefined) n.invalidThumb++;
    entries.set(hit.id, { storeGameId: hit.id, kind: "game", title: name || `Ubisoft ${hit.id}`, ...(m ? { media: m } : {}) });
  }
  ctx.log.info("Ubisoft library read", { ...cache.stats, nodes: nodes.length, totalCount: typeof totalCount === "number" ? totalCount : -1, ...n });
  const complete = cache.complete && totalCount === nodes.length && n.bad === 0 && n.untranslated === 0;
  return { complete, entries: [...entries.values()] };
}
