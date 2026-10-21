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
