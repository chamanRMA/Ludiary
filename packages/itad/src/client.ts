// IsThereAnyDeal HTTP calls (ADR 86, point 6). The key goes in a header as a Secret, never in the query.
// Errors carry a fixed English message and connectors.itad.errors.* keys: no piece of the answer, no cause (point 15, B2, B6).
import { ConnectorError, type EntryMedia, type I18nKey, type Secret, type StoreId, type SyncContext } from "@ludiary/contracts";
import { ITAD_SHOP_IDS, storeIdOf } from "./shops";

export const ITAD_API_HOST = "api.isthereanydeal.com";
/** ITAD14: the docs show both the own host and a CloudFront one in their examples; which one answers is checked by hand. */
export const ITAD_MEDIA_HOSTS: readonly string[] = ["assets.isthereanydeal.com", "dbxce1spal1df.cloudfront.net"];
const BASE = `https://${ITAD_API_HOST}`;
export const MAX_IDS = 200;
export const MAX_IDS_ALL_SHOPS = 50;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const COUNTRY_RE = /^[A-Z]{2}$/;

const ek = (s: "invalid" | "rateLimited" | "unavailable" | "unexpected"): I18nKey => `connectors.itad.errors.${s}` as I18nKey;
const unexpected = (what: string): ConnectorError =>
  new ConnectorError("store.unexpected-response", `IsThereAnyDeal ${what} has an unexpected shape`, { messageKey: ek("unexpected") });
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** Retry-After in seconds (the HTTP-date form is ignored). */
function retryAfterMs(headers: Readonly<Record<string, string>>): number | undefined {
  const raw = Object.entries(headers).find(([k]) => k.toLowerCase() === "retry-after")?.[1];
  return raw !== undefined && /^\d{1,6}$/.test(raw.trim()) ? Number(raw.trim()) * 1000 : undefined;
}

/** One request with one fixed error mapping. Used by the calls below and by the wizard check. */
export async function itadRequest(
  ctx: Pick<SyncContext, "http">,
  key: Secret,
  req: { method: "GET" | "POST"; path: string; query?: Record<string, string | number>; json?: unknown },
): Promise<unknown> {
  const res = await ctx.http.request({
    method: req.method,
    url: BASE + req.path,
    headers: { "itad-api-key": key },
    ...(req.query ? { query: req.query } : {}),
    ...(req.json !== undefined ? { body: { json: req.json } } : {}),
  });
  if (res.status === 401 || res.status === 403) {
    throw new ConnectorError("auth.invalid", `IsThereAnyDeal answered ${res.status}`, { messageKey: ek("invalid") });
  }
  if (res.status === 429) {
    const ms = retryAfterMs(res.headers);
    throw new ConnectorError("store.rate-limited", "IsThereAnyDeal answered 429", { messageKey: ek("rateLimited"), ...(ms === undefined ? {} : { retryAfterMs: ms }) });
  }
  if (res.status >= 500) throw new ConnectorError("network.unavailable", `IsThereAnyDeal answered ${res.status}`, { messageKey: ek("unavailable") });
  if (res.status !== 200) throw unexpected(`status ${res.status}`);
  try {
    return await res.json();
  } catch {
    throw unexpected("body"); // fixed text on purpose: a JSON.parse error may quote the body
  }
}

async function storedKey(ctx: SyncContext): Promise<Secret> {
  const key = await ctx.secrets.get("apiKey");
  if (!key) throw new ConnectorError("auth.required", "IsThereAnyDeal is not connected", { messageKey: ek("invalid") });
  return key;
}

function checkBatch(n: number, max: number): void {
  if (n > max) throw new ConnectorError("internal", `Too many ids in one IsThereAnyDeal request (max ${max})`);
}

/** key -> UUID | null object, as lookup/id/shop and lookup/id/title answer. Only well-formed UUIDs count as found. */
function foundMap(body: unknown, asked: readonly string[]): Map<string, string> {
  if (!isObject(body)) throw unexpected("lookup");
  const out = new Map<string, string>();
  for (const k of asked) {
    const v = Object.hasOwn(body, k) ? body[k] : undefined;
    if (typeof v === "string" && UUID_RE.test(v)) out.set(k, v);
    else if (v !== undefined && v !== null) throw unexpected("lookup");
  }
  return out;
}

const countLookup = (ctx: SyncContext, asked: number, found: number): void =>
  ctx.log.info("ITAD lookup", { requested: asked, found, notFound: asked - found });

/** ITAD4: Steam is `app/<appid>`, GOG the product id as is. Epic, Ubisoft and EA are not looked up (ITAD5). */
const STORE_ID_FORMAT: Partial<Record<StoreId, { re: RegExp; wire: (id: string) => string }>> = {
  steam: { re: /^\d{1,10}$/, wire: (id) => `app/${id}` },
  gog: { re: /^\d{1,15}$/, wire: (id) => id },
};

export async function itadLookupByStore(store: StoreId, ids: readonly string[], ctx: SyncContext): Promise<ReadonlyMap<string, string>> {
  const fmt = STORE_ID_FORMAT[store];
  if (!fmt || ids.length === 0) return new Map();
  checkBatch(ids.length, MAX_IDS);
  const wire = new Map<string, string>(); // wire id -> our storeGameId
  for (const id of ids) if (fmt.re.test(id)) wire.set(fmt.wire(id), id);
  if (wire.size === 0) return new Map();
  const asked = [...wire.keys()];
  const body = await itadRequest(ctx, await storedKey(ctx), { method: "POST", path: `/lookup/id/shop/${ITAD_SHOP_IDS[store]}/v1`, json: asked });
  const out = new Map<string, string>();
  for (const [w, uuid] of foundMap(body, asked)) out.set(wire.get(w)!, uuid);
  countLookup(ctx, ids.length, out.size);
  return out;
}

