// Roots in force for a store (ADR 72): the one rule shared by the scan and the launch check.
import type { StoreId } from "@ludiary/contracts";
import type { ScanRootRecord } from "./model";

/** 'later': none. 'manual-only': enabled user roots. 'auto-and-manual': those plus the store's enabled discovered roots. */
export function storedActiveRoots(mode: string, stored: readonly ScanRootRecord[], store: StoreId): ScanRootRecord[] {
  if (mode === "later") return [];
  return stored.filter((r) => r.enabled && (r.origin === "user" || (mode === "auto-and-manual" && r.store === store)));
}
