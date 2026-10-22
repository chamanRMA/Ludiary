// Scan plan (ADR 72, point 4): computed by the core, applied by db in one transaction.
import type { LocalFiles, StoreId } from "@ludiary/contracts";
import type { InstallationRecord, PropertyRecord, ScanPlan, ScanRootRecord, ScannedEntry, SyncStateRecord } from "./model";
import { insideAny, type ValidatedRoot } from "./validate";

export interface PlanInput {
  store: StoreId;
  at: number;
  newId: () => string;
  files: LocalFiles;
  entries: readonly ScannedEntry[];
  /** Paths of the roots in force (enabled and allowed by the detection mode). */
  roots: readonly string[];
  /** Paths among `roots` that could not be read. What lies under only those is kept. */
  unreadableRoots: readonly string[];
  properties: readonly PropertyRecord[];
  installations: readonly InstallationRecord[];
  discovered: { upsert: readonly ScanRootRecord[]; delete: readonly string[] };
  sync: SyncStateRecord;
}

export async function computeScanPlan(i: PlanInput): Promise<ScanPlan> {
  const byStoreId = new Map<string, PropertyRecord>();
  for (const p of i.properties) if (p.storeGameId !== null && p.kind === "game") byStoreId.set(p.storeGameId, p);
  const installByProperty = new Map(i.installations.map((x) => [x.propertyId, x]));

  const create: ScanPlan["create"][number][] = [];
  const update: ScanPlan["update"][number][] = [];
  const revive: string[] = [];
  const seenProperties = new Set<string>();
  for (const entry of i.entries) {
    const existing = byStoreId.get(entry.storeGameId);
    if (!existing) {
      create.push({ canonicalId: i.newId(), propertyId: i.newId(), installationId: i.newId(), entry });
      continue;
    }
    seenProperties.add(existing.id);
    update.push({ propertyId: existing.id, installationId: installByProperty.get(existing.id)?.id ?? i.newId(), entry });
    if (existing.removedAt !== null) revive.push(existing.id);
  }

  const unreadable = new Set(i.unreadableRoots.map((r) => i.files.compareKey(r)));
  const readable = i.roots.filter((r) => !unreadable.has(i.files.compareKey(r)));
  const removeInstallations: string[] = [];
  const removed = new Set<string>();
  for (const inst of i.installations) {
    if (seenProperties.has(inst.propertyId)) continue;
    const underCurrent = await insideAny(i.files, inst.installPath, i.roots);
    // Not under any root in force (folder disabled or removed, detection changed): it goes.
    // Under a root that was read and the game did not show up: it goes. Only under unreadable roots: kept.
    if (!underCurrent || (await insideAny(i.files, inst.installPath, readable))) {
      removeInstallations.push(inst.id);
      removed.add(inst.id);
    }
  }

  const remaining = new Map<string, number>();
  for (const inst of i.installations) {
    if (!removed.has(inst.id)) remaining.set(inst.propertyId, (remaining.get(inst.propertyId) ?? 0) + 1);
  }
  const retire: string[] = [];
  for (const p of i.properties) {
    if (p.owned || p.removedAt !== null || seenProperties.has(p.id)) continue;
    if ((remaining.get(p.id) ?? 0) === 0) retire.push(p.id);
  }

  return {
    store: i.store,
    at: i.at,
    create,
    update,
    removeInstallations,
    retireProperties: retire,
    reviveProperties: revive,
    upsertDiscoveredRoots: i.discovered.upsert,
    deleteRoots: i.discovered.delete,
    sync: i.sync,
  };
}

/** Discovered roots to store: new ones enabled, known ones keep id and switch; stored ones the connector stopped returning are deleted. */
export function planDiscoveredRoots(
  store: StoreId,
  returned: readonly ValidatedRoot[],
  stored: readonly ScanRootRecord[],
  newId: () => string,
): { upsert: ScanRootRecord[]; delete: string[] } {
  const mine = stored.filter((r) => r.origin === "discovered" && r.store === store);
  const byKey = new Map(mine.map((r) => [r.pathKey, r]));
  const upsert = returned.map((r): ScanRootRecord => {
    const known = byKey.get(r.pathKey);
    return {
      id: known?.id ?? newId(),
      origin: "discovered",
      path: r.path,
      pathKey: r.pathKey,
      declarationId: r.declarationId,
      store,
      tag: r.tag,
      enabled: known ? known.enabled : true,
    };
  });
  const keep = new Set(returned.map((r) => r.pathKey));
  return { upsert, delete: mine.filter((r) => !keep.has(r.pathKey)).map((r) => r.id) };
}
