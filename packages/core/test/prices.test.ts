// Price comparison in the core (ADR 86, points 7 and 15) against a PriceService double and an in-memory repository.
import { ConnectorError } from "@ludiary/contracts";
import type { ConnectionWizard, I18nKey, PriceService, PriceSnapshot, StoreId, SyncContext } from "@ludiary/contracts";
import { describe, expect, it } from "vitest";
import type { PriceLinkRecord, PriceSnapshotRecord, PriceWatchRecord, PropertyRecord } from "../src/model";
import type { PriceRepository } from "../src/ports";
import { harness, makeConnector, memoryPrices, type Harness } from "./helpers";

const k = (s: string) => s as I18nKey;
const BASE = "http://ludiary.localhost:48123";
const U1 = "11111111-1111-4111-8111-111111111111";
const U2 = "22222222-2222-4222-8222-222222222222";
const U3 = "33333333-3333-4333-8333-333333333333";
const DAY = 24 * 3_600_000;

interface Calls {
  store: [StoreId, readonly string[]][];
  title: (readonly string[])[];
  prices: { ids: readonly string[]; country: string; shops: unknown }[];
  search: string[];
  contexts: SyncContext[];
}

function deal(over: Record<string, unknown> = {}) {
  return { shop: { storeId: "steam" as StoreId | null, serviceShopId: 61, name: "Steam" }, amountMinor: 999, regularMinor: 1999, currency: "EUR", cut: 50, voucher: null, url: "https://itad.link/x/", expiresAt: null, ...over };
}

function double(over: Partial<PriceService> = {}, answers: { store?: Record<string, string>; title?: Record<string, string>; prices?: PriceSnapshot[] } = {}) {
  const calls: Calls = { store: [], title: [], prices: [], search: [], contexts: [] };
  const wizard: ConnectionWizard = {
    start: async () => ({ kind: "info", id: "intro", titleKey: k("connectors.itad.intro.title"), bodyKey: k("connectors.itad.intro.body") }),
    submit: async (ctx, stepId, input) => {
      if (stepId === "intro") {
        return { kind: "input", id: "key", titleKey: k("connectors.itad.apikey.title"), bodyKey: k("connectors.itad.apikey.body"), fields: [{ name: "apiKey", labelKey: k("connectors.itad.apikey.field"), secret: true, maxLength: 128 }] };
      }
      if (input.kind !== "fields") throw new Error("fields");
      if (input.values.apiKey === "rejected-key-000000000") throw new ConnectorError("auth.invalid", "no", { messageKey: k("connectors.itad.errors.invalid") });
      await ctx.wizardState.set("apiKey", input.values.apiKey ?? "");
      return { kind: "done" };
    },
    status: async () => ({ state: "connected" }),
    disconnect: async () => undefined,
  };
  const svc: PriceService = {
    id: "itad",
    nameKey: k("connectors.itad.name"),
    apiHosts: ["api.example.com"],
    authHosts: ["itad.example.com"],
    linkHosts: ["itad.link"],
    mediaHosts: ["img.example.com"],
    connection: wizard,
    lookupByStore: async (store, ids, ctx) => {
      calls.store.push([store, ids]);
      calls.contexts.push(ctx);
      return new Map(ids.flatMap((id) => (answers.store?.[`${store}:${id}`] ? [[id, answers.store[`${store}:${id}`]!] as const] : [])));
    },
    lookupByTitle: async (titles) => {
      calls.title.push(titles);
      return new Map(titles.flatMap((t) => (answers.title?.[t] ? [[t, answers.title[t]!] as const] : [])));
    },
    search: async (title) => {
      calls.search.push(title);
      return [
        { id: U1, title: "Found One", type: "game" },
        { id: U2, title: "Pack", type: "weird" as never },
        { id: "not-a-uuid", title: "Bad", type: "game" },
      ];
    },
    prices: async (ids, q) => {
      calls.prices.push({ ids, country: q.country, shops: q.shops });
      return answers.prices ?? ids.map((id) => ({ id, deals: [deal()], historyLow: { amountMinor: 499, currency: "EUR" } }));
    },
    ...over,
  };
  return { svc, calls };
}

const prop = (id: string, canonical: string, store: StoreId, storeGameId: string, over: Partial<PropertyRecord> = {}): PropertyRecord => ({
  id, canonicalGameId: canonical, store, storeGameId, kind: "game", baseStoreGameId: null, title: "T", normalizedTitle: "t", owned: true, removedAt: null, storePlaytimeMinutes: null, storeLastPlayedAt: null, ...over,
});

