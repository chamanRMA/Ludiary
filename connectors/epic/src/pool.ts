import { ConnectorError } from "@ludiary/contracts";

/** Races a promise against a timer. The underlying request is not cancelled (HttpClient has no per-request signal). */
export function withTimeout<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new ConnectorError("store.unexpected-response", `${what} timed out`)), ms);
  });
  p.catch(() => undefined);
  return Promise.race([p, timeout]).finally(() => clearTimeout(timer));
}

/**
 * Runs `work` over `items` with at most `limit` in flight. The first failure stops new work and rejects at once,
 * without waiting for requests already in flight.
 */
export async function runPool<T>(items: readonly T[], limit: number, signal: AbortSignal, work: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  let failed = false;
  let fail!: (e: unknown) => void;
  const stopped = new Promise<never>((_, reject) => {
    fail = reject;
  });
  stopped.catch(() => undefined);
  const worker = async (): Promise<void> => {
    while (!failed && next < items.length) {
      signal.throwIfAborted();
      const item = items[next++] as T;
      try {
        await work(item);
      } catch (e) {
        if (!failed) {
          failed = true;
          fail(e);
        }
      }
    }
  };
  const workers = Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  workers.catch(() => undefined);
  await Promise.race([workers, stopped]);
}
