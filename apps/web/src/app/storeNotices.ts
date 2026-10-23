import type { StoreStatusDto } from "@ludiary/api-contract";

/** ADR 79: a scan that finished but could not look for new folders reports it as an error with state "idle": a warning, not a failure. */
export function scanWarningKey(status: Pick<StoreStatusDto, "sync">): string | null {
  return status.sync.find((x) => x.state === "idle" && x.error)?.error?.key ?? null;
}

/** ADR 79: Ubisoft only finds games with automatic detection. `undefined` means the settings have not loaded yet. */
export function needsAutoDetection(store: string, detection: string | null | undefined): boolean {
  return store === "ubisoft" && detection !== undefined && detection !== "auto-and-manual";
}