async function setup(opts: { answers?: Parameters<typeof double>[1]; over?: Partial<PriceService>; key?: boolean; country?: string | null; http?: Harness["deps"]["http"] } = {}) {
  const mem = memoryPrices();
  const d = double(opts.over, opts.answers);
  const h = await harness({ prices: mem.repo, priceServices: [d.svc], http: opts.http ?? (() => ({ request: async () => { throw new Error("no network"); } })) });
  if (opts.key !== false) {
    await h.deps.secrets.put({ scope: "service:itad", name: "apiKey", ciphertext: h.deps.cipher.encrypt("KEY-0123456789abcdef", "user|service:itad|apiKey"), keyId: 1, updatedAt: 1 });
  }
  if (opts.country !== null) h.store.kv.set("prices.country", opts.country ?? "ES");
  return { h, mem, ...d };
}
function game(h: Harness, id: string, title: string, props: [StoreId, string][], extra: PropertyRecord[] = []) {
  h.store.canonical.set(id, { id, title });
  props.forEach(([store, sid], i) => h.store.properties.set(`${id}-p${i}`, prop(`${id}-p${i}`, id, store, sid)));
  extra.forEach((p) => h.store.properties.set(p.id, p));
}

describe("matching (ADR 86 point 7)", () => {
  it("looks up Steam, then GOG, then the title, and stores the source", async () => {
    const { h, mem, calls } = await setup({ answers: { store: { "steam:10": U1, "gog:20": U2 }, title: { "By Title": U3 } } });
    game(h, "c1", "Steam Game", [["steam", "10"]]);
    game(h, "c2", "Gog Game", [["gog", "20"]]);
    game(h, "c3", "By Title", [["epic", "e1"]]);
    game(h, "c4", "Nobody", [["steam", "99"]]);
    await h.core.refreshPrices({ canonicalIds: ["c1", "c2", "c3", "c4"] });
    expect(calls.store.map(([s]) => s)).toEqual(["steam", "gog"]);
    expect(calls.title).toEqual([["By Title", "Nobody"]]);
    expect(mem.links.get("c1")).toMatchObject({ status: "found", serviceGameId: U1, source: "steam" });
    expect(mem.links.get("c2")).toMatchObject({ status: "found", source: "gog" });
    expect(mem.links.get("c3")).toMatchObject({ status: "found", source: "title" });
    expect(mem.links.get("c4")).toMatchObject({ status: "not-found", serviceGameId: null });
    expect(calls.prices[0]!.ids).toEqual([U1, U2, U3]);
    expect(calls.prices[0]).toMatchObject({ country: "ES", shops: ["steam", "gog", "epic", "ubisoft", "ea"] });
  });

  it("two properties with different ids: conflict, no prices", async () => {
    const { h, mem, calls } = await setup({ answers: { store: { "steam:10": U1, "gog:20": U2 } } });
    game(h, "c1", "Both", [["steam", "10"], ["gog", "20"]]);
    await h.core.refreshPrices({ canonicalIds: ["c1"] });
    expect(mem.links.get("c1")).toMatchObject({ status: "conflict", serviceGameId: null, source: null });
    expect(calls.prices).toEqual([]);
    expect(await h.core.getGamePrices("c1")).toMatchObject({ link: "conflict", prices: null });
  });

  it("looks up again when the inputs change, and a not-found after 30 days; excluded never", async () => {
    const { h, calls } = await setup({ answers: { store: {} } });
    game(h, "c1", "A", [["steam", "10"]]);
    await h.core.refreshPrices({ canonicalIds: ["c1"] });
    await h.core.refreshPrices({ canonicalIds: ["c1"] });
    expect(calls.store.length).toBe(1);
    h.clock.time += 29 * DAY;
    await h.core.refreshPrices({ canonicalIds: ["c1"] });
    expect(calls.store.length).toBe(1);
    h.clock.time += 2 * DAY;
    await h.core.refreshPrices({ canonicalIds: ["c1"] });
    expect(calls.store.length).toBe(2);
    h.store.properties.set("c1-new", prop("c1-new", "c1", "gog", "77")); // a new property changes the hash
    await h.core.refreshPrices({ canonicalIds: ["c1"] });
    expect(calls.store.length).toBe(4); // steam and gog
    await h.core.setPriceExclusion("c1", true);
    h.clock.time += 40 * DAY;
    await h.core.refreshPrices({ canonicalIds: ["c1"] });
    expect(calls.store.length).toBe(4);
    expect(await h.core.getGamePrices("c1")).toMatchObject({ link: "excluded", prices: null });
    await h.core.setPriceExclusion("c1", false);
    expect(await h.core.getGamePrices("c1")).toMatchObject({ link: "pending" });
    await h.core.setPriceExclusion("c1", false); // idempotent
  });

  it("does not query for a DLC property, and a DLC id is not a shown game", async () => {
    const { h, calls } = await setup({ answers: { store: { "steam:10": U1 } } });
    game(h, "c1", "Base", [["steam", "10"]], [prop("dlc1", "c1", "steam", "11", { kind: "dlc", baseStoreGameId: "10" })]);
    await h.core.refreshPrices({ canonicalIds: ["c1", "dlc1"] });
    expect(calls.store).toEqual([["steam", ["10"]]]);
    await expect(h.core.getGamePrices("dlc1")).rejects.toMatchObject({ code: "not-found" });
  });
});

