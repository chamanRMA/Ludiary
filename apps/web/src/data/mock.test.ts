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

  it("configures RAWG with one field and keeps IsThereAnyDeal unavailable", async () => {
    const api = createMockApi(memoryStorage());
    const rawg: WizardTarget = { kind: "service", service: "rawg" };
    await api.startWizard(rawg);
    expect((await api.submitWizard(rawg, { kind: "fields", values: { apiKey: "short" } })).kind).toBe("rejected");
    expect((await api.submitWizard(rawg, { kind: "fields", values: { apiKey: "abcdef0123456789abcdef" } })).kind).toBe("done");
    const services = await api.getServices();
    expect(services.find((s) => s.service === "rawg")?.configured).toBe(true);
    expect(services.find((s) => s.service === "itad")).toMatchObject({ available: false, configured: false });
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
