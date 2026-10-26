// DLC linking (ADR 83 point 5). Pure: the same function serves the library plan and the scan plan.
import type { DlcLink } from "./model";

/** A property of one store as it will be at the end of the plan. */
export interface LinkNode {
  id: string;
  storeGameId: string | null;
  kind: "game" | "dlc";
  canonicalId: string | null;
  baseStoreGameId: string | null;
  removed: boolean;
}

/**
 * The wanted canonical game of every DLC: the one of the live `game` property of the same store whose storeGameId is the DLC's
 * base; null (orphan, ADR 52) if there is none. A retired base turns its DLC into orphans; a base that arrives links them.
 */
export function linkDlc(nodes: Iterable<LinkNode>): Map<string, string | null> {
  const list = [...nodes];
  const games = new Map<string, string | null>();
  for (const n of list) if (n.kind === "game" && !n.removed && n.storeGameId !== null) games.set(n.storeGameId, n.canonicalId);
  const out = new Map<string, string | null>();
  for (const n of list) if (n.kind === "dlc") out.set(n.id, n.baseStoreGameId === null ? null : (games.get(n.baseStoreGameId) ?? null));
  return out;
}

/**
 * Splits the wanted links: `resolved` for every DLC, and `dlcLinks` for the stored ones whose canonical changes.
 * `fresh` (created or kind-changed rows) get their canonical from the plan itself, so they are not listed.
 */
export function planLinks(
  nodes: ReadonlyMap<string, LinkNode>,
  fresh: ReadonlySet<string>,
  current: ReadonlyMap<string, string | null>,
): { resolved: Map<string, string | null>; dlcLinks: DlcLink[] } {
  const resolved = linkDlc(nodes.values());
  const dlcLinks: DlcLink[] = [];
  for (const [propertyId, canonicalId] of resolved) {
    if (!fresh.has(propertyId) && current.get(propertyId) !== canonicalId) dlcLinks.push({ propertyId, canonicalId });
  }
  return { resolved, dlcLinks };
}