describe("cache and errors", () => {
  it("serves the cache for 6 hours per country and shops, and a manual refresh skips the TTL but has a floor", async () => {
    const { h, calls } = await setup({ answers: { store: { "steam:10": U1 } } });
    game(h, "c1", "A", [["steam", "10"]]);
    await h.core.refreshPrices({ canonicalIds: ["c1"] });
    await h.core.refreshPrices({ canonicalIds: ["c1"] });
    expect(calls.prices.length).toBe(1);
    h.store.kv.set("prices.country", "US");
    await h.core.refreshPrices({ canonicalIds: ["c1"] });
    expect(calls.prices.length).toBe(2);
    h.store.kv.set("prices.shops", "all");
    await h.core.refreshPrices({ canonicalIds: ["c1"] });
    expect(calls.prices.at(-1)).toMatchObject({ country: "US", shops: "all" });
    h.store.kv.set("prices.country", "ES");
    h.store.kv.set("prices.shops", "ludiary");
    expect((await h.core.getGamePrices("c1")).prices).toMatchObject({ country: "ES", stale: false }); // the ES row is still there
    await h.core.refreshPrices({ canonicalIds: ["c1"], manual: true });
    const n = calls.prices.length;
    await h.core.refreshPrices({ canonicalIds: ["c1"], manual: true }); // under the floor: nothing
    expect(calls.prices.length).toBe(n);
    h.clock.time += 61_000;
    await h.core.refreshPrices({ canonicalIds: ["c1"], manual: true });
    expect(calls.prices.length).toBe(n + 1);
    h.clock.time += 7 * 3_600_000;
    expect((await h.core.getGamePrices("c1")).prices?.stale).toBe(true);
  });

  it("without a country it fails with a translatable error and no request", async () => {
    const { h, calls } = await setup({ country: null });
    game(h, "c1", "A", [["steam", "10"]]);
    await expect(h.core.refreshPrices({ canonicalIds: ["c1"] })).rejects.toMatchObject({ code: "invalid-input", key: "prices.errors.countryMissing" });
    expect(calls.store).toEqual([]);
    expect((await h.core.getGamePrices("c1")).needsCountry).toBe(true);
  });

  it("without a key it is action-unavailable; a stored 'invalid' stops every request", async () => {
    const off = await setup({ key: false });
    game(off.h, "c1", "A", [["steam", "10"]]);
    await expect(off.h.core.refreshPrices({ canonicalIds: ["c1"] })).rejects.toMatchObject({ code: "action-unavailable", key: "prices.errors.notConnected" });
    expect((await off.h.core.listServices())[0]).toMatchObject({ status: "disconnected", configured: false, available: true });

    const { h, calls } = await setup({ over: { lookupByStore: async () => { throw new ConnectorError("auth.invalid", "no"); } } });
    game(h, "c1", "A", [["steam", "10"]]);
    await h.core.refreshPrices({ canonicalIds: ["c1"] });
    expect(h.store.kv.get("services.itad.status")).toBe("invalid");
    expect((await h.core.getGamePrices("c1")).service).toBe("invalid");
    await expect(h.core.refreshPrices({ canonicalIds: ["c1"] })).rejects.toMatchObject({ code: "auth.invalid", key: "connectors.itad.errors.invalid" });
    await expect(h.core.searchPrices("hello")).rejects.toMatchObject({ code: "auth.invalid" });
    expect(calls.prices).toEqual([]);
  });

  it("a 429 sets one wait for the service, capped at a day, and serves what is stored", async () => {
    let n = 0;
    const { h, calls } = await setup({ over: { prices: async () => { n++; throw new ConnectorError("store.rate-limited", "slow", { retryAfterMs: 90 * DAY }); } }, answers: { store: { "steam:10": U1 } } });
    game(h, "c1", "A", [["steam", "10"]]);
    await h.core.refreshPrices({ canonicalIds: ["c1"] });
    expect(n).toBe(1);
    const state = await h.core.getGamePrices("c1");
    expect(state.limitedUntil).toBe(h.clock.time + DAY);
    await h.core.refreshPrices({ canonicalIds: ["c1"], manual: true });
    expect(n).toBe(1);
    expect(calls.store.length).toBe(1);
    await expect(h.core.searchPrices("hello")).rejects.toMatchObject({ code: "busy", key: "prices.errors.limited" });
    h.clock.time += DAY + 1;
    expect((await h.core.getGamePrices("c1")).limitedUntil).toBeUndefined();
  });

  it("spends at most 200 requests per 5 minutes, searches included, and then makes no request", async () => {
    const { h, calls } = await setup();
    for (let i = 0; i < 200; i++) await h.core.searchPrices(`title ${i}`);
    expect(calls.search.length).toBe(200);
    await expect(h.core.searchPrices("one more")).rejects.toMatchObject({ code: "busy" });
    expect(calls.search.length).toBe(200);
    expect((await h.core.getPriceBoard()).limitedUntil).toBe(h.clock.time + 5 * 60_000);
    h.clock.time += 5 * 60_000;
    await h.core.searchPrices("again");
    expect(calls.search.length).toBe(201);
  });

  it("two refreshes of the same game query once; a disconnect in the middle writes nothing", async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((r) => (release = r));
    const slow = await setup({ over: { prices: async (ids) => { await gate; return ids.map((id) => ({ id, deals: [deal()], historyLow: null })); } }, answers: { store: { "steam:10": U1 } } });
    game(slow.h, "c1", "A", [["steam", "10"]]);
    const a = slow.h.core.refreshPrices({ canonicalIds: ["c1"] });
    const b = slow.h.core.refreshPrices({ canonicalIds: ["c1"] });
    await new Promise((r) => setTimeout(r, 5));
    release();
    await Promise.all([a, b]);
    expect(slow.mem.snaps.size).toBe(1);
    expect(slow.calls.store.length).toBe(1);

    let go: () => void = () => undefined;
    const wait = new Promise<void>((r) => (go = r));
    const t = await setup({ over: { prices: async (ids) => { await wait; return ids.map((id) => ({ id, deals: [deal()], historyLow: null })); } }, answers: { store: { "steam:10": U1 } } });
    game(t.h, "c1", "A", [["steam", "10"]]);
    const running = t.h.core.refreshPrices({ canonicalIds: ["c1"] });
    await new Promise((r) => setTimeout(r, 5));
    await t.h.core.disconnectService("itad");
    go();
    await running;
    expect(t.mem.snaps.size).toBe(0);
    expect(t.h.store.secretRows.size).toBe(0);
  });
});

