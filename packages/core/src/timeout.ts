import { ConnectorError } from "@ludiary/contracts";
import { asKey } from "./errors";

export function timeoutError(): ConnectorError {
  return new ConnectorError("internal", "Connector call timed out", { messageKey: asKey("core.errors.timeout") });
}

/** Races the work against the abort signal, so a connector that ignores the signal cannot hang the scan. */
export async function withTimeout<T>(signal: AbortSignal, work: () => Promise<T>): Promise<T> {
  if (signal.aborted) throw timeoutError();
  let onAbort: (() => void) | undefined;
  const aborted = new Promise<never>((_, reject) => {
    onAbort = () => reject(timeoutError());
    signal.addEventListener("abort", onAbort, { once: true });
  });
  try {
    const running = work();
    running.catch(() => undefined); // a late failure after the timeout must not become an unhandled rejection
    return await Promise.race([running, aborted]);
  } finally {
    if (onAbort) signal.removeEventListener("abort", onAbort);
  }
}
