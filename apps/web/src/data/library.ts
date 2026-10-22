import type { GameSummaryDto, StoreId } from "@ludiary/api-contract";

export interface LibraryFilter {
  store?: StoreId | "local";
  installed?: boolean;
  favorite?: boolean;
  query?: string;
}

/** Library filters by store and install state (CLAUDE.md), plus free-text search. "local" = games with no store property. */
export function filterGames(games: readonly GameSummaryDto[], f: LibraryFilter): GameSummaryDto[] {
  const q = f.query?.trim().toLowerCase();
  return games.filter(
    (g) =>
      (f.store === undefined || (f.store === "local" ? g.stores.length === 0 : g.stores.includes(f.store))) &&
      (f.installed === undefined || g.installed === f.installed) &&
      (!f.favorite || g.favorite) &&
      (!q || g.title.toLowerCase().includes(q) || g.tags.some((tag) => tag.toLowerCase().includes(q))),
  );
}

/** ADR 74: what the main button of a game does. Without `mainAction` (older answers, simulator) the old rule holds. */
export function primaryAction(g: Pick<GameSummaryDto, "installed" | "mainAction">): "play" | "install" | "store" {
  if (g.mainAction === "install") return "install";
  if (g.mainAction === "play" || g.installed) return "play";
  return "store";
}

/** ADR 74 point 12: the store connection is gone, so this entry may be out of date. */
export const isUnsynced = (g: Pick<GameSummaryDto, "unsynced">): boolean => g.unsynced === true;