describe("validation of the output (point 7)", () => {
  it("checks the links again when reading: a restored snapshot cannot show another scheme or host", async () => {
    const { h, mem } = await setup({ answers: { store: { "steam:10": U1 } } });
    game(h, "c1", "Portal", [["steam", "10"]]);
    await h.core.refreshPrices({ canonicalIds: ["c1"] });
    const record = [...mem.snaps.values()][0]!;
    const good = record.data.deals[0]!;
    const bad = ["steam://run/10", "https://evil.example.com/x", "http://itad.link/x"].map((url) => ({ ...good, url }));
    await mem.repo.putSnapshots([{ ...record, data: { ...record.data, deals: [good, ...bad] } }]);
    const deals = (await h.core.getGamePrices("c1")).prices!.deals;
    expect(deals.length).toBe(4);
    expect(deals[0]!.url).toBe(good.url);
    for (const d of deals.slice(1)) expect(d).not.toHaveProperty("url");
  });

  it("drops bad deals and links outside linkHosts, never alters the rest, and logs no titles or ids", async () => {
    const good = deal({ expiresAt: "2030-01-01T00:00:00Z", voucher: "CODE" });
    const out: PriceSnapshot[] = [
      {
        id: U1,
        historyLow: { amountMinor: 1.5, currency: "EUR" },
        deals: [
          good,
          deal({ url: "https://evil.example.com/x" }),
          deal({ url: "http://itad.link/x" }),
          deal({ url: "https://u:p@itad.link/x" }),
          deal({ url: "https://itad.link:444/x" }),
          deal({ amountMinor: -1 }),
          deal({ amountMinor: 1.5 }),
          deal({ regularMinor: 2_000_000_000 }),
          deal({ currency: "eur" }),
          deal({ cut: 101 }),
          deal({ shop: { storeId: "nope" as never, serviceShopId: 1, name: "Other" } }),
          deal({ shop: { storeId: "gog", serviceShopId: 1, name: "bad\u0000name" } }),
          ...Array.from({ length: 150 }, () => deal()),
        ],
      },
    ];
    const { h, calls } = await setup({ answers: { store: { "steam:10": U1 }, prices: out } });
    game(h, "c1", "Secret Title", [["steam", "10"]]);
    await h.core.refreshPrices({ canonicalIds: ["c1"] });
    expect(calls.prices.length).toBe(1);
    const p = (await h.core.getGamePrices("c1")).prices!;
    expect(p.historyLow).toBeNull();
    expect(p.deals.length).toBe(94); // the first 100 are read; the 6 invalid ones among them go
    expect(p.deals[0]).toMatchObject({ amountMinor: 999, regularMinor: 1999, cut: 50, voucher: "CODE", url: "https://itad.link/x/", expiresAt: Date.parse("2030-01-01T00:00:00Z") });
    expect(p.deals[1]).not.toHaveProperty("url");
    expect(p.deals.find((d) => d.shop.name === "Other")?.shop.storeId).toBeNull();
    const logs = h.logs.join("\n");
    expect(logs).toContain("droppedLinkHosts");
    expect(logs).toContain("evil.example.com");
    expect(logs).not.toMatch(/Secret Title|KEY-0123/);
    expect(logs).not.toContain(U1);
  });

  it("ignores lookup answers for ids that were not asked and ids that are not UUIDs", async () => {
    const { h, mem } = await setup({ over: { lookupByStore: async () => new Map([["10", "not-a-uuid"], ["zzz", U1]]) } });
    game(h, "c1", "A", [["steam", "10"]]);
    await h.core.refreshPrices({ canonicalIds: ["c1"] });
    expect(mem.links.get("c1")?.status).toBe("not-found");
  });
});

