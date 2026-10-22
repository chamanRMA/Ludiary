// Owned games: user/data/games (with the token) + api.gog.com/products in batches of 50 (ADR 77, point 6).
import { ConnectorError, type LibrarySnapshot, type StoreEntry, type SyncContext } from "@ludiary/contracts";
import { bearer, expiredError, refreshSession, throwForStatus } from "./auth";

const OWNED_URL = "https://embed.gog.com/user/data/games";
const PRODUCTS_URL = "https://api.gog.com/products";
const BATCH = 50;
const MAX_OWNED = 50_000;
const MAX_TITLE = 300; // the core drops longer titles (validate.ts), which would leave complete false forever
const ID_RE = /^\d{1,20}$/;

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

export async function listGogLibrary(ctx: SyncContext): Promise<LibrarySnapshot> {
  const access = await refreshSession(ctx);

  const res = await ctx.http.request({ method: "GET", url: OWNED_URL, headers: { authorization: bearer(access) } });
  if (res.status === 401 || res.status === 403) throw expiredError("GOG user/data/games");
  if (res.status !== 200) throwForStatus(res, "GOG user/data/games");
  const body = await res.json();
  const owned = isObject(body) ? body["owned"] : undefined;
  if (!Array.isArray(owned)) throw new ConnectorError("store.unexpected-response", "GOG user/data/games has no owned list");
  if (owned.length > MAX_OWNED) throw new ConnectorError("store.unexpected-response", "GOG user/data/games is too long");

  const ids = new Set<string>();
  let skipped = 0;
  for (const v of owned) {
    if ((typeof v === "number" && Number.isSafeInteger(v) && v > 0) || (typeof v === "string" && ID_RE.test(v))) ids.add(String(v));
    else skipped++;
  }

  const entries: StoreEntry[] = [];
  const notGames: Record<string, number> = {};
  let missing = 0;
  const all = [...ids];
  for (let i = 0; i < all.length; i += BATCH) {
    const batch = all.slice(i, i + BATCH);
    const asked = new Set(batch);
    // No token and no own headers: the catalog is public (ADR 77, point 6).
    const r = await ctx.http.request({ method: "GET", url: PRODUCTS_URL, query: { ids: batch.join(",") } });
    if (r.status !== 200) throwForStatus(r, "GOG products");
    const list = await r.json();
    if (!Array.isArray(list)) throw new ConnectorError("store.unexpected-response", "GOG products answer is not a list");
    for (const p of list) {
      const id = isObject(p) && (typeof p["id"] === "number" || typeof p["id"] === "string") ? String(p["id"]) : "";
      if (!isObject(p) || !asked.delete(id)) continue; // outside the batch, or repeated
      // Remote value used as a log field name below: keep it to a short known set.
      const type = p["game_type"] === "game" || p["game_type"] === "dlc" || p["game_type"] === "pack" ? p["game_type"] : "other";
      if (type !== "game") {
        notGames[type] = (notGames[type] ?? 0) + 1;
        continue;
      }
      const title = typeof p["title"] === "string" ? p["title"].replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, MAX_TITLE) : "";
      entries.push({ storeGameId: id, kind: "game", title: title || `GOG ${id}` });
    }
    // Withdrawn from the catalog (or a movie): owned but not shown. Does not make the snapshot partial (GA6).
    missing += asked.size; // whatever was not deleted above did not come back
  }
  if (skipped > 0 || missing > 0 || Object.keys(notGames).length > 0) {
    ctx.log.info("Some owned GOG products were not listed", { skipped, missing, ...Object.fromEntries(Object.entries(notGames).map(([t, n]) => [`type_${t}`, n])) });
  }
  return { complete: skipped === 0, entries };
}
