import type { GamePricesDto, GameSummaryDto, PriceBoardDto, PricesDto, PriceSearchResultDto, ServiceStatusDto, StoreId, WatchItemDto } from "@ludiary/api-contract";
import type { LudiaryApi } from "./api";
import { ApiError } from "./http";

/** Simulator of the price comparison (ADR 86). Same rules as the server: needs a key and a country, 1 minute floor, 500 followed. */
type PricesApi = Pick<LudiaryApi, "getGamePrices" | "getPriceBoard" | "refreshPrices" | "setPriceExclusion" | "searchPrices" | "watchPrice" | "unwatchPrice">;

export interface MockPricesDeps {
  library(): readonly GameSummaryDto[];
  service(): ServiceStatusDto["status"];
  prices(): { country: string | null; shops: "ludiary" | "all" };
  now(): number;
}

const CATALOG = ["Hades II", "Hades", "Celeste", "Hollow Knight: Silksong", "Stardew Valley", "Portal 2", "Disco Elysium", "Elden Ring", "Dead Cells", "Balatro", "Hollow Knight"];
const SHOPS: { storeId: StoreId | null; name: string }[] = [
  { storeId: "steam", name: "Steam" },
  { storeId: "gog", name: "GOG" },
  { storeId: "epic", name: "Epic Game Store" },
  { storeId: null, name: "Fanatical" },
];
const CURRENCY: Record<string, string> = { ES: "EUR", US: "USD", GB: "GBP" };
const hashOf = (text: string): number => [...text].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 100_003, 7);
const err = (status: number, code: string, key: string) => new ApiError(status, code, key);

function dealsFor(seed: string, country: string, shops: "ludiary" | "all", at: number): PricesDto {
  const h = hashOf(seed);
  const currency = CURRENCY[country] ?? "EUR";
  const regular = 1999 + (h % 5) * 1000;
  const deals = SHOPS.filter((s) => shops === "all" || s.storeId !== null).map((shop, i) => {
    const cut = (h + i * 17) % 80;
    return {
      shop,
      amountMinor: Math.round((regular * (100 - cut)) / 100),
      regularMinor: regular,
      currency,
      cut,
      voucher: i === 1 ? "MOCK10" : null,
      url: `https://itad.link/mock/${encodeURIComponent(seed)}/${i}/`,
    };
  });
  return { country, fetchedAt: at, stale: false, deals, historyLow: { amountMinor: Math.round(regular * 0.2), currency } };
}

export function createMockPrices(d: MockPricesDeps): PricesApi {
  const excluded = new Set<string>();
  const fetched = new Map<string, number>(); // key -> when, by country+shops
  const watch: { id: string; title: string; type: "game" | "dlc" | "package" | null }[] = [];
  const results = new Map<string, { title: string; type: "game" | "dlc" | "package" | null }>();
  let lastManual = -Infinity;
  const fkey = (id: string) => `${id}|${d.prices().country}|${d.prices().shops}`;
  const state = () => ({ service: d.service(), needsCountry: d.prices().country === null });
  const ownedOf = (title: string): string | undefined => d.library().find((g) => g.title.toLowerCase() === title.toLowerCase())?.id;

  function view(seed: string): PricesDto | null {
    const at = fetched.get(fkey(seed));
    const { country, shops } = d.prices();
    return at !== undefined && country ? dealsFor(seed, country, shops, at) : null;
  }
  // A game whose id hashes to a multiple of 7 is "not found", so the simulator shows that state too.
  const linkOf = (id: string): GamePricesDto["link"] => (excluded.has(id) ? "excluded" : !fetched.has(fkey(id)) ? "pending" : hashOf(id) % 7 === 0 ? "not-found" : "found");

  return {
    async getGamePrices(id) {
      if (!d.library().some((g) => g.id === id)) throw err(404, "not-found", "core.errors.not-found");
      const link = linkOf(id);
      return { ...state(), link, prices: link === "found" ? view(id) : null };
    },
    async getPriceBoard(): Promise<PriceBoardDto> {
      const items: WatchItemDto[] = watch.map((w) => {
        const owned = ownedOf(w.title);
        return { id: w.id, title: w.title, type: w.type, ...(owned ? { ownedGameId: owned } : {}), prices: view(w.id) };
      });
      const best = (i: WatchItemDto) => Math.max(-1, ...(i.prices?.deals.map((x) => x.cut) ?? []));
      return { ...state(), items: items.sort((a, b) => best(b) - best(a)) };
    },
    async refreshPrices(req) {
      const st = d.service();
      if (st === "disconnected") throw err(422, "action-unavailable", "prices.errors.notConnected");
      if (st !== "connected") throw err(422, "auth.invalid", "connectors.itad.errors.invalid");
      if (d.prices().country === null) throw err(400, "invalid-input", "prices.errors.countryMissing");
      if (req.manual) {
        if (d.now() < lastManual + 60_000) return;
        lastManual = d.now();
      }
      for (const id of [...(req.canonicalIds ?? []), ...(req.watchIds ?? [])]) if (req.manual || !fetched.has(fkey(id))) fetched.set(fkey(id), d.now());
    },
    async setPriceExclusion(id, on) {
      if (!d.library().some((g) => g.id === id)) throw err(404, "not-found", "core.errors.not-found");
      if (on) excluded.add(id);
      else excluded.delete(id);
    },
    async searchPrices(title): Promise<PriceSearchResultDto[]> {
      if (d.service() === "disconnected") throw err(422, "action-unavailable", "prices.errors.notConnected");
      return CATALOG.filter((c) => c.toLowerCase().includes(title.trim().toLowerCase()))
        .slice(0, 20)
        .map((c, i) => {
          const resultId = `res-${c}-${i}`;
          const type = c.includes("Silksong") ? ("dlc" as const) : ("game" as const);
          results.set(resultId, { title: c, type });
          const owned = ownedOf(c);
          return { resultId, title: c, type, ...(owned ? { ownedGameId: owned } : {}), watched: watch.some((w) => w.title === c) };
        });
    },
    async watchPrice(resultId) {
      const r = results.get(resultId);
      if (!r) throw err(404, "not-found", "core.errors.not-found");
      let w = watch.find((x) => x.title === r.title);
      if (!w) {
        if (watch.length >= 500) throw new ApiError(422, "limit-reached", "core.errors.limit-reached.watch", { max: 500 });
        w = { id: `watch-${watch.length}-${r.title}`, ...r };
        watch.push(w);
      }
      const owned = ownedOf(w.title);
      return { id: w.id, title: w.title, type: w.type, ...(owned ? { ownedGameId: owned } : {}), prices: view(w.id) };
    },
    async unwatchPrice(id) {
      const i = watch.findIndex((w) => w.id === id);
      if (i >= 0) watch.splice(i, 1);
    },
  };
}
