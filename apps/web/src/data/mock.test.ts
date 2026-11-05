import type { WizardTarget } from "@ludiary/api-contract";
import { describe, expect, it } from "vitest";
import { filterGames } from "./library";
import { createMockApi, type KeyValueStorage } from "./mock";

function memoryStorage(): KeyValueStorage & { dump(): string } {
  const data = new Map<string, string>();
  return {
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    dump: () => JSON.stringify([...data]),
  };
}

const steam: WizardTarget = { kind: "store", store: "steam" };
const KEY = "0123456789abcdef0123456789abcdef"; // fake, not a real key

describe("mock API: secrets are validated and discarded (ADR 68)", () => {
  it("walks the Steam wizard, accepts a well-formed key and never returns or stores it", async () => {
    const storage = memoryStorage();
    const api = createMockApi(storage);
    expect((await api.startWizard(steam)).kind).toBe("info");
    expect((await api.submitWizard(steam, { kind: "continue" })).kind).toBe("open-external"); // login
    const keyStep = await api.submitWizard(steam, { kind: "callback", query: {} });
    expect(keyStep).toMatchObject({ kind: "open-external", url: "https://steamcommunity.com/dev/apikey", awaits: "input" });
    const answers = [await api.submitWizard(steam, { kind: "fields", values: { apiKey: KEY } })];
    answers.push(await api.submitWizard(steam, { kind: "continue" })); // profile info -> done
    expect(answers[1]).toMatchObject({ kind: "done" });

    const everything = JSON.stringify([answers, await api.getStores(), await api.getServices(), await api.getSettings(), await api.getOnboarding()]);
    expect(everything).not.toContain(KEY);
    expect(storage.dump()).not.toContain(KEY);
    expect((await api.getStores()).find((s) => s.store === "steam")).toMatchObject({ connection: "connected", mode: "library" });
  });

  it("rejects a malformed key and stays on the same step", async () => {
    const api = createMockApi(memoryStorage());
    await api.startWizard(steam);
    await api.submitWizard(steam, { kind: "continue" });
    await api.submitWizard(steam, { kind: "callback", query: {} });
    const res = await api.submitWizard(steam, { kind: "fields", values: { apiKey: "nope" } });
    expect(res).toMatchObject({ kind: "rejected", stepId: "apikey", error: { key: "connectors.steam.error.format" } });
    expect((await api.getStores()).find((s) => s.store === "steam")?.connection).toBe("disconnected");
  });

  it("offers Steam without a key (installed only)", async () => {
    const api = createMockApi(memoryStorage());
    await api.startWizard(steam);
    expect(await api.submitWizard(steam, { kind: "fields", values: { mode: "installed-only" } })).toEqual({ kind: "done" });
    expect((await api.getStores()).find((s) => s.store === "steam")).toMatchObject({ connection: "connected", mode: "installed-only" });
  });

  it("configures RAWG with one field and leaves IsThereAnyDeal alone", async () => {
    const api = createMockApi(memoryStorage());
    const rawg: WizardTarget = { kind: "service", service: "rawg" };
    await api.startWizard(rawg);
    expect((await api.submitWizard(rawg, { kind: "fields", values: { apiKey: "short" } })).kind).toBe("rejected");
    expect((await api.submitWizard(rawg, { kind: "fields", values: { apiKey: "abcdef0123456789abcdef" } })).kind).toBe("done");
    const services = await api.getServices();
    expect(services.find((s) => s.service === "rawg")?.configured).toBe(true);
    expect(services.find((s) => s.service === "itad")).toMatchObject({ available: true, configured: false, status: "disconnected" });
  });

  it("keeps first-run state and language only in its storage (ADR 69)", async () => {
    const storage = memoryStorage();
    const api = createMockApi(storage);
    expect((await api.getOnboarding()).completedAt).toBeNull();
    await api.updateSettings({ locale: "es" });
    await api.completeOnboarding("later");
    const reopened = createMockApi(storage);
    expect((await reopened.getOnboarding()).detection).toBe("later");
    expect((await reopened.getSettings()).locale).toBe("es");
    await reopened.resetOnboarding();
    expect((await reopened.getOnboarding()).completedAt).toBeNull();
  });

  it("can show an expired Epic session", async () => {
    const api = createMockApi(memoryStorage());
    await api.simulateExpiredSession("epic");
    expect((await api.getStores()).find((s) => s.store === "epic")).toMatchObject({ connection: "expired" });
  });
});

describe("filterGames", () => {
  it("filters by store, install state and text", async () => {
    const library = await createMockApi(memoryStorage()).getLibrary();
    expect(filterGames(library, { store: "epic" }).every((g) => g.stores.includes("epic"))).toBe(true);
    const ids = new Set([library[0]!.id]);
    expect(filterGames(library, { ids }).map((g) => g.id)).toEqual([library[0]!.id]);
    expect(filterGames(library, { store: "local" }).every((g) => g.stores.length === 0)).toBe(true);
    expect(filterGames(library, { installed: false }).every((g) => !g.installed)).toBe(true);
    expect(filterGames(library, { query: "ELDEN" }).map((g) => g.id)).toEqual(["elden-ring"]);
  });
});

describe("mock API: covers (ADR 71)", () => {
  it("only Steam games point at Steam's CDN, over https, on a declared host", async () => {
    const games = await createMockApi(memoryStorage()).getLibrary();
    for (const g of games) {
      const urls = [g.coverUrl, g.coverFallbackUrl].filter(Boolean) as string[];
      if (!g.stores.includes("steam")) expect(urls).toEqual([]);
      for (const u of urls) expect(new URL(u).origin).toBe("https://shared.akamai.steamstatic.com");
    }
    expect(games.some((g) => g.coverUrl)).toBe(true);
  });
});

