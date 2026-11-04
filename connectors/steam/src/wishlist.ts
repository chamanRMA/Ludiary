// Steam wishlist import (ADR 91, points 3 and 13). IWishlistService/GetWishlist is undocumented and needs no API key (SW1, SW2).
// Errors: fixed English text, never part of the response, no cause; never auth.* (the import must not change the connection).
import { ConnectorError, type I18nKey, type SyncContext, type WishlistItemInfo, type WishlistSnapshot } from "@ludiary/contracts";
import { APPID_RE } from "./appmanifest";
import { retryAfterMs, resolveSteamTitles, steamMedia } from "./media";

const WISHLIST_URL = "https://api.steampowered.com/IWishlistService/GetWishlist/v1/";
const MAX_ENTRIES = 5000;
const MAX_APPID = 2 ** 32 - 1;
const BATCH = 50;
const MAX_TITLE = 300;

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const unexpected = (why: string, key = false): ConnectorError =>
  new ConnectorError("store.unexpected-response", why, key ? { messageKey: "connectors.steam.error.wishlist" as I18nKey } : {});

export async function readSteamWishlist(ctx: SyncContext): Promise<WishlistSnapshot> {
  const steamId = await ctx.secrets.get("steamId");
  if (!steamId) throw unexpected("Steam is not connected");
  const res = await ctx.http.request({ method: "GET", url: WISHLIST_URL, query: { steamid: steamId } });
  if (res.status === 401 || res.status === 403) throw unexpected(`GetWishlist answered ${res.status}`, true);
  if (res.status === 429) {
    const ms = retryAfterMs(res.headers);
    throw new ConnectorError("store.rate-limited", "GetWishlist answered 429", ms === undefined ? {} : { retryAfterMs: ms });
  }
  if (res.status >= 500) throw new ConnectorError("network.unavailable", `GetWishlist answered ${res.status}`);
  if (res.status !== 200) throw unexpected(`GetWishlist answered ${res.status}`);

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw unexpected("GetWishlist answer is not JSON");
  }
  const response = isObject(body) ? body["response"] : undefined;
  if (!isObject(response)) throw unexpected("GetWishlist answer has no response object");
  const items = response["items"];
  if (items === undefined) return { complete: false, entries: [] }; // empty or hidden: Steam sends the same `{}` (SW2)
  if (!Array.isArray(items)) throw unexpected("GetWishlist items is not a list");

  const entries: { storeGameId: string; addedAt?: string }[] = [];
  const seen = new Set<string>();
  let skipped = 0;
  for (const it of items.slice(0, MAX_ENTRIES)) {
    const appid = isObject(it) ? it["appid"] : undefined;
    if (typeof appid !== "number" || !Number.isInteger(appid) || appid < 1 || appid > MAX_APPID || seen.has(String(appid))) {
      skipped++;
      continue;
    }
    const id = String(appid);
    seen.add(id);
    const added = (it as Record<string, unknown>)["date_added"];
    const date = typeof added === "number" && Number.isInteger(added) && added > 0 ? new Date(added * 1000) : null;
    entries.push({ storeGameId: id, ...(date && !Number.isNaN(date.getTime()) ? { addedAt: date.toISOString() } : {}) });
  }
  if (skipped > 0) ctx.log.info("Some wishlist items were skipped", { skipped });
  return { complete: skipped === 0 && items.length <= MAX_ENTRIES && entries.length > 0, entries };
}

export async function describeSteamWishlistItems(
  storeGameIds: readonly string[],
  ctx: SyncContext,
): Promise<ReadonlyMap<string, WishlistItemInfo>> {
  const ids = [...new Set(storeGameIds.filter((id) => APPID_RE.test(id)))];
  const out = new Map<string, WishlistItemInfo>();
  for (let i = 0; i < ids.length; i += BATCH) {
    ctx.signal.throwIfAborted();
    const batch = ids.slice(i, i + BATCH);
    const titles = await resolveSteamTitles(batch, ctx);
    for (const id of batch) {
      const t = (titles.get(id) ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, MAX_TITLE);
      out.set(id, { title: t || `Steam ${id}`, media: steamMedia(id) });
    }
  }
  return out;
}