describe("search and follow list (point 15, M6)", () => {
  it("only follows a result of a recent search, with what the server saw", async () => {
    const { h, mem, calls } = await setup();
    await expect(h.core.searchPrices(" a ")).rejects.toMatchObject({ code: "invalid-input" });
    await expect(h.core.searchPrices("x".repeat(101))).rejects.toMatchObject({ code: "invalid-input" });
    await expect(h.core.searchPrices("bad\u0001text")).rejects.toMatchObject({ code: "invalid-input" });
    expect(calls.search).toEqual([]);
    const results = await h.core.searchPrices("  found  ");
    expect(calls.search).toEqual(["found"]);
    expect(results.map((r) => [r.title, r.type, r.watched])).toEqual([["Found One", "game", false], ["Pack", null, false]]);
    await expect(h.core.watchPrice(U1)).rejects.toMatchObject({ code: "not-found" });
    const first = await h.core.watchPrice(results[0]!.resultId);
    expect(first.created).toBe(true);
    expect(mem.watch[0]).toMatchObject({ serviceGameId: U1, title: "Found One", type: "game" });
    const again = await (async () => h.core.watchPrice((await h.core.searchPrices("found"))[0]!.resultId))();
    expect(again.created).toBe(false);
    expect((await h.core.searchPrices("found"))[0]!.watched).toBe(true);
    h.clock.time += 16 * 60_000;
    await expect(h.core.watchPrice(results[1]!.resultId)).rejects.toMatchObject({ code: "not-found" });
    await h.core.unwatchPrice(first.item.id);
    await h.core.unwatchPrice(first.item.id);
    expect(mem.watch).toEqual([]);
  });

  it("the board is ordered by discount and marks games you own", async () => {
    const { h, mem } = await setup({ answers: { store: { "steam:10": U1 }, prices: [{ id: U1, deals: [deal({ cut: 20 })], historyLow: null }, { id: U2, deals: [deal({ cut: 80 })], historyLow: null }] } });
    game(h, "c1", "Mine", [["steam", "10"]]);
    mem.watch.push({ id: "w1", service: "itad", serviceGameId: U1, title: "Mine", type: "game", addedAt: 1, origin: "manual", originStoreGameId: null }, { id: "w2", service: "itad", serviceGameId: U2, title: "Other", type: null, addedAt: 2, origin: "manual", originStoreGameId: null }, { id: "w3", service: "itad", serviceGameId: U3, title: "None", type: null, addedAt: 3, origin: "manual", originStoreGameId: null });
    await h.core.refreshPrices({ canonicalIds: ["c1"], watchIds: ["w2", "w3"] });
    const board = await h.core.getPriceBoard();
    expect(board.items.map((i) => i.id)).toEqual(["w2", "w1", "w3"]);
    expect(board.items.find((i) => i.id === "w1")?.ownedGameId).toBe("c1");
    expect(board.items.find((i) => i.id === "w3")?.prices?.deals).toEqual([]);
  });
});

