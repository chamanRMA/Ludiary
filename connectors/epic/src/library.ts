// Owned games: library-service (with the user's token) + the catalog for titles and covers (ADR 78, point 8).
import { ConnectorError, type LibrarySnapshot, type StoreEntry, type SyncContext } from "@ludiary/contracts";
import { bearer, expiredError, refreshSession, throwForStatus } from "./auth";
import { buildStoreId, cleanText, isObject } from "./ids";
import { catalogJobs, catalogUrl, CATALOG_CONCURRENCY, mediaFromItem } from "./media";
import { runPool, withTimeout } from "./pool";

const LIBRARY_URL = "https://library-service.live.use1a.on.epicgames.com/library/api/public/items";
const MAX_PAGES = 200;
const MAX_RECORDS = 50_000;
const MAX_NAMESPACES = 2000;
const CATALOG_TIMEOUT_MS = 8000;
const MAX_TITLE = 300; // the core drops longer titles (validate.ts), which would leave complete false forever
// eslint-disable-next-line no-control-regex
const CURSOR_RE = /^[^\u0000-\u001f\u007f]{1,2048}$/;

const unexpected = (msg: string): ConnectorError => new ConnectorError("store.unexpected-response", msg);
const hasPath = (item: Record<string, unknown>, name: string): boolean =>
  Array.isArray(item["categories"]) && item["categories"].some((c) => isObject(c) && typeof c["path"] === "string" && new RegExp(`^${name}(/|$)`, "i").test(c["path"]));

export async function listEpicLibrary(ctx: SyncContext): Promise<LibrarySnapshot> {
  const access = await refreshSession(ctx);
  const auth = { authorization: bearer(access) };

  // ---- owned records, paged ----
  const owned = new Set<string>();
  let malformed = 0;
  let unrealContent = 0;
  let records = 0;
  let cursor: string | undefined;
  const cursors = new Set<string>();
  for (let page = 0; ; page++) {
    ctx.signal.throwIfAborted();
    if (page >= MAX_PAGES) throw unexpected("Epic library has too many pages");
    const res = await ctx.http.request({
      method: "GET",
      url: LIBRARY_URL,
      headers: auth,
      query: { includeMetadata: "true", platform: "Windows", ...(cursor === undefined ? {} : { cursor }) },
    });
    if (res.status === 401 || res.status === 403) throw expiredError("Epic library");
    if (res.status !== 200) throwForStatus(res, "Epic library");
    const body = await res.json();
    const list = isObject(body) ? body["records"] : undefined;
    if (!Array.isArray(list)) throw unexpected("Epic library answer has no records list");
    records += list.length;
    if (records > MAX_RECORDS) throw unexpected("Epic library has too many records");
    for (const r of list) {
      const rec = isObject(r) ? r : {};
      if (rec["namespace"] === "ue") {
        unrealContent++;
        continue;
      }
      const id = buildStoreId(rec["namespace"], rec["catalogItemId"], rec["appName"]);
      if (id === null) malformed++;
      else owned.add(id);
    }
    const meta = isObject(body) ? body["responseMetadata"] : undefined;
    const next = isObject(meta) ? meta["nextCursor"] : undefined;
    if (next === undefined || next === null || next === "") break;
    if (typeof next !== "string" || !CURSOR_RE.test(next) || cursors.has(next)) throw unexpected("Epic library cursor is not valid or repeats");
    cursors.add(next);
    cursor = next;
  }

  // ---- catalog by namespace: titles, covers, DLC filter ----
  let complete = malformed === 0;
  let jobs = catalogJobs([...owned]);
  const namespaces = new Set(jobs.map((j) => j.namespace));
  if (namespaces.size > MAX_NAMESPACES) {
    const keep = new Set([...namespaces].slice(0, MAX_NAMESPACES));
    jobs = jobs.filter((j) => keep.has(j.namespace));
    complete = false;
  }
  const idsByKey = new Map<string, string[]>();
  for (const id of owned) idsByKey.set(id.slice(0, id.lastIndexOf(":")), [...(idsByKey.get(id.slice(0, id.lastIndexOf(":"))) ?? []), id]);

  const entries = new Map<string, StoreEntry>();
  const skipped: Record<string, number> = {};
  const count = (what: string): void => void (skipped[what] = (skipped[what] ?? 0) + 1);
  const foreign = new Set<string>();

  await runPool(jobs, CATALOG_CONCURRENCY, ctx.signal, async (job) => {
    const res = await withTimeout(
      ctx.http.request({ method: "GET", url: catalogUrl(job.namespace, job.catalogIds, ctx.locale), headers: auth }),
      CATALOG_TIMEOUT_MS,
      "Epic catalog",
    );
    if (res.status === 401 || res.status === 403) throw expiredError("Epic catalog");
    if (res.status !== 200) throwForStatus(res, "Epic catalog");
    const body = await withTimeout(res.json(), CATALOG_TIMEOUT_MS, "Epic catalog");
    if (!isObject(body)) throw unexpected("Epic catalog answer is not an object");
    for (const catalogId of job.catalogIds) {
      const storeIds = idsByKey.get(`${job.namespace}:${catalogId}`) ?? [];
      const item = body[catalogId];
      if (!isObject(item)) {
        for (let i = 0; i < storeIds.length; i++) count("notInCatalog"); // withdrawn from the catalog: owned but not shown
        continue;
      }
      const main = item["mainGameItem"];
      const isDlc = hasPath(item, "addons") || (main !== undefined && main !== null) || (Array.isArray(item["mainGameItemList"]) && item["mainGameItemList"].length > 0);
      for (const storeId of storeIds) {
        if (isDlc) count("dlc");
        else if (!hasPath(item, "games")) count(hasPath(item, "applications") ? "application" : "other");
        else {
          const appName = storeId.slice(storeId.lastIndexOf(":") + 1);
          const title = typeof item["title"] === "string" ? cleanText(item["title"], MAX_TITLE) : "";
          const media = mediaFromItem(item, (h) => foreign.add(h));
          entries.set(storeId, { storeGameId: storeId, kind: "game", title: title || `Epic ${appName}`, ...(media ? { media } : {}) });
        }
      }
    }
  });

  if (unrealContent > 0 || malformed > 0 || Object.keys(skipped).length > 0 || foreign.size > 0) {
    ctx.log.info("Some owned Epic products were not listed", {
      malformed,
      unrealContent,
      foreignImageHosts: [...foreign].slice(0, 5).join(","),
      ...Object.fromEntries(Object.entries(skipped).map(([t, n]) => [`type_${t}`, n])),
    });
  }
  return { complete, entries: [...entries.values()] };
}
