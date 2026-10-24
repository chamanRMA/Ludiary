import type { StoreStatusDto } from "@ludiary/api-contract";

/** ADR 79: a scan that finished but could not look for new folders reports it as an error with state "idle": a warning, not a failure. */
export function scanWarningKey(status: Pick<StoreStatusDto, "sync">): string | null {
  return status.sync.find((x) => x.state === "idle" && x.error)?.error?.key ?? null;
}

/** ADR 79: Ubisoft only finds games with automatic detection. `undefined` means the settings have not loaded yet. */
export function needsAutoDetection(store: string, detection: string | null | undefined): boolean {
  return store === "ubisoft" && detection !== undefined && detection !== "auto-and-manual";
}

/** Mirrors the core's MANUAL_SYNC_FLOOR_MS (decision 50, revised): the web only uses it to tell the user the time. */
export const FORCED_SYNC_GAP_MS = 60_000;

type SyncStores = readonly Pick<StoreStatusDto, "store" | "sync" | "connection">[];
const libraryOf = (s: SyncStores[number]) => (s.connection === "connected" ? s.sync.find((x) => x.operation === "library") : undefined); // a disconnected store has nothing to sync

/** Stores synced recently (inside their minimum interval): pressing Sync needs the user's confirmation. */
export function recentlySynced(stores: SyncStores, now: number): StoreStatusDto["store"][] {
  return stores.filter((s) => (libraryOf(s)?.nextAllowedAt ?? 0) > now).map((s) => s.store);
}

/** Stores inside the minute between two forced syncs, with the time it ends. */
export function syncWaits(stores: SyncStores, now: number): { store: StoreStatusDto["store"]; at: number }[] {
  return stores.flatMap((s) => {
    const last = libraryOf(s)?.lastAttemptAt;
    return last !== undefined && last + FORCED_SYNC_GAP_MS > now ? [{ store: s.store, at: last + FORCED_SYNC_GAP_MS }] : [];
  });
}