describe("service wizard (point 15, A1)", () => {
  async function wizardSetup(over: Partial<PriceService> = {}) {
    const s = await setup({ key: false, over });
    return s;
  }

  it("stores the key from the wizard state only at the end, clears the state flag, and touches no store connection or sync", async () => {
    const { h } = await wizardSetup();
    h.store.kv.set("services.itad.status", "invalid");
    const { wizardId, response } = await h.core.startServiceWizard("itad", BASE);
    expect(response).toMatchObject({ kind: "info", id: "intro" });
    await h.core.submitWizard(wizardId, "intro", { kind: "continue" });
    expect(h.store.secretRows.size).toBe(0);
    expect(await h.core.submitWizard(wizardId, "key", { kind: "fields", values: { apiKey: "KEY-0123456789abcdef" } })).toEqual({ kind: "done" });
    expect([...h.store.secretRows.keys()]).toEqual(["service:itad|apiKey"]);
    expect(h.store.kv.has("services.itad.status")).toBe(false);
    expect(h.store.connectionRows.size).toBe(0);
    expect(h.store.sync.size).toBe(0);
    expect((await h.core.listServices())[0]).toMatchObject({ status: "connected", configured: true });
    expect(h.logs.join("\n")).not.toContain("KEY-0123");
  });

  it("a rejected key or an internal error keeps the key that was already there", async () => {
    const { h } = await setup();
    const before = h.store.secretRows.get("service:itad|apiKey");
    const a = await h.core.startServiceWizard("itad", BASE);
    await h.core.submitWizard(a.wizardId, "intro", { kind: "continue" });
    expect(await h.core.submitWizard(a.wizardId, "key", { kind: "fields", values: { apiKey: "rejected-key-000000000" } })).toMatchObject({ kind: "rejected", error: { code: "auth.invalid" } });
    expect(h.store.secretRows.get("service:itad|apiKey")).toBe(before);

    const { svc } = double();
    const broken = { ...svc, connection: { ...svc.connection, submit: async () => { throw new Error("boom"); } } };
    const h2 = await harness({ prices: memoryPrices().repo, priceServices: [broken], http: () => ({ request: async () => { throw new Error("x"); } }) });
    h2.store.secretRows.set("service:itad|apiKey", before!);
    const b = await h2.core.startServiceWizard("itad", BASE);
    expect(await h2.core.submitWizard(b.wizardId, "intro", { kind: "continue" })).toMatchObject({ kind: "rejected", error: { code: "internal" } });
    expect(h2.store.secretRows.get("service:itad|apiKey")).toBe(before);
  });

  it("refuses the callback of a service wizard, a cancelled session and a disconnect during the wizard", async () => {
    const { h } = await wizardSetup();
    const a = await h.core.startServiceWizard("itad", BASE);
    await expect(h.core.wizardCallback(a.wizardId, {})).rejects.toMatchObject({ code: "invalid-input" });
    await h.core.submitWizard(a.wizardId, "intro", { kind: "continue" });
    await h.core.disconnectService("itad"); // cancels the wizard and moves the epoch
    await expect(h.core.submitWizard(a.wizardId, "key", { kind: "fields", values: { apiKey: "KEY-0123456789abcdef" } })).rejects.toMatchObject({ code: "not-found" });
    expect(h.store.secretRows.size).toBe(0);
  });

  it("the service context cannot write secrets", async () => {
    const { h, calls } = await setup({ answers: { store: {} } });
    game(h, "c1", "A", [["steam", "10"]]);
    await h.core.refreshPrices({ canonicalIds: ["c1"] });
    await expect(calls.contexts[0]!.secrets.set("apiKey", "x")).rejects.toMatchObject({ code: "internal" });
    await expect(calls.contexts[0]!.secrets.delete("apiKey")).rejects.toMatchObject({ code: "internal" });
    expect((await calls.contexts[0]!.secrets.get("apiKey"))?.reveal()).toBe("KEY-0123456789abcdef");
  });

  it("disconnect removes the key, the state, the cache and the links except excluded; the follow list stays", async () => {
    const { h, mem } = await setup({ answers: { store: { "steam:10": U1 } } });
    game(h, "c1", "A", [["steam", "10"]]);
    game(h, "c2", "B", [["steam", "11"]]);
    mem.watch.push({ id: "w1", service: "itad", serviceGameId: U2, title: "W", type: null, addedAt: 1, origin: "manual", originStoreGameId: null });
    await h.core.refreshPrices({ canonicalIds: ["c1"] });
    await h.core.setPriceExclusion("c2", true);
    h.store.kv.set("services.itad.status", "expired");
    await h.core.disconnectService("itad");
    expect(h.store.secretRows.size).toBe(0);
    expect(h.store.kv.has("services.itad.status")).toBe(false);
    expect(mem.snaps.size).toBe(0);
    expect([...mem.links.keys()]).toEqual(["c2"]);
    expect(mem.watch.length).toBe(1);
    expect((await h.core.listServices())[0]!.status).toBe("disconnected");
  });
});

