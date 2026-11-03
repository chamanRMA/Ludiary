// GOG wishlist import (ADR 91, points 3 and 13). embed.gog.com/user/wishlist.json is unofficial (GW1).
// Errors: fixed English text, never part of the response, no cause.
import { ConnectorError, type EntryMedia, type SyncContext, type WishlistItemInfo, type WishlistSnapshot } from "@ludiary/contracts";
import { bearer, expiredError, refreshSession, throwForStatus } from "./auth";
import { PRODUCT_ID_RE } from "./info";

const WISHLIST_URL = "https://embed.gog.com/user/wishlist.json";
const PRODUCTS_URL = "https://api.gog.com/products";
const MAX_ENTRIES = 5000;
const BATCH = 50;
const MAX_TITLE = 300;
// api.gog.com serves images from images-N.gog-statics.com; the same file is on images.gog.com, the only media host (GW2).
const BACKGROUND_RE = /^(?:https:)?\/\/images(?:-\d)?\.gog-statics\.com\/([0-9a-f]{64})\.jpg$/;

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const unexpected = (why: string): ConnectorError => new ConnectorError("store.unexpected-response", why);

export async function readGogWishlist(ctx: SyncContext): Promise<WishlistSnapshot> {
  const access = await refreshSession(ctx);
  const res = await ctx.http.request({ method: "GET", url: WISHLIST_URL, headers: { authorization: bearer(access) } });
  if (res.status === 401 || res.status === 403) throw expiredError("GOG user/wishlist.json");
  if (res.status !== 200) throwForStatus(res, "GOG user/wishlist.json");
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw unexpected("GOG user/wishlist.json answer is not JSON");
  }
  const wishlist = isObject(body) ? body["wishlist"] : undefined;
  if (!isObject(wishlist)) throw unexpected("GOG user/wishlist.json has no wishlist object");

  // shortcut: JSON.parse orders integer-like keys numerically, so the store's order is not recoverable; revisit if the manual test shows one.
  const entries: { storeGameId: string }[] = [];
  let skipped = 0;
  for (const [key, value] of Object.entries(wishlist)) {
    if (value !== true) continue; // false = no longer on the list
    if (!PRODUCT_ID_RE.test(key)) skipped++;
    else entries.push({ storeGameId: key });
  }
  if (skipped > 0) ctx.log.info("Some wishlist keys were skipped", { skipped });
  return { complete: skipped === 0 && entries.length <= MAX_ENTRIES, entries: entries.slice(0, MAX_ENTRIES) };
}

export async function describeGogWishlistItems(
  storeGameIds: readonly string[],
  ctx: SyncContext,
): Promise<ReadonlyMap<string, WishlistItemInfo>> {
  const ids = [...new Set(storeGameIds.filter((id) => PRODUCT_ID_RE.test(id)))];
  const out = new Map<string, WishlistItemInfo>();
  for (let i = 0; i < ids.length; i += BATCH) {
    ctx.signal.throwIfAborted();
    const asked = new Set(ids.slice(i, i + BATCH));
    // No token: the catalog is public (ADR 77, point 6).
    const r = await ctx.http.request({ method: "GET", url: PRODUCTS_URL, query: { ids: [...asked].join(",") } });
    if (r.status !== 200) throwForStatus(r, "GOG products");
    let list: unknown;
    try {
      list = await r.json();
    } catch {
      throw unexpected("GOG products answer is not JSON");
    }
    if (!Array.isArray(list)) throw unexpected("GOG products answer is not a list");
    for (const p of list) {
      const id = isObject(p) && (typeof p["id"] === "number" || typeof p["id"] === "string") ? String(p["id"]) : "";
      if (!isObject(p) || !asked.delete(id)) continue; // outside the batch, or repeated
      const title = typeof p["title"] === "string" ? p["title"].replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, MAX_TITLE) : "";
      const bg = isObject(p["images"]) ? p["images"]["background"] : undefined;
      const hash = typeof bg === "string" ? BACKGROUND_RE.exec(bg)?.[1] : undefined;
      const media: EntryMedia | undefined = hash ? { heroUrl: `https://images.gog.com/${hash}.jpg` } : undefined;
      out.set(id, { title: title || `GOG ${id}`, ...(media ? { media } : {}) });
    }
  }
  return out;
}
