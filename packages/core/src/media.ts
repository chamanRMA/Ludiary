// Media step at the end of a scan (ADR 73): current artwork of stored properties through the connector's resolveMedia.
// ADR 84: right after it, titles of stored DLC through resolveTitles. Both share one wait per store.
// It never fails the scan: a problem is a warning and a wait before the next attempt.
import { ConnectorError } from "@ludiary/contracts";
import type { ConnectorLogger, EntryMedia, MediaContext, StoreConnector, StoreId } from "@ludiary/contracts";
import { MEDIA_BATCH, MEDIA_MAX_AGE_MS, MEDIA_MAX_BATCHES, MEDIA_TIMEOUT_MS, MAX_MEDIA_RETRY_MS, type Env } from "./env";
import { toErrorInfo } from "./errors";
import { withTimeout } from "./timeout";
import { cleanTitle, validateMedia } from "./validate";

export interface MediaStep {
  canRun(c: StoreConnector): boolean;
  run(c: StoreConnector, locale: string, log: ConnectorLogger): Promise<void>;
}

export function createMediaStep(env: Env): MediaStep {
  const { deps } = env;
  /** In memory: after a restart one attempt is allowed. Shared by covers and titles (ADR 84 M1). */
  const waitUntil = new Map<StoreId, number>();

  /** Runs `batch` over pending ids until none is left. Returns false if it failed (and sets the wait). Never throws. */
  async function pass(
    c: StoreConnector,
    locale: string,
    log: ConnectorLogger,
    label: string,
    list: (olderThan: number) => Promise<readonly string[]>,
    batch: (ids: readonly string[], ctx: MediaContext) => Promise<void>,
  ): Promise<boolean> {
    const signal = deps.clock.timeout(MEDIA_TIMEOUT_MS);
    try {
      const http = deps.http!(c.apiHosts, signal, log);
      let resolved = 0;
      for (let i = 0; i < MEDIA_MAX_BATCHES; i++) {
        const ids = await list(deps.clock.now() - MEDIA_MAX_AGE_MS);
        if (ids.length === 0) break;
        await batch(ids, { signal, log, locale, http });
        resolved += ids.length;
      }
      if (resolved > 0) log.info(`${label} resolved`, { count: resolved });
      return true;
    } catch (e) {
      // A server-provided Retry-After is capped at a day: it only delays covers and titles, never blocks them for weeks.
      const retry = Math.min(e instanceof ConnectorError ? (e.details.retryAfterMs ?? 0) : 0, MAX_MEDIA_RETRY_MS);
      waitUntil.set(c.id, deps.clock.now() + Math.max(c.minSyncIntervalMs, retry));
      deps.log.warn(`${label} step failed`, { connector: c.id, code: toErrorInfo(e).code });
      return false;
    }
  }

  async function run(c: StoreConnector, locale: string, log: ConnectorLogger): Promise<void> {
    const { resolveMedia, resolveTitles } = c;
    if (!deps.http || (!resolveMedia && !resolveTitles)) return;
    if ((waitUntil.get(c.id) ?? 0) > deps.clock.now()) return;
    let ok = true;
    if (resolveMedia) {
      ok = await pass(
        c,
        locale,
        log,
        "Media",
        (olderThan) => deps.library.listMediaPending(c.id, olderThan, MEDIA_BATCH),
        async (ids, ctx) => {
          const answer = await withTimeout(ctx.signal, () => resolveMedia.call(c, ids, ctx));
          if (!(answer instanceof Map)) throw new ConnectorError("store.unexpected-response", "resolveMedia did not return a Map");
          const requested = new Set(ids);
          const valid = new Map<string, EntryMedia>();
          for (const [id, m] of answer as Map<unknown, unknown>) {
            if (typeof id !== "string" || !requested.has(id)) continue;
            const v = validateMedia(m, c.mediaHosts);
            if (v) valid.set(id, v);
          }
          await deps.library.setResolvedMedia(c.id, valid, ids, deps.clock.now());
        },
      );
    }
    // ADR 84 M1: if covers just failed (429 included), titles wait for the next pass.
    if (!ok || !resolveTitles) return;
    await pass(
      c,
      locale,
      log,
      "Titles",
      (olderThan) => deps.library.listTitlePending(c.id, olderThan, MEDIA_BATCH),
      async (ids, ctx) => {
        const answer = await withTimeout(ctx.signal, () => resolveTitles.call(c, ids, ctx));
        if (!(answer instanceof Map)) throw new ConnectorError("store.unexpected-response", "resolveTitles did not return a Map");
        const requested = new Set(ids);
        const valid = new Map<string, string>();
        for (const [id, t] of answer as Map<unknown, unknown>) {
          if (typeof id !== "string" || !requested.has(id)) continue;
          const v = cleanTitle(t);
          if (v) valid.set(id, v);
        }
        await deps.library.setResolvedTitles(c.id, valid, ids, deps.clock.now());
      },
    );
  }

  return { canRun: (c) => deps.http !== undefined && (c.resolveMedia !== undefined || c.resolveTitles !== undefined), run };
}