describe("settings", () => {
  it("shows prices only with a service, validates country and shops and never defaults the country", async () => {
    const { h } = await setup({ country: null });
    expect((await h.core.getSettings()).prices).toEqual({ country: null, shops: "ludiary" });
    await h.core.updateSettings({ prices: { country: "ES", shops: "all" } });
    expect((await h.core.getSettings()).prices).toEqual({ country: "ES", shops: "all" });
    for (const bad of [{ country: "es" }, { country: "ESP" }, { shops: "x" as never }]) {
      await expect(h.core.updateSettings({ prices: bad })).rejects.toMatchObject({ code: "invalid-input" });
    }
    const plain = await harness({ connectors: [makeConnector()] });
    expect((await plain.core.getSettings()).prices).toBeUndefined();
    await expect(plain.core.updateSettings({ prices: { country: "ES" } })).rejects.toMatchObject({ code: "invalid-input" });
    expect(await plain.core.listServices()).toEqual([]);
  });
});

describe("review of the code (ADR 86 low findings)", () => {
  it("connecting a new key moves the epoch: a late 401 of a refresh begun before cannot mark it invalid", async () => {
    let fail: () => void = () => undefined;
    const gate = new Promise<void>((_, reject) => (fail = () => reject(new ConnectorError("auth.invalid", "late"))));
    const { h } = await setup({ over: { prices: async () => { await gate; return []; } }, answers: { store: { "steam:10": U1 } } });
    game(h, "c1", "A", [["steam", "10"]]);
    const running = h.core.refreshPrices({ canonicalIds: ["c1"] });
    await new Promise((r) => setTimeout(r, 5));
    const w = await h.core.startServiceWizard("itad", BASE);
    await h.core.submitWizard(w.wizardId, "intro", { kind: "continue" });
    expect(await h.core.submitWizard(w.wizardId, "key", { kind: "fields", values: { apiKey: "KEY-NEW-0123456789abcdef" } })).toEqual({ kind: "done" });
    fail();
    await running;
    expect(h.store.kv.has("services.itad.status")).toBe(false);
    expect((await h.core.listServices())[0]!.status).toBe("connected");
  });

  const withHttp = (calls: string[]) => {
    const { svc } = double();
    const check: PriceService["connection"] = {
      ...svc.connection,
      submit: async (ctx, stepId, input) => {
        if (stepId !== "key") return svc.connection.submit(ctx, stepId, input);
        await ctx.http.request({ method: "GET", url: "https://api.example.com/check" });
        await ctx.wizardState.set("apiKey", "KEY-NEW-0123456789abcdef");
        return { kind: "done" };
      },
    };
    return { over: { connection: check }, http: (() => ({ request: async (r: { url: string }) => (calls.push(r.url), { status: 200, headers: {}, json: async () => ({}), text: async () => "" }) })) as Harness["deps"]["http"] };
  };
  const connect = async (h: Harness) => {
    const w = await h.core.startServiceWizard("itad", BASE);
    await h.core.submitWizard(w.wizardId, "intro", { kind: "continue" });
    return h.core.submitWizard(w.wizardId, "key", { kind: "fields", values: { apiKey: "KEY-NEW-0123456789abcdef" } });
  };

  it("the wait after a 429 survives a disconnect, and the key check of the wizard respects it", async () => {
    const calls: string[] = [];
    const { over, http } = withHttp(calls);
    const { h } = await setup({ over: { ...over, prices: async () => { throw new ConnectorError("store.rate-limited", "slow", { retryAfterMs: 10 * 60_000 }); } }, answers: { store: { "steam:10": U1 } }, http });
    game(h, "c1", "A", [["steam", "10"]]);
    await h.core.refreshPrices({ canonicalIds: ["c1"] });
    await h.core.disconnectService("itad");
    expect(await connect(h)).toMatchObject({ kind: "rejected", error: { code: "store.rate-limited", key: "prices.errors.limited" } });
    expect(calls).toEqual([]);
    h.clock.time += 11 * 60_000;
    expect(await connect(h)).toEqual({ kind: "done" });
    expect(calls).toEqual(["https://api.example.com/check"]);
  });

  it("the key check of the wizard spends the budget like any request", async () => {
    const calls: string[] = [];
    const { over, http } = withHttp(calls);
    const { h } = await setup({ over, http });
    for (let i = 0; i < 200; i++) await h.core.searchPrices(`title ${i}`);
    expect(await connect(h)).toMatchObject({ kind: "rejected", error: { code: "store.rate-limited" } });
    expect(calls).toEqual([]);
    h.clock.time += 5 * 60_000;
    expect(await connect(h)).toEqual({ kind: "done" });
    expect(calls.length).toBe(1);
  });

  it("a deal link is shown exactly as the service sent it", async () => {
    const url = "https://ITAD.link/x?a=1&b=%7e#frag";
    const { h } = await setup({ answers: { store: { "steam:10": U1 }, prices: [{ id: U1, deals: [deal({ url })], historyLow: null }] } });
    game(h, "c1", "A", [["steam", "10"]]);
    await h.core.refreshPrices({ canonicalIds: ["c1"] });
    expect((await h.core.getGamePrices("c1")).prices!.deals[0]!.url).toBe(url);
  });
});

