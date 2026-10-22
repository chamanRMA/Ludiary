// Media URLs built from the AppID (ADR 71).
import { ConnectorError, type EntryMedia, type MediaContext } from "@ludiary/contracts";
import { APPID_RE } from "./appmanifest";

export const STEAM_MEDIA_HOSTS: readonly string[] = [
  "shared.akamai.steamstatic.com",
  "shared.cloudflare.steamstatic.com",
  "shared.steamstatic.com",
];

const BASE = "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps";

/** coverUrl: vertical 600x900. heroUrl is the fallback (header.jpg, 460x215). appId must be validated already. */
export function steamMedia(appId: string): EntryMedia {
  return { coverUrl: `${BASE}/${appId}/library_600x900.jpg`, heroUrl: `${BASE}/${appId}/header.jpg` };
}

// ---- ADR 73: current artwork (with hash) from IStoreBrowseService/GetItems ----

/** steamcommunity.com is only for OpenID check_authentication (ADR 74). */
export const STEAM_API_HOSTS: readonly string[] = ["api.steampowered.com", "steamcommunity.com"];

const GET_ITEMS_URL = "https://api.steampowered.com/IStoreBrowseService/GetItems/v1/";
const ASSET_BASE = "https://shared.akamai.steamstatic.com/store_item_assets/";
const FILE_RE = /^(?:[0-9a-f]{40}\/)?[a-z0-9_]{1,64}\.jpg$/;

/** Retry-After in seconds (the HTTP-date form is ignored). */
export function retryAfterMs(headers: Readonly<Record<string, string>>): number | undefined {
  const raw = Object.entries(headers).find(([k]) => k.toLowerCase() === "retry-after")?.[1];
  if (raw === undefined || !/^\d{1,6}$/.test(raw.trim())) return undefined;
  return Number(raw.trim()) * 1000;
}

/** `^steam/apps/<appid>/${FILENAME}(?t=<digits>)?$` with the element's own AppID (ADR 73). */
const formatOk = (appid: string, format: string): boolean =>
  new RegExp("^steam/apps/" + appid + "/[$][{]FILENAME[}]([?]t=[0-9]{1,12})?$").test(format);

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

export async function resolveSteamMedia(
  storeGameIds: readonly string[],
  ctx: MediaContext,
): Promise<ReadonlyMap<string, EntryMedia>> {
  const out = new Map<string, EntryMedia>();
  const requested = new Set(storeGameIds.filter((id) => APPID_RE.test(id)));
  if (requested.size === 0) return out;

  const inputJson = JSON.stringify({
    ids: [...requested].map((id) => ({ appid: Number(id) })),
    context: { language: ctx.locale.toLowerCase().startsWith("es") ? "spanish" : "english", country_code: "US" },
    data_request: { include_assets: true },
  });
  const res = await ctx.http.request({ method: "GET", url: GET_ITEMS_URL, query: { input_json: inputJson } });
  if (res.status === 429) {
    const ms = retryAfterMs(res.headers);
    throw new ConnectorError("store.rate-limited", "GetItems answered 429", ms === undefined ? {} : { retryAfterMs: ms });
  }
  if (res.status !== 200) throw new ConnectorError("store.unexpected-response", `GetItems answered ${res.status}`);

  const body = await res.json();
  const items = isObject(body) && isObject(body["response"]) ? body["response"]["store_items"] : undefined;
  if (!Array.isArray(items)) throw new ConnectorError("store.unexpected-response", "GetItems answer has no store_items");

  let skipped = 0;
  for (const item of items) {
    const appid = isObject(item) && item["success"] === 1 && typeof item["appid"] === "number" ? String(item["appid"]) : "";
    const assets = isObject(item) ? item["assets"] : undefined;
    const format = isObject(assets) ? assets["asset_url_format"] : undefined;
    if (!requested.has(appid) || !isObject(assets) || typeof format !== "string" || !formatOk(appid, format)) {
      skipped++;
      continue;
    }
    const url = (name: unknown): string | undefined =>
      typeof name === "string" && FILE_RE.test(name) ? ASSET_BASE + format.replace("${FILENAME}", name) : undefined;
    const coverUrl = url(assets["library_capsule"]);
    const heroUrl = url(assets["header"]);
    if (!coverUrl && !heroUrl) {
      skipped++;
      continue;
    }
    out.set(appid, { ...(coverUrl ? { coverUrl } : {}), ...(heroUrl ? { heroUrl } : {}) });
  }
  if (skipped > 0) ctx.log.info("Some GetItems elements were skipped", { skipped });
  return out;
}
