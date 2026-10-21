import type { Clock } from "@ludiary/contracts";

/** Real clock. The core never touches Date or timers directly (ADR 38). */
export const systemClock: Clock = {
  now: () => Date.now(),
  timeout: (ms) => AbortSignal.timeout(ms),
};