describe("images in the comparator (ADR 86 point 17)", () => {
  const IMG = "https://img.example.com";
  const search = (media: unknown): Partial<PriceService> => ({ search: async () => [{ id: U1, title: "Found One", type: "game", media: media as never }] });

  it("shows the image of the result, validated against the service's mediaHosts, and copies it to the list from the server's memory", async () => {
    const { h, mem } = await setup({ over: search({ coverUrl: `${IMG}/c.jpg?t=1`, heroUrl: "https://evil.example/h.jpg" }) });
    const [r] = await h.core.searchPrices("found");
    expect(r).toMatchObject({ coverUrl: `${IMG}/c.jpg?t=1` });
    expect(r!.coverFallbackUrl).toBeUndefined(); // other host: dropped
    const { item } = await h.core.watchPrice(r!.resultId);
    expect(mem.watch[0]).toMatchObject({ coverUrl: `${IMG}/c.jpg?t=1` });
    expect(mem.watch[0]!.coverFallbackUrl).toBeUndefined();
    expect(item.coverUrl).toBe(`${IMG}/c.jpg?t=1`);
    expect((await h.core.getPriceBoard()).items[0]!.coverUrl).toBe(`${IMG}/c.jpg?t=1`);
  });

  it("a port in the URL is dropped", async () => {
    const { h } = await setup({ over: search({ coverUrl: "https://img.example.com:8443/c.jpg" }) });
    expect((await h.core.searchPrices("found"))[0]!.coverUrl).toBeUndefined();
  });

  it("a game of the library shows its own cover and the service's image is neither shown nor saved", async () => {
    const { h, mem } = await setup({ answers: { store: { "steam:10": U1 } }, over: search({ coverUrl: `${IMG}/c.jpg` }) });
    game(h, "c1", "Mine", [["steam", "10"]]);
    h.store.canonical.set("c1", { id: "c1", title: "Mine", media: { coverUrl: "https://shared.akamai.steamstatic.com/own.jpg", heroUrl: "https://shared.akamai.steamstatic.com/own-h.jpg" } });
    await h.core.refreshPrices({ canonicalIds: ["c1"] });
    const [r] = await h.core.searchPrices("found");
    expect(r).toMatchObject({ ownedGameId: "c1", coverUrl: "https://shared.akamai.steamstatic.com/own.jpg", coverFallbackUrl: "https://shared.akamai.steamstatic.com/own-h.jpg" });
    await h.core.watchPrice(r!.resultId);
    expect(mem.watch[0]!.coverUrl).toBeUndefined();
    expect((await h.core.getPriceBoard()).items[0]!.coverUrl).toBe("https://shared.akamai.steamstatic.com/own.jpg");
  });

  it("an image whose host is no longer allowed is omitted when read", async () => {
    const { h, mem } = await setup();
    mem.watch.push({ id: "w1", service: "itad", serviceGameId: U1, title: "Old", type: null, coverUrl: "https://gone.example/c.jpg", coverFallbackUrl: `${IMG}/h.jpg`, addedAt: 1, origin: "manual", originStoreGameId: null });
    const [item] = (await h.core.getPriceBoard()).items;
    expect(item!.coverUrl).toBeUndefined();
    expect(item!.coverFallbackUrl).toBe(`${IMG}/h.jpg`);
  });
});
