// Library plan (ADR 74 point 7): computed by the core, applied by db in one transaction.
// Same storeGameId = same property (the unique index), whether the scan or the library saw it first.
import type { StoreId } from "@ludiary/contracts";
import type { InstallationRecord, LibraryEntry, LibraryPlan, PropertyRecord, SyncStateRecord } from "./model";

export function computeLibraryPlan(i: {
  store: StoreId;
  at: number;
  newId: () => string;
  entries: readonly LibraryEntry[];
  /** false: a missing game proves nothing, so nothing is disowned. */
  complete: boolean;
  properties: readonly PropertyRecord[];
  installations: readonly InstallationRecord[];
  sync: SyncStateRecord;
}): LibraryPlan {
  const byStoreId = new Map<string, PropertyRecord>();
  for (const p of i.properties) if (p.storeGameId !== null && p.kind === "game") byStoreId.set(p.storeGameId, p);

  const create: LibraryPlan["create"][number][] = [];
  const update: LibraryPlan["update"][number][] = [];
  const seen = new Set<string>();
  for (const entry of i.entries) {
    const existing = byStoreId.get(entry.storeGameId);
    if (!existing) {
      create.push({ canonicalId: i.newId(), propertyId: i.newId(), entry });
      continue;
    }
    seen.add(existing.id);
    update.push({ propertyId: existing.id, entry });
  }

  const disown: string[] = [];
  const retire: string[] = [];
  if (i.complete) {
    const installed = new Set(i.installations.map((x) => x.propertyId));
    for (const p of i.properties) {
      if (!p.owned || p.kind !== "game" || seen.has(p.id)) continue;
      disown.push(p.id);
      if (!installed.has(p.id)) retire.push(p.id);
    }
  }
  return { store: i.store, at: i.at, create, update, disown, retire, sync: i.sync };
}