export async function itadLookupByTitle(titles: readonly string[], ctx: SyncContext): Promise<ReadonlyMap<string, string>> {
  if (titles.length === 0) return new Map();
  checkBatch(titles.length, MAX_IDS);
  const asked = [...new Set(titles)];
  const body = await itadRequest(ctx, await storedKey(ctx), { method: "POST", path: "/lookup/id/title/v1", json: asked });
  const out = foundMap(body, asked);
  countLookup(ctx, asked.length, out.size);
  return out;
}

/** ADR 86 point 17: the rule of ADR 71 (https, host in mediaHosts, no credentials, default port, 2048 characters at most). The URL goes as received (ITAD9). */
function mediaUrl(raw: unknown, dropped: Set<string>): string | undefined {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > 2048 || /[\p{Cc}\s]/u.test(raw)) return undefined;
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return undefined;
  }
  if (u.protocol !== "https:" || u.username !== "" || u.password !== "" || u.port !== "") return undefined;
  const host = u.hostname.toLowerCase();
  if (ITAD_MEDIA_HOSTS.includes(host)) return raw;
  if (/^[a-z0-9][a-z0-9.-]{0,252}$/.test(host) && dropped.size < 8) dropped.add(host);
  return undefined;
}

export async function itadSearch(title: string, ctx: SyncContext) {
  const body = await itadRequest(ctx, await storedKey(ctx), { method: "GET", path: "/games/search/v1", query: { title, results: 20 } });
  if (!Array.isArray(body)) throw unexpected("search");
  const out: { id: string; title: string; type: "game" | "dlc" | "package" | null; media?: EntryMedia }[] = [];
  const dropped = new Set<string>();
  let mediaDropped = 0;
  for (const r of body) {
    if (!isObject(r) || typeof r["id"] !== "string" || !UUID_RE.test(r["id"]) || typeof r["title"] !== "string") continue;
    const t = r["type"];
    const assets = isObject(r["assets"]) ? r["assets"] : {};
    // Only boxart (vertical) and banner400 (horizontal, the fallback) are used.
    const coverUrl = mediaUrl(assets["boxart"], dropped);
    const heroUrl = mediaUrl(assets["banner400"], dropped);
    mediaDropped += (assets["boxart"] !== undefined && coverUrl === undefined ? 1 : 0) + (assets["banner400"] !== undefined && heroUrl === undefined ? 1 : 0);
    out.push({
      id: r["id"],
      title: r["title"],
      type: t === "game" || t === "dlc" || t === "package" ? t : null,
      ...(coverUrl || heroUrl ? { media: { ...(coverUrl ? { coverUrl } : {}), ...(heroUrl ? { heroUrl } : {}) } } : {}),
    });
  }
  ctx.log.info("ITAD search", { found: out.length, ...(mediaDropped > 0 ? { mediaDropped, droppedMediaHosts: [...dropped].join(",") } : {}) });
  return out;
}

type Money = { amountMinor: number; currency: string };
function money(v: unknown): Money | null {
  if (!isObject(v) || !Number.isInteger(v["amountInt"]) || typeof v["currency"] !== "string") return null;
  return { amountMinor: v["amountInt"] as number, currency: v["currency"] };
}

export async function itadPrices(
  ids: readonly string[],
  q: { country: string; shops: readonly StoreId[] | "all" },
  ctx: SyncContext,
) {
  if (ids.length === 0) return [];
  checkBatch(ids.length, q.shops === "all" ? MAX_IDS_ALL_SHOPS : MAX_IDS);
  if (!COUNTRY_RE.test(q.country) || (q.shops !== "all" && q.shops.length === 0)) throw new ConnectorError("internal", "Invalid price query");
  if (ids.some((id) => !UUID_RE.test(id))) throw new ConnectorError("internal", "Invalid IsThereAnyDeal game id");
  const query: Record<string, string> = { country: q.country };
  if (q.shops !== "all") query["shops"] = q.shops.map((s) => ITAD_SHOP_IDS[s]).join(",");
  const body = await itadRequest(ctx, await storedKey(ctx), { method: "POST", path: "/games/prices/v3", query, json: ids });
  if (!Array.isArray(body)) throw unexpected("prices");

  let dealCount = 0;
  const out = body.map((g: unknown) => {
    if (!isObject(g) || typeof g["id"] !== "string" || !UUID_RE.test(g["id"]) || !Array.isArray(g["deals"])) throw unexpected("prices");
    const deals = g["deals"].flatMap((d: unknown) => {
      if (!isObject(d) || !isObject(d["shop"])) return [];
      const price = money(d["price"]);
      const regular = money(d["regular"]);
      const { id, name } = d["shop"];
      if (!price || !regular || typeof id !== "number" || !Number.isInteger(id) || typeof name !== "string" || !Number.isInteger(d["cut"]) || typeof d["url"] !== "string") return [];
      return [{
        shop: { storeId: storeIdOf(id), serviceShopId: id, name },
        amountMinor: price.amountMinor,
        regularMinor: regular.amountMinor,
        currency: price.currency,
        cut: d["cut"] as number,
        voucher: typeof d["voucher"] === "string" ? d["voucher"] : null,
        url: d["url"],
        expiresAt: typeof d["expiry"] === "string" ? d["expiry"] : null,
      }];
    });
    dealCount += deals.length;
    const low = isObject(g["historyLow"]) ? money(g["historyLow"]["all"]) : null;
    return { id: g["id"], deals, historyLow: low };
  });
  ctx.log.info("ITAD prices", { requested: ids.length, found: out.length, notFound: ids.length - out.length, deals: dealCount });
  return out;
}
