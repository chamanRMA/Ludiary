// Library plan (ADR 74 point 7, ADR 83): computed by the core, applied by db in one transaction.
// Same storeGameId = same property (the unique index), whether the scan or the library saw it first.
import type { StoreId } from "@ludiary/contracts";
import { planLinks, type LinkNode } from "./dlc";
import type { InstallationRecord, KindChange, LibraryEntry, LibraryPlan, PropertyRecord, SyncStateRecord } from "./model";

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
  for (const p of i.properties) if (p.storeGameId !== null) byStoreId.set(p.storeGameId, p);
  const installed = new Set(i.installations.map((x) => x.propertyId));
  const nodes = new Map<string, LinkNode>(
    i.properties.map((p) => [p.id, { id: p.id, storeGameId: p.storeGameId, kind: p.kind, canonicalId: p.canonicalGameId, baseStoreGameId: p.baseStoreGameId, removed: p.removedAt !== null }]),
  );

  const create: { canonicalId: string | null; propertyId: string; entry: LibraryEntry }[] = [];
  const update: LibraryPlan["update"][number][] = [];
  const kindWanted: { propertyId: string; kind: "game" | "dlc" }[] = [];
  const seen = new Set<string>();
  let kindConflicts = 0;
  for (const entry of i.entries) {
    const existing = byStoreId.get(entry.storeGameId);
    if (!existing) {
      const propertyId = i.newId();
      const canonicalId = entry.kind === "game" ? i.newId() : null;
      create.push({ canonicalId, propertyId, entry });
      nodes.set(propertyId, { id: propertyId, storeGameId: entry.storeGameId, kind: entry.kind, canonicalId, baseStoreGameId: entry.kind === "dlc" ? (entry.baseStoreGameId ?? null) : null, removed: false });
      continue;
    }
    seen.add(existing.id);
    const node = nodes.get(existing.id)!;
    node.removed = false;
    // ADR 83 A1: an installation the scan saw as a game is not turned into a DLC by the library.
    let kind = existing.kind;
    if (entry.kind !== existing.kind) {
      if (entry.kind === "dlc" && installed.has(existing.id)) kindConflicts++;
      else {
        kind = entry.kind;
        kindWanted.push({ propertyId: existing.id, kind });
      }
    }
    node.kind = kind;
    // The base is the scan's while it is installed; a library entry without base keeps the known one.
    const base = existing.baseStoreGameId !== null && installed.has(existing.id) ? existing.baseStoreGameId : (entry.baseStoreGameId ?? existing.baseStoreGameId);
    node.baseStoreGameId = kind === "dlc" ? base : null;
    if (kind === "game" && existing.kind === "dlc") node.canonicalId = i.newId();
    update.push({ propertyId: existing.id, entry: entry.kind === "dlc" ? { ...entry, baseStoreGameId: node.baseStoreGameId } : entry });
  }

  const disown: string[] = [];
  const retire: string[] = [];
  if (i.complete) {
    for (const p of i.properties) {
      if (!p.owned || seen.has(p.id)) continue;
      disown.push(p.id);
      if (!installed.has(p.id)) {
        retire.push(p.id);
        nodes.get(p.id)!.removed = true;
      }
    }
  }

  const fresh = new Set([...create.map((c) => c.propertyId), ...kindWanted.map((k) => k.propertyId)]);
  const { resolved, dlcLinks } = planLinks(nodes, fresh, new Map(i.properties.map((p) => [p.id, p.canonicalGameId])));
  for (const c of create) if (c.entry.kind === "dlc") c.canonicalId = resolved.get(c.propertyId) ?? null;
  const kindChanges: KindChange[] = kindWanted.map((k) => ({ propertyId: k.propertyId, kind: k.kind, canonicalId: k.kind === "dlc" ? (resolved.get(k.propertyId) ?? null) : nodes.get(k.propertyId)!.canonicalId }));
  return { store: i.store, at: i.at, create, update, disown, retire, kindChanges, dlcLinks, kindConflicts, sync: i.sync };
}
