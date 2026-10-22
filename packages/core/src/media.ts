// Media step at the end of a scan (ADR 73): current artwork of stored properties through the connector's resolveMedia.
// It never fails the scan: a problem is a warning and a wait before the next attempt.
import { ConnectorError } from "@ludiary/contracts";
import type { ConnectorLogger, EntryMedia, StoreConnector, StoreId } from "@ludiary/contracts";
import { MEDIA_BATCH, MEDIA_MAX_AGE_MS, MEDIA_MAX_BATCHES, MEDIA_TIMEOUT_MS, MAX_MEDIA_RETRY_MS, type Env } from "./env";
import { toErrorInfo } from "./errors";
import { withTimeout } from "./timeout";
import { validateMedia } from "./validate";

export interface MediaStep {
  canRun(c: StoreConnector): boolean;
  run(c: StoreConnector, locale: string, log: ConnectorLogger): Promise<void>;
}

export function createMediaStep(env: Env): MediaStep {
  const { deps } = env;
  /** In memory: after a restart one attempt is allowed. */
  const waitUntil = new Map<StoreId, number>();

  async function run(c: StoreConnector, locale: string, log: ConnectorLogger): Promise<void> {
    const resolveMedia = c.resolveMedia;
    if (!deps.http || !resolveMedia) return;
    const t0 = deps.clock.now();
    if ((waitUntil.get(c.id) ?? 0) > t0) return;
    const signal = deps.clock.timeout(MEDIA_TIMEOUT_MS);
    try {
      const http = deps.http(c.apiHosts, signal, log);
      let resolved = 0;
      for (let i = 0; i < MEDIA_MAX_BATCHES; i++) {
        const now = deps.clock.now();
        const ids = await deps.library.listMediaPending(c.id, now - MEDIA_MAX_AGE_MS, MEDIA_BATCH);
        if (ids.length === 0) break;
        const answer = await withTimeout(signal, () => resolveMedia.call(c, ids, { signal, log, locale, http }));
        if (!(answer instanceof Map)) throw new ConnectorError("store.unexpected-response", "resolveMedia did not return a Map");
        const requested = new Set(ids);
        const valid = new Map<string, EntryMedia>();
        for (const [id, m] of answer as Map<unknown, unknown>) {
          if (typeof id !== "string" || !requested.has(id)) continue;
          const v = validateMedia(m, c.mediaHosts);
          if (v) valid.set(id, v);
        }
        await deps.library.setResolvedMedia(c.id, valid, ids, deps.clock.now());
        resolved += ids.length;
      }
      if (resolved > 0) log.info("Media resolved", { count: resolved });
    } catch (e) {
      // A server-provided Retry-After is capped at a day: it only delays covers, never blocks them for weeks.
      const retry = Math.min(e instanceof ConnectorError ? (e.details.retryAfterMs ?? 0) : 0, MAX_MEDIA_RETRY_MS);
      waitUntil.set(c.id, deps.clock.now() + Math.max(c.minSyncIntervalMs, retry));
      deps.log.warn("Media step failed", { connector: c.id, code: toErrorInfo(e).code });
    }
  }

  return { canRun: (c) => deps.http !== undefined && c.resolveMedia !== undefined, run };
}
