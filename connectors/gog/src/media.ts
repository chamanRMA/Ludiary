// Vertical covers from GOG's GamesDB, no account (ADR 76, point 5).
import { ConnectorError, type EntryMedia, type MediaContext } from "@ludiary/contracts";
import { PRODUCT_ID_RE } from "./info";

export const GOG_API_HOSTS: readonly string[] = ["gamesdb.gog.com"];
export const GOG_MEDIA_HOSTS: readonly string[] = ["images.gog.com"];

const URL_BASE = "https://gamesdb.gog.com/platforms/gog/external_releases/";
const FORMAT_RE = /^https:\/\/images\.gog\.com\/[0-9a-f]{64}\{formatter\}\.\{ext\}(\?namespace=gamesdb)?$/;
const FINAL_RE = /^https:\/\/images\.gog\.com\/[0-9a-f]{64}\.jpg(\?namespace=gamesdb)?$/;
const REQUEST_TIMEOUT_MS = 8000;
const CONCURRENCY = 6; // so a batch of 50 fits the 15 s of the media step (ADR 73, G8)

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** Retry-After in seconds (the HTTP-date form is ignored). */
function retryAfterMs(headers: Readonly<Record<string, string>>): number | undefined {
  const raw = Object.entries(headers).find(([k]) => k.toLowerCase() === "retry-after")?.[1];
  if (raw === undefined || !/^\d{1,6}$/.test(raw.trim())) return undefined;
  return Number(raw.trim()) * 1000;
}

function imageUrl(node: unknown): string | undefined {
  const format = isObject(node) ? node["url_format"] : undefined;
  if (typeof format !== "string" || !FORMAT_RE.test(format)) return undefined;
  const url = format.replace("{formatter}", "").replace("{ext}", "jpg");
  return FINAL_RE.test(url) ? url : undefined;
}

export async function resolveGogMedia(
  storeGameIds: readonly string[],
  ctx: MediaContext,
): Promise<ReadonlyMap<string, EntryMedia>> {
  const out = new Map<string, EntryMedia>();
  const ids = [...new Set(storeGameIds.filter((id) => PRODUCT_ID_RE.test(id)))];
  let next = 0;
  let failure: ConnectorError | undefined;

  // HttpClient has no per-request signal or timeout: the batch is abandoned by racing each request against this
  // controller and a timer. Requests already in flight finish on their own; nothing here closes their sockets.
  const batch = new AbortController();
  const stopped = new Promise<never>((_, reject) => {
    batch.signal.addEventListener("abort", () => reject(batch.signal.reason), { once: true });
  });
  stopped.catch(() => undefined);
  const guarded = <T>(p: Promise<T>): Promise<T> => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new ConnectorError("store.unexpected-response", "GamesDB request timed out")), REQUEST_TIMEOUT_MS);
    });
    p.catch(() => undefined);
    return Promise.race([p, stopped, timeout]).finally(() => clearTimeout(timer));
  };

  const one = async (id: string): Promise<void> => {
    if (!PRODUCT_ID_RE.test(id)) return; // checked again right before building the URL
    const res = await guarded(ctx.http.request({ method: "GET", url: URL_BASE + id }));
    if (res.status === 404) return; // not in GamesDB: the core marks it resolved and empty
    if (res.status === 429) {
      const ms = retryAfterMs(res.headers);
      throw new ConnectorError("store.rate-limited", "GamesDB answered 429", ms === undefined ? {} : { retryAfterMs: ms });
    }
    if (res.status !== 200) throw new ConnectorError("store.unexpected-response", `GamesDB answered ${res.status}`);
    const body = await guarded(res.json());
    const game = isObject(body) ? body["game"] : undefined;
    if (!isObject(game)) throw new ConnectorError("store.unexpected-response", "GamesDB answer has no game");
    const coverUrl = imageUrl(game["vertical_cover"]);
    const heroUrl = imageUrl(game["background"]);
    if (coverUrl || heroUrl) out.set(id, { ...(coverUrl ? { coverUrl } : {}), ...(heroUrl ? { heroUrl } : {}) });
  };

  const worker = async (): Promise<void> => {
    while (failure === undefined && next < ids.length) {
      ctx.signal.throwIfAborted();
      const id = ids[next++] as string;
      try {
        await one(id);
      } catch (e) {
        // Throwing (not skipping) matters: the core marks every requested id resolved if the call returns.
        if (!(e instanceof ConnectorError)) throw e;
        failure ??= e;
        batch.abort(failure); // in-flight requests are no longer waited for and no new one starts
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, ids.length) }, worker));
  if (failure !== undefined) throw failure;
  return out;
}