describe("mock API: Steam collections as a mirror (ADR 88)", () => {
  it("only the store that offers it has the status; the mirror is read-only and keeps its games when the user edits a game", async () => {
    const api = createMockApi(memoryStorage());
    expect((await api.getStores()).filter((s) => s.collections).map((s) => s.store)).toEqual(["steam"]);
    const steam = (await api.getCollections()).find((c) => c.source === "steam")!;
    expect(steam.gameIds).toContain("portal2");
    await expect(api.renameCollection(steam.id, "X")).rejects.toMatchObject({ status: 422, code: "collection-managed", key: "core.errors.collectionManaged" });
    await expect(api.deleteCollection(steam.id)).rejects.toMatchObject({ code: "collection-managed" });
    // A mirror id in the request is ignored; the memberships in the mirror stay.
    const game = await api.updateGame("portal2", { collectionIds: [steam.id] });
    expect(game.collections.map((c) => [c.name, c.source])).toEqual([[steam.name, "steam"]]);
    expect((await api.createCollection(steam.name)).source).toBeNull(); // same name as a mirror: allowed
  });

  it("keeps the launch mode of GOG (ADR 76 point 12)", async () => {
    const api = createMockApi(memoryStorage());
    expect((await api.getSettings()).storeLaunch).toEqual({ gog: { mode: "client" } });
    await api.updateSettings({ storeLaunch: { gog: { mode: "direct" } } });
    expect((await api.getSettings()).storeLaunch.gog?.mode).toBe("direct");
  });

  it("turning the setting off removes the mirrors, keeps the own collections and turning it on brings them back", async () => {
    const api = createMockApi(memoryStorage());
    const own = (await api.getCollections()).filter((c) => c.source === null).length;
    await api.updateSettings({ storeCollections: { steam: { enabled: false } } });
    expect((await api.getCollections()).filter((c) => c.source !== null)).toEqual([]);
    expect((await api.getCollections()).length).toBe(own);
    expect((await api.getStores()).find((s) => s.store === "steam")?.collections?.status).toBe("off");
    await api.updateSettings({ storeCollections: { steam: { enabled: true } } });
    expect((await api.getCollections()).some((c) => c.source === "steam")).toBe(true);
    expect((await api.getSettings()).storeCollections.steam).toEqual({ enabled: true, unverifiedFavorites: false });
  });
});

describe("mock API: favorites, tags and collections (ADR 85)", () => {
  it("filterGames filters by tag, ignoring case like the server's name key", async () => {
    const api = createMockApi(memoryStorage());
    await api.updateGame("portal2", { tags: ["Coop"] });
    const library = await api.getLibrary();
    expect(filterGames(library, { tag: "Coop" }).map((g) => g.id)).toEqual(["portal2"]);
    expect(filterGames(library, { tag: "coop" }).map((g) => g.id)).toEqual(["portal2"]);
    expect(filterGames(library, { tag: "Co" })).toEqual([]);
  });

  it("updateGame sets favorite, merges repeated tags and replaces the collections, returning the game", async () => {
    const api = createMockApi(memoryStorage());
    const made = await api.createCollection("  Pendientes ");
    expect(made.name).toBe("Pendientes");
    const game = await api.updateGame("portal2", { favorite: true, tags: ["Coop", "coop", "RPG"], collectionIds: [made.id] });
    expect([game.favorite, game.tags, game.collections]).toEqual([true, ["Coop", "RPG"], [{ id: "col-steam-coop", name: "Cooperativo", source: "steam" }, { id: made.id, name: "Pendientes", source: null }]]);
    expect((await api.getLibrary()).find((g) => g.id === "portal2")?.favorite).toBe(true);
    expect((await api.getCollections()).find((c) => c.id === made.id)?.gameIds).toEqual(["portal2"]);
    expect((await api.updateGame("portal2", { collectionIds: [] })).collections.map((c) => c.source)).toEqual(["steam"]); // only the mirror is left
  });

  it("refuses with translatable errors: unknown game or collection, repeated and bad names, limits", async () => {
    const api = createMockApi(memoryStorage());
    await expect(api.updateGame("nope", { favorite: true })).rejects.toMatchObject({ status: 404, key: "core.errors.not-found" });
    await expect(api.updateGame("portal2", { collectionIds: ["nope"] })).rejects.toMatchObject({ status: 404 });
    await api.createCollection("A");
    await expect(api.createCollection("a")).rejects.toMatchObject({ code: "name-taken", key: "core.errors.name-taken" });
    await expect(api.createCollection("   ")).rejects.toMatchObject({ key: "core.errors.label-empty" });
    await expect(api.createCollection("x".repeat(61))).rejects.toMatchObject({ key: "core.errors.label-too-long", params: { max: 60 } });
    await expect(api.updateGame("portal2", { tags: Array.from({ length: 21 }, (_, i) => `t${i}`) })).rejects.toMatchObject({ code: "limit-reached", params: { max: 20 } });
  });

  it("renames and deletes collections without touching games", async () => {
    const api = createMockApi(memoryStorage());
    const made = await api.createCollection("Old");
    await api.updateGame("portal2", { collectionIds: [made.id] });
    expect((await api.renameCollection(made.id, "New")).name).toBe("New");
    await api.deleteCollection(made.id);
    await api.deleteCollection(made.id);
    expect((await api.getCollections()).some((c) => c.id === made.id)).toBe(false);
    expect((await api.getGame("portal2"))?.collections.map((c) => c.source)).toEqual(["steam"]);
  });
});
