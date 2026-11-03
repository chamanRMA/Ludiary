// The price simulator (ADR 86) and the formatting helpers: the web has no DOM tests, so the states the screens show are checked here.
import type { WizardTarget } from "@ludiary/api-contract";
import { describe, expect, it } from "vitest";
import type { LudiaryApi } from "./api";
import { createMockApi, type KeyValueStorage } from "./mock";
import { browserCountry, formatMoney } from "./prices";

const memory = (): KeyValueStorage => {
  const m = new Map<string, string>();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v) };
};
const itad: WizardTarget = { kind: "service", service: "itad" };

async function connected(country: string | null = "ES"): Promise<LudiaryApi> {
  const api = createMockApi(memory());
  await api.startWizard(itad);
  await api.submitWizard(itad, { kind: "continue" });
  expect((await api.submitWizard(itad, { kind: "fields", values: { apiKey: "short" } })).kind).toBe("rejected");
  expect((await api.submitWizard(itad, { kind: "fields", values: { apiKey: "abcdef0123456789abcdef" } })).kind).toBe("done");
  if (country) await api.updateSettings({ prices: { country } });
  return api;
}

describe("price simulator", () => {
  it("without a key nothing can be refreshed or searched, and the state says so", async () => {
    const api = createMockApi(memory());
    expect(await api.getGamePrices("hades")).toMatchObject({ service: "disconnected", link: "pending", prices: null });
    await expect(api.refreshPrices({ canonicalIds: ["hades"] })).rejects.toMatchObject({ key: "prices.errors.notConnected" });
    await expect(api.searchPrices("hades")).rejects.toMatchObject({ key: "prices.errors.notConnected" });
  });

  it("needs a country and then shows prices of the shops chosen", async () => {
    const api = await connected(null);
    expect((await api.getGamePrices("hades")).needsCountry).toBe(true);
    await expect(api.refreshPrices({ canonicalIds: ["hades"] })).rejects.toMatchObject({ key: "prices.errors.countryMissing" });
    await api.updateSettings({ prices: { country: "ES" } });
    await api.refreshPrices({ canonicalIds: ["hades"] });
    const mine = (await api.getGamePrices("hades")).prices!;
    expect(mine.deals.every((d) => d.shop.storeId !== null && d.currency === "EUR")).toBe(true);
    await api.updateSettings({ prices: { shops: "all" } });
    await api.refreshPrices({ canonicalIds: ["hades"] });
    expect((await api.getGamePrices("hades")).prices!.deals.length).toBeGreaterThan(mine.deals.length);
  });

  it("marks a game as not this one and undoes it, and refuses an unknown game", async () => {
    const api = await connected();
    await api.refreshPrices({ canonicalIds: ["hades"] });
    await api.setPriceExclusion("hades", true);
    expect(await api.getGamePrices("hades")).toMatchObject({ link: "excluded", prices: null });
    await api.setPriceExclusion("hades", false);
    expect((await api.getGamePrices("hades")).link).toBe("found");
    await expect(api.getGamePrices("nope")).rejects.toMatchObject({ status: 404 });
  });

  it("follows from a search result, shows the owned game, orders by discount and unfollows", async () => {
    const api = await connected();
    const found = await api.searchPrices("hades");
    expect(found.map((r) => r.title)).toEqual(["Hades II", "Hades"]);
    expect(found[1]!.ownedGameId).toBe("hades");
    for (const r of found) await api.watchPrice(r.resultId);
    await api.watchPrice(found[0]!.resultId); // the same game twice is one entry
    const board0 = await api.getPriceBoard();
    expect(board0.items).toHaveLength(2);
    await api.refreshPrices({ watchIds: board0.items.map((i) => i.id) });
    const board = await api.getPriceBoard();
    const cuts = board.items.map((i) => Math.max(...i.prices!.deals.map((d) => d.cut)));
    expect(cuts).toEqual([...cuts].sort((a, b) => b - a));
    expect(board.items.find((i) => i.title === "Hades")?.ownedGameId).toBe("hades");
    await api.unwatchPrice(board.items[0]!.id);
    expect((await api.getPriceBoard()).items).toHaveLength(1);
    await expect(api.watchPrice("forged")).rejects.toMatchObject({ status: 404 });
  });

  it("the manual refresh has a floor of a minute", async () => {
    const api = await connected();
    await api.refreshPrices({ canonicalIds: ["hades"], manual: true });
    const first = (await api.getGamePrices("hades")).prices!.fetchedAt;
    await new Promise((r) => setTimeout(r, 5));
    await api.refreshPrices({ canonicalIds: ["hades"], manual: true });
    expect((await api.getGamePrices("hades")).prices!.fetchedAt).toBe(first);
  });

  it("disconnecting returns the service to disconnected", async () => {
    const api = await connected();
    await api.disconnect(itad);
    expect((await api.getServices()).find((s) => s.service === "itad")).toMatchObject({ configured: false, status: "disconnected" });
  });
});

describe("price formatting", () => {
  it("formats minor units with the decimals of the currency, without altering them", () => {
    expect(formatMoney(1999, "EUR", "en")).toBe("€19.99");
    expect(formatMoney(1999, "JPY", "en")).toBe("¥1,999");
  });

  it("takes the country from the region of the browser language and never invents one", () => {
    expect(browserCountry("es-ES")).toBe("ES");
    expect(browserCountry("en-US")).toBe("US");
    expect(browserCountry("es")).toBeNull();
    expect(browserCountry("not a language")).toBeNull();
    expect(browserCountry(undefined)).toBeNull();
  });
});
