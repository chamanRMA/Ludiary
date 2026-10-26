// Scan plan (ADR 72, point 4): computed by the core, applied by db in one transaction.
import type { LocalFiles, StoreId } from "@ludiary/contracts";
import { planLinks, type LinkNode } from "./dlc";
import type { InstallationRecord, KindChange, PropertyRecord, ScanPlan, ScanRootRecord, ScannedEntry, SyncStateRecord } from "./model";
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
  for (const p of i.properties) if (p.storeGameId !== null) byStoreId.set(p.storeGameId, p);
  const installByProperty = new Map(i.installations.map((x) => [x.propertyId, x]));

  const nodes = new Map<string, LinkNode>(
    i.properties.map((p) => [p.id, { id: p.id, storeGameId: p.storeGameId, kind: p.kind, canonicalId: p.canonicalGameId, baseStoreGameId: p.baseStoreGameId, removed: p.removedAt !== null }]),
  );
  const create: { -readonly [K in keyof ScanPlan["create"][number]]: ScanPlan["create"][number][K] }[] = [];
  const update: ScanPlan["update"][number][] = [];
  const revive: string[] = [];
  const kindWanted: { propertyId: string; kind: "game" | "dlc" }[] = [];
  const seenProperties = new Set<string>();
  let kindConflicts = 0;
  for (const entry of i.entries) {
    const existing = byStoreId.get(entry.storeGameId);
    if (!existing) {
      const propertyId = i.newId();
      const canonicalId = entry.kind === "game" ? i.newId() : null;
      create.push({ canonicalId, propertyId, installationId: i.newId(), entry });
      nodes.set(propertyId, { id: propertyId, storeGameId: entry.storeGameId, kind: entry.kind, canonicalId, baseStoreGameId: entry.kind === "dlc" ? (entry.baseStoreGameId ?? null) : null, removed: false });
      continue;
    }
    seenProperties.add(existing.id);
    if (existing.removedAt !== null) revive.push(existing.id);
    const node = nodes.get(existing.id)!;
    node.removed = false;
    // ADR 83 A1: the scan never changes the kind of an owned row; the library has the last word on those.
    let kind = existing.kind;
    if (entry.kind !== existing.kind) {
      // A DLC deduced from its title weighs less than an installation seen as a game (ADR 83, audit).
      if (existing.owned && !(existing.kind === "dlc" && existing.dlcInferred === true && entry.kind === "game")) kindConflicts++;
      else {
        kind = entry.kind;
        kindWanted.push({ propertyId: existing.id, kind });
      }
    }
    node.kind = kind;
    node.baseStoreGameId = kind === "dlc" ? (entry.baseStoreGameId ?? existing.baseStoreGameId) : null;
    if (kind === "game" && existing.kind === "dlc") node.canonicalId = i.newId();
    const installationId = installByProperty.get(existing.id)?.id ?? i.newId();
    update.push({ propertyId: existing.id, installationId, entry: entry.kind === "dlc" ? { ...entry, baseStoreGameId: node.baseStoreGameId } : entry });
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
    if ((remaining.get(p.id) ?? 0) === 0) {
      retire.push(p.id);
      nodes.get(p.id)!.removed = true;
    }
  }

  const fresh = new Set([...create.map((c) => c.propertyId), ...kindWanted.map((k) => k.propertyId)]);
  const { resolved, dlcLinks } = planLinks(nodes, fresh, new Map(i.properties.map((p) => [p.id, p.canonicalGameId])));
  for (const c of create) if (c.entry.kind === "dlc") c.canonicalId = resolved.get(c.propertyId) ?? null;
  const kindChanges: KindChange[] = kindWanted.map((k) => ({ propertyId: k.propertyId, kind: k.kind, canonicalId: k.kind === "dlc" ? (resolved.get(k.propertyId) ?? null) : nodes.get(k.propertyId)!.canonicalId }));

  return {
    store: i.store,
    at: i.at,
    create,
    update,
    removeInstallations,
    retireProperties: retire,
    reviveProperties: revive,
    kindChanges,
    dlcLinks,
    kindConflicts,
    upsertDiscoveredRoots: i.discovered.upsert,
    deleteRoots: i.discovered.delete,
    sync: i.sync,
  };
}

/**
 * Discovered roots to store: new ones enabled, known ones keep id and switch; stored ones the connector stopped returning are deleted.
 * Not deleted (returned in `kept`): when `lossy`, or when their declaration could not be resolved (ADR 79).
 * A folder already stored for another store is skipped and counted in `conflicts`.
 */
export function planDiscoveredRoots(
  store: StoreId,
  returned: readonly ValidatedRoot[],
  stored: readonly ScanRootRecord[],
  newId: () => string,
  opts: { keepDeclarations?: ReadonlySet<string>; lossy?: boolean } = {},
): { upsert: ScanRootRecord[]; delete: string[]; kept: ScanRootRecord[]; conflicts: number } {
  const discovered = stored.filter((r) => r.origin === "discovered");
  const mine = discovered.filter((r) => r.store === store);
  const others = new Set(discovered.filter((r) => r.store !== store).map((r) => r.pathKey));
  const byKey = new Map(mine.map((r) => [r.pathKey, r]));
  const own = returned.filter((r) => !others.has(r.pathKey));
  const upsert = own.map((r): ScanRootRecord => {
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
  const returnedKeys = new Set(own.map((r) => r.pathKey));
  const gone = mine.filter((r) => !returnedKeys.has(r.pathKey));
  const keeps = (r: ScanRootRecord) => opts.lossy === true || (r.declarationId !== null && opts.keepDeclarations?.has(r.declarationId) === true);
  return {
    upsert,
    delete: gone.filter((r) => !keeps(r)).map((r) => r.id),
    kept: gone.filter(keeps),
    conflicts: returned.length - own.length,
  };
}
