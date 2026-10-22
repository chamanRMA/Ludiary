// Covers from Epic's public catalog with an application token, no account (ADR 78, point 5). Shares the catalog request
// with the library (point 8), which uses the user's token.
import { ConnectorError, type EntryMedia, type MediaContext } from "@ludiary/contracts";
import { appToken, bearer, throwForStatus } from "./auth";
import { isObject, splitStoreId, STORE_ID_RE } from "./ids";
import { runPool, withTimeout } from "./pool";

export const EPIC_API_HOSTS: readonly string[] = ["account-public-service-prod03.ol.epicgames.com", "catalog-public-service-prod06.ol.epicgames.com"];
export const EPIC_MEDIA_HOSTS: readonly string[] = ["cdn1.epicgames.com", "cdn2.unrealengine.com"];

const CATALOG = "https://catalog-public-service-prod06.ol.epicgames.com/catalog/api/shared/namespace/";
export const CATALOG_CHUNK = 50;
export const CATALOG_CONCURRENCY = 6;
const REQUEST_TIMEOUT_MS = 8000;
const MAX_URL = 2048;

/** URL of the bulk catalog request. `id` repeats, which `query` cannot express, so the whole query is built here. */
export function catalogUrl(namespace: string, catalogIds: readonly string[], locale: string): string {
  const q = new URLSearchParams();
  for (const id of catalogIds) q.append("id", id);
  q.set("includeDLCDetails", "false");
  q.set("includeMainGameDetails", "true");
  q.set("country", "US");
  q.set("locale", /^[a-z]{2}(-[A-Z]{2})?$/.test(locale) ? locale : "en");
  return `${CATALOG}${encodeURIComponent(namespace)}/bulk/items?${q.toString()}`;
}

/** Groups store ids by namespace, in chunks of CATALOG_CHUNK. */
export function catalogJobs(storeIds: readonly string[]): { namespace: string; catalogIds: string[] }[] {
  const byNs = new Map<string, string[]>();
  for (const id of storeIds) {
    const { namespace, catalogItemId } = splitStoreId(id);
    byNs.set(namespace, [...(byNs.get(namespace) ?? []), catalogItemId]);
  }
  const jobs: { namespace: string; catalogIds: string[] }[] = [];
  for (const [namespace, ids] of byNs) {
    for (let i = 0; i < ids.length; i += CATALOG_CHUNK) jobs.push({ namespace, catalogIds: ids.slice(i, i + CATALOG_CHUNK) });
  }
  return jobs;
}

function safeImage(u: unknown, onForeignHost: (host: string) => void): string | undefined {
  if (typeof u !== "string" || u.length > MAX_URL) return undefined;
  let url: URL;
  try {
    url = new URL(u);
  } catch {
    return undefined;
  }
  if (url.protocol !== "https:" || url.username !== "" || url.password !== "") return undefined;
  if (!EPIC_MEDIA_HOSTS.includes(url.hostname)) {
    onForeignHost(url.hostname); // only the host is reported (assumption E8)
    return undefined;
  }
  return u;
}

/** coverUrl/heroUrl from the `keyImages` of a catalog item. undefined if there is nothing usable. */
export function mediaFromItem(item: unknown, onForeignHost: (host: string) => void): EntryMedia | undefined {
  const images = isObject(item) && Array.isArray(item["keyImages"]) ? item["keyImages"] : [];
  const byType = (type: string): unknown => images.find((i) => isObject(i) && i["type"] === type && typeof i["url"] === "string");
  const pick = (...types: string[]): string | undefined => {
    for (const t of types) {
      const found = byType(t);
      const url = isObject(found) ? safeImage(found["url"], onForeignHost) : undefined;
      if (url) return url;
    }
    return undefined;
  };
  const coverUrl = pick("DieselGameBoxTall", "OfferImageTall");
  const heroUrl = pick("DieselGameBox", "OfferImageWide");
  return coverUrl || heroUrl ? { ...(coverUrl ? { coverUrl } : {}), ...(heroUrl ? { heroUrl } : {}) } : undefined;
}

export async function resolveEpicMedia(storeGameIds: readonly string[], ctx: MediaContext): Promise<ReadonlyMap<string, EntryMedia>> {
  const out = new Map<string, EntryMedia>();
  const ids = [...new Set(storeGameIds.filter((id) => STORE_ID_RE.test(id)))];
  if (ids.length === 0) return out; // no valid id: no application token either
  const token = await withTimeout(appToken(ctx), REQUEST_TIMEOUT_MS, "Epic token");
  const foreign = new Set<string>();

  await runPool(catalogJobs(ids), CATALOG_CONCURRENCY, ctx.signal, async (job) => {
    const res = await withTimeout(
      ctx.http.request({ method: "GET", url: catalogUrl(job.namespace, job.catalogIds, ctx.locale), headers: { authorization: bearer(token) } }),
      REQUEST_TIMEOUT_MS,
      "Epic catalog",
    );
    if (res.status === 404) return; // namespace unknown: nothing for these ids
    if (res.status !== 200) throwForStatus(res, "Epic catalog");
    const body = await withTimeout(res.json(), REQUEST_TIMEOUT_MS, "Epic catalog");
    if (!isObject(body)) throw new ConnectorError("store.unexpected-response", "Epic catalog answer is not an object");
    for (const catalogId of job.catalogIds) {
      const media = mediaFromItem(body[catalogId], (h) => foreign.add(h));
      // The store id is rebuilt from the job: ids that share a catalog id in one namespace all get the media.
      if (media) for (const id of ids) if (id.startsWith(`${job.namespace}:${catalogId}:`)) out.set(id, media);
    }
  });
  if (foreign.size > 0) ctx.log.info("Epic images from hosts outside mediaHosts were omitted", { hosts: [...foreign].slice(0, 5).join(",") });
  return out;
}
