import type { GameDetailDto } from "@ludiary/api-contract";
import { webCatalogs } from "@ludiary/i18n/web";
import i18next from "i18next";
import { describe, expect, it, vi } from "vitest";
import type { LudiaryApi } from "./api";
import { errorText } from "../app/errors";
import { ApiError, type Http } from "./http";
import { createMockApi, type KeyValueStorage } from "./mock";
import { createRealApi } from "./real";

const es: Record<string, string> = webCatalogs.es;

const memory = (): KeyValueStorage => {
  const m = new Map<string, string>();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v) };
};

type Handler = (method: string, path: string, body?: unknown) => unknown;
function fakeHttp(handler: Handler): { http: Http; log: string[] } {
  const log: string[] = [];
  const run = async (method: string, path: string, body?: unknown): Promise<never> => {
    log.push(`${method} ${path}${body === undefined ? "" : ` ${JSON.stringify(body)}`}`);
    const out = handler(method, path, body);
    if (out instanceof Error) throw out;
    return out as never;
  };
  return {
    log,
    http: {
      get: (p) => run("GET", p),
      post: (p, b) => run("POST", p, b),
      patch: (p, b) => run("PATCH", p, b),
      put: (p, b) => run("PUT", p, b),
      delete: async (p) => void (await run("DELETE", p)),
    },
  };
}

const serverSettings = {
  locale: "es",
  detection: "auto-and-manual",
  scanRoots: [{ id: "a", origin: "discovered", path: "C:\\Steam", enabled: true, store: "steam" }],
  backups: { periodic: false, folder: null },
  storeCollections: { steam: { enabled: true, unverifiedFavorites: false } },
};

describe("real client: favorites, tags and collections (ADR 85)", () => {
  it("sends the exact requests", async () => {
    const { http, log } = fakeHttp(() => undefined);
    const api = createRealApi(http, createMockApi(memory()));
    await api.updateGame("g/1", { favorite: true, tags: ["Coop"] });
    await api.getCollections();
    await api.createCollection("Pending");
    await api.renameCollection("c 1", "Later");
    await api.deleteCollection("c 1");
    expect(log).toEqual([
      'PATCH /api/games/g%2F1 {"favorite":true,"tags":["Coop"]}',
      "GET /api/collections",
      'POST /api/collections {"name":"Pending"}',
      'PATCH /api/collections/c%201 {"name":"Later"}',
      "DELETE /api/collections/c%201",
    ]);
  });

  it("lets the server's translatable error through", async () => {
    const { http } = fakeHttp(() => new ApiError(422, "name-taken", "core.errors.name-taken"));
    const api = createRealApi(http, createMockApi(memory()));
    await expect(api.createCollection("A")).rejects.toMatchObject({ code: "name-taken", key: "core.errors.name-taken" });
  });
});

describe("real client: collections of a store (ADR 88)", () => {
  it("has no import call; refreshing is the existing sync", async () => {
    const { http, log } = fakeHttp(() => undefined);
    const api = createRealApi(http, createMockApi(memory()));
    expect("importCollections" in api).toBe(false);
    await api.syncAll("manual");
    expect(log).toEqual(['POST /api/sync {"trigger":"manual"}']);
  });

  it("reads the per-store settings from the server and sends their changes to it, not to the simulator", async () => {
    const { http, log } = fakeHttp((m, p) => (p === "/api/settings" ? serverSettings : m === "GET" ? undefined : undefined));
    const sim = createMockApi(memory());
    const api = createRealApi(http, sim);
    expect((await api.getSettings()).storeCollections).toEqual({ steam: { enabled: true, unverifiedFavorites: false } });
    log.length = 0;
    await api.updateSettings({ storeCollections: { steam: { enabled: false } } });
    expect(log).toEqual(['PATCH /api/settings {"storeCollections":{"steam":{"enabled":false}}}', "GET /api/settings"]);
    expect((await sim.getSettings()).storeCollections.steam?.enabled).toBe(true); // the simulator was not written
  });

  it("lets the server's read-only error through", async () => {
    const { http } = fakeHttp(() => new ApiError(422, "collection-managed", "core.errors.collectionManaged"));
    const api = createRealApi(http, createMockApi(memory()));
    await expect(api.renameCollection("c", "A")).rejects.toMatchObject({ code: "collection-managed", key: "core.errors.collectionManaged" });
    await expect(api.deleteCollection("c")).rejects.toMatchObject({ code: "collection-managed" });
  });
});

describe("real client: what the server serves", () => {
  it("uses the server for library, first run, sync and scan with the exact bodies", async () => {
    const { http, log } = fakeHttp(() => undefined);
    const api = createRealApi(http, createMockApi(memory()));
    await api.getLibrary();
    await api.getOnboarding();
    await api.completeOnboarding("manual-only");
    await api.resetOnboarding();
    await api.syncAll("open");
    await api.syncAll();
    await api.scan();
    expect(log).toEqual([
      "GET /api/library",
      "GET /api/onboarding",
      'POST /api/onboarding/complete {"detection":"manual-only"}',
      "POST /api/onboarding/reset",
      'POST /api/sync {"trigger":"open"}',
      'POST /api/sync {"trigger":"manual"}',
      'POST /api/sync {"trigger":"manual","operations":["scan"]}',
    ]);
  });

  it("getGame returns null on 404 and rethrows other errors", async () => {
    let status = 404;
    const { http } = fakeHttp(() => new ApiError(status, "x", "errors.generic"));
    const api = createRealApi(http, createMockApi(memory()));
    await expect(api.getGame("nope")).resolves.toBeNull();
    status = 500;
    await expect(api.getGame("nope")).rejects.toBeInstanceOf(ApiError);
  });

  it("getGame passes the id as one encoded path segment", async () => {
    const { http, log } = fakeHttp(() => ({}) as GameDetailDto);
    await createRealApi(http, createMockApi(memory())).getGame("a/b?c");
    expect(log).toEqual(["GET /api/games/a%2Fb%3Fc"]);
  });

  it("launchGame sends only the id in the path and an optional propertyId", async () => {
    const { http, log } = fakeHttp(() => ({ status: "started" }));
    const api = createRealApi(http, createMockApi(memory()));
    await expect(api.launchGame("g1")).resolves.toEqual({ status: "started" });
    await api.launchGame("g1", "p1");
    await api.launchGame("g1", undefined, "install");
    await api.launchGame("g1", "p1", "install");
    expect(log).toEqual([
      "POST /api/games/g1/launch {}",
      'POST /api/games/g1/launch {"propertyId":"p1"}',
      'POST /api/games/g1/launch {"action":"install"}',
      'POST /api/games/g1/launch {"propertyId":"p1","action":"install"}',
    ]);
  });

  it("launchGame lets the server's translatable error through", async () => {
    const { http } = fakeHttp(() => new ApiError(422, "launch.launcher-missing", "connectors.steam.errors.launcherMissing"));
    await expect(createRealApi(http, createMockApi(memory())).launchGame("g1")).rejects.toMatchObject({ key: "connectors.steam.errors.launcherMissing" });
  });

  it("scan roots: pick returns the folder or null when cancelled; toggle and remove use the id route", async () => {
    let reply: unknown = { id: "u1", origin: "user", path: "D:\\Juegos", enabled: true };
    const { http, log } = fakeHttp((_m, p) => (p.endsWith("/pick") ? reply : undefined));
    const api = createRealApi(http, createMockApi(memory()));
    await expect(api.addScanRoot()).resolves.toMatchObject({ id: "u1" });
    reply = { cancelled: true };
    await expect(api.addScanRoot()).resolves.toBeNull();
    await api.setScanRootEnabled("u1", false);
    await api.removeScanRoot("u1");
    expect(log).toEqual([
      "POST /api/scan-roots/pick {}",
      "POST /api/scan-roots/pick {}",
      'PATCH /api/scan-roots/u1 {"enabled":false}',
      "DELETE /api/scan-roots/u1",
    ]);
  });
});

describe("real client: backups (ADR 89)", () => {
  const state = { periodic: true, folder: "C:\\Docs\\Ludiary\\Copias", folderIsDefault: true, lastBackupAt: 4242, lastError: null, lastRestore: null, copies: [] };
  const ID = "ludiary-20261103T123456789Z-0a1b2c3d-manual.sqlite";

  it("talks to the routes; the folder only changes through the dialog and a cancelled dialog is null", async () => {
    let reply: unknown = { cancelled: true };
    const { http, log } = fakeHttp((_m, p) => (p === "/api/backups/folder/pick" ? reply : p === "/api/backups" ? state : undefined));
    const api = createRealApi(http, createMockApi(memory()));
    await expect(api.getBackups()).resolves.toEqual(state);
    await api.createBackup();
    await expect(api.pickBackupFolder()).resolves.toBeNull();
    reply = state;
    await expect(api.pickBackupFolder()).resolves.toEqual(state);
    await api.restoreBackup(ID);
    expect(log).toEqual([
      "GET /api/backups",
      "POST /api/backups {}",
      "POST /api/backups/folder/pick {}",
      "POST /api/backups/folder/pick {}",
      `POST /api/backups/restore {"id":"${ID}"}`,
    ]);
  });

  it("the periodic switch goes to the server without any folder, and the last backup time is the real one", async () => {
    const { http, log } = fakeHttp((_m, p) => (p === "/api/backups" ? state : p === "/api/settings" ? serverSettings : []));
    const api = createRealApi(http, createMockApi(memory()));
    await api.updateSettings({ backups: { periodic: true } });
    expect(log[0]).toBe('PATCH /api/settings {"backups":{"periodic":true}}');
    expect((await api.getMaintenance()).lastBackupAt).toBe(4242);
  });

  it("the server errors of the section have a translated text", async () => {
    await i18next.init({ lng: "es", resources: { es: { translation: es } }, keySeparator: false, nsSeparator: false, interpolation: { prefix: "{", suffix: "}" } });
    for (const code of ["busy", "no-folder", "folder-unavailable", "write-failed", "not-found", "too-large", "corrupt", "not-ludiary", "too-new"]) {
      const text = errorText(i18next.t, new ApiError(422, `backup.${code}`, `core.errors.backup.${code}`));
      expect(text, code).not.toBe(es["errors.generic"]);
      expect(text, code).toBeTruthy();
    }
  });
});

describe("mock API: backups (ADR 89)", () => {
  it("the simulator starts with the periodic copies off and lists the manual copies it makes", async () => {
    const api = createMockApi(memory());
    expect((await api.getSettings()).backups.periodic).toBe(false);
    await api.createBackup();
    const state = await api.getBackups();
    expect(state.copies).toHaveLength(1);
    expect(state.lastBackupAt).not.toBeNull();
  });
});

describe("real client: point B, the rest comes from the simulator", () => {
  it("delegates other stores' wizards without touching the server; RAWG and IGDB stay simulated and simulated-only actions are refused", async () => {
    const { http, log } = fakeHttp(() => []);
    const sim = createMockApi(memory());
    const names = ["startWizard", "submitWizard", "cancelWizard", "disconnect"] as const;
    for (const name of names) vi.spyOn(sim as LudiaryApi, name);
    const api = createRealApi(http, sim, null);
    const epic = { kind: "service", service: "rawg" } as const;
    await api.startWizard(epic);
    await api.submitWizard(epic, { kind: "continue" });
    await api.cancelWizard(epic);
    await api.disconnect(epic);
    await expect(api.exportLogs()).rejects.toBeInstanceOf(ApiError);
    await expect(api.simulateExpiredSession("ubisoft")).rejects.toBeInstanceOf(ApiError);
    await api.revokeSessions();
    for (const name of names) expect(sim[name], name).toHaveBeenCalled();
    expect(log).toEqual(["POST /api/sessions/revoke {}"]);
  });

  it("IsThereAnyDeal (ADR 86): services, key wizard, disconnect and every price call go to the server", async () => {
    const step = { kind: "info", id: "intro", titleKey: "connectors.itad.intro.title", bodyKey: "connectors.itad.intro.body" };
    const { http, log } = fakeHttp((m, p) => (p === "/api/services/itad/wizard" ? { wizardId: "w 1", response: step } : p === "/api/wizards/w%201/submit" ? { kind: "done" } : m === "GET" ? [] : undefined));
    const sim = createMockApi(memory());
    const api = createRealApi(http, sim, null);
    const itad = { kind: "service", service: "itad" } as const;
    await api.getServices();
    await api.startWizard(itad);
    await api.submitWizard(itad, { kind: "continue" });
    expect(await api.submitWizard(itad, { kind: "continue" }).catch((e: unknown) => (e as ApiError).key)).toBe("wizard.expired"); // the wizard is over
    await api.startWizard(itad);
    await api.cancelWizard(itad);
    await api.disconnect(itad);
    await api.getGamePrices("g/1");
    await api.getPriceBoard();
    await api.refreshPrices({ canonicalIds: ["g1"], manual: true });
    await api.setPriceExclusion("g1", true);
    await api.setPriceExclusion("g1", false);
    await api.searchPrices("hades");
    await api.watchPrice("r1");
    await api.unwatchPrice("w1");
    expect(log).toEqual([
      "GET /api/services",
      "POST /api/services/itad/wizard {}",
      'POST /api/wizards/w%201/submit {"stepId":"intro","input":{"kind":"continue"}}',
      "POST /api/services/itad/wizard {}",
      "DELETE /api/wizards/w%201",
      "DELETE /api/services/itad/connection",
      "GET /api/prices/games/g%2F1",
      "GET /api/prices",
      'POST /api/prices/refresh {"canonicalIds":["g1"],"manual":true}',
      "PUT /api/prices/games/g1/exclusion {}",
      "DELETE /api/prices/games/g1/exclusion",
      'POST /api/prices/search {"title":"hades"}',
      'POST /api/prices/watch {"resultId":"r1"}',
      "DELETE /api/prices/watch/w1",
    ]);
  });

  it("settings: server fields from the server, the rest from the simulator, and each patch goes to its owner", async () => {
    const { http, log } = fakeHttp((m, p) => (p === "/api/settings" ? { ...serverSettings, ...(m === "PATCH" ? { detection: "manual-only" } : {}) } : undefined));
    const sim = createMockApi(memory());
    const api = createRealApi(http, sim);

    const first = await api.getSettings();
    expect(first).toMatchObject({ locale: "es", detection: "auto-and-manual", autostart: false, syncOnStart: true, autoUpdate: true, backups: { periodic: false, folder: null } });
    expect(first.scanRoots).toEqual(serverSettings.scanRoots); // never the simulator's sample roots

    log.length = 0;
    await api.updateSettings({ autostart: true, detection: "manual-only" });
    expect(log).toEqual(['PATCH /api/settings {"detection":"manual-only"}', "GET /api/settings"]);
    expect((await sim.getSettings()).autostart).toBe(true);
    expect((await sim.getSettings()).detection).toBeNull(); // detection was NOT written to the simulator

    log.length = 0;
    await api.updateSettings({ syncOnStart: false });
    expect(log).toEqual(["GET /api/settings"]); // nothing for the server to change
  });

  it("settings: backups and autoUpdate from the server win when it sends them", async () => {
    const { http } = fakeHttp(() => ({ ...serverSettings, backups: { periodic: false, folder: "E:\\B" }, autoUpdate: false }));
    const s = await createRealApi(http, createMockApi(memory())).getSettings();
    expect(s).toMatchObject({ backups: { periodic: false, folder: "E:\\B" }, autoUpdate: false });
  });

  it("stores: simulated wizard results sit on top of the real status, the real sync state is kept", async () => {
    const real = [
      { store: "steam", access: "official-api", connection: "disconnected", mode: "installed-only", sync: [{ operation: "scan", state: "idle", lastSuccessAt: 5_000 }] },
      { store: "gog", access: "unofficial-api", connection: "disconnected", mode: "library", sync: [] },
      { store: "epic", access: "unofficial-api", connection: "disconnected", mode: "library", sync: [] },
    ];
    const { http } = fakeHttp(() => real);
    const sim = createMockApi(memory());
    const api = createRealApi(http, sim);
    expect((await api.getStores())[0]).toMatchObject({ connection: "disconnected", mode: "installed-only" });

    // Steam (ADR 74), GOG (ADR 77) and Epic (ADR 78) are real: a simulated state never overlays them
    await sim.simulateExpiredSession("epic");
    expect((await api.getStores())[2]).toEqual(real[2]);
    await sim.simulateExpiredSession("gog");
    expect((await api.getStores())[1]).toEqual(real[1]);
    const steam = { kind: "store", store: "steam" } as const;
    await sim.startWizard(steam);
    await sim.submitWizard(steam, { kind: "fields", values: { mode: "installed-only" } });
    expect((await api.getStores())[0]).toEqual(real[0]);
  });

  it("steam account: wizard and disconnect go to the API with the stored wizard id", async () => {
    const store = new Map<string, string>();
    const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) };
    const step = { kind: "info", id: "choose", titleKey: "a", bodyKey: "b" };
    const apikey = { kind: "open-external", id: "apikey", titleKey: "a", bodyKey: "b", url: "https://steamcommunity.com/dev/apikey", awaits: "input" };
    let submits = 0;
    const { http, log } = fakeHttp((_m, p) => {
      if (p === "/api/stores/steam/wizard") return { wizardId: "w1", response: step };
      if (p === "/api/wizards/w1/callback") return { store: "steam", response: apikey };
      if (p === "/api/wizards/w1/submit") return ++submits === 1 ? step : { kind: "done", accountLabel: "Ana" };
      return undefined;
    });
    const sim = createMockApi(memory());
    vi.spyOn(sim as LudiaryApi, "startWizard");
    const api = createRealApi(http, sim, storage);
    const steam = { kind: "store", store: "steam" } as const;
    await expect(api.startWizard(steam)).resolves.toEqual(step);
    expect(store.get("ludiary.wizardId.steam")).toBe("w1");
    await api.submitWizard(steam, { kind: "continue" });
    // a fresh page (OpenID return) only has the id in sessionStorage
    const api2 = createRealApi(http, sim, storage);
    await expect(api2.wizardCallback("steam", { "openid.mode": "id_res" })).resolves.toEqual(apikey);
    await expect(api2.submitWizard(steam, { kind: "fields", values: { apiKey: "k" } })).resolves.toEqual({ kind: "done", accountLabel: "Ana" });
    expect(store.size).toBe(0); // done forgets the wizard
    await api2.disconnect(steam);
    expect(log).toEqual([
      "POST /api/stores/steam/wizard {}",
      'POST /api/wizards/w1/submit {"stepId":"choose","input":{"kind":"continue"}}',
      'POST /api/wizards/w1/callback {"query":{"openid.mode":"id_res"}}',
      'POST /api/wizards/w1/submit {"stepId":"apikey","input":{"kind":"fields","values":{"apiKey":"k"}}}',
      "DELETE /api/stores/steam/connection",
    ]);
    expect(sim.startWizard).not.toHaveBeenCalled();
  });

  it("steam account: a 404 becomes wizard.expired, no stored wizard means null, cancel deletes", async () => {
    const store = new Map([["ludiary.wizardId.steam", "w9"]]);
    const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: () => undefined, removeItem: (k: string) => void store.delete(k) };
    const { http, log } = fakeHttp((_m, p) => (p.endsWith("/callback") ? new ApiError(404, "not-found", "core.errors.not-found") : undefined));
    const mk = () => createRealApi(http, createMockApi(memory()), storage);
    const steam = { kind: "store", store: "steam" } as const;
    await expect(mk().wizardCallback("steam", {})).rejects.toMatchObject({ key: "wizard.expired" });
    expect(store.size).toBe(0);
    await expect(mk().wizardCallback("steam", {})).resolves.toBeNull();
    await expect(mk().submitWizard(steam, { kind: "continue" })).rejects.toMatchObject({ key: "wizard.expired" });
    store.set("ludiary.wizardId.steam", "w2");
    await mk().cancelWizard(steam);
    expect(log).toEqual(['POST /api/wizards/w9/callback {"query":{}}', "DELETE /api/wizards/w2"]);
  });

  it("gog account (ADR 77): wizard and disconnect go to the API, the id lives only in memory", async () => {
    const store = new Map<string, string>();
    const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) };
    store.set("ludiary.wizardId.steam", "ws"); // a Steam wizard in flight must survive GOG's
    const login = { kind: "open-external", id: "login", titleKey: "a", bodyKey: "b", url: "https://auth.gog.com/auth", awaits: "input" };
    let submits = 0;
    const { http, log } = fakeHttp((_m, p) => {
      if (p === "/api/stores/gog/wizard") return { wizardId: "g1", response: login };
      if (p === "/api/wizards/g1/submit") return ++submits === 1 ? { kind: "rejected", errorKey: "connectors.gog.error.code" } : { kind: "done", accountLabel: "TestUser" };
      return undefined;
    });
    const sim = createMockApi(memory());
    vi.spyOn(sim as LudiaryApi, "startWizard");
    const api = createRealApi(http, sim, storage);
    const gog = { kind: "store", store: "gog" } as const;
    await expect(api.startWizard(gog)).resolves.toEqual(login);
    expect([...store.keys()]).toEqual(["ludiary.wizardId.steam"]); // nothing new in sessionStorage
    const values = { redirectUrl: "https://embed.gog.com/on_login_success?origin=client&code=x" };
    await api.submitWizard(gog, { kind: "fields", values });
    await expect(api.submitWizard(gog, { kind: "fields", values })).resolves.toEqual({ kind: "done", accountLabel: "TestUser" });
    expect(store.get("ludiary.wizardId.steam")).toBe("ws"); // GOG's done did not forget Steam's id
    await api.disconnect(gog);
    await expect(api.wizardCallback("gog", {})).resolves.toBeNull(); // the return page is Steam's only
    expect(log).toEqual([
      "POST /api/stores/gog/wizard {}",
      `POST /api/wizards/g1/submit {"stepId":"login","input":{"kind":"fields","values":${JSON.stringify(values)}}}`,
      `POST /api/wizards/g1/submit {"stepId":"login","input":{"kind":"fields","values":${JSON.stringify(values)}}}`,
      "DELETE /api/stores/gog/connection",
    ]);
    expect(sim.startWizard).not.toHaveBeenCalled();
  });

  it("gog account: no wizard in memory means expired, and cancelling GOG never deletes Steam's wizard", async () => {
    const store = new Map([["ludiary.wizardId.steam", "ws"]]);
    const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: () => undefined, removeItem: (k: string) => void store.delete(k) };
    const { http, log } = fakeHttp(() => undefined);
    const api = createRealApi(http, createMockApi(memory()), storage);
    const gog = { kind: "store", store: "gog" } as const;
    await expect(api.submitWizard(gog, { kind: "continue" })).rejects.toMatchObject({ key: "wizard.expired" });
    await api.cancelWizard(gog);
    expect(store.get("ludiary.wizardId.steam")).toBe("ws");
    expect(log).toEqual([]);
  });

  it("getStores keeps the real state of GOG on top of a simulated connection", async () => {
    const real = [{ store: "gog", access: "unofficial-api", connection: "expired", mode: "library", sync: [] }];
    const sim = createMockApi(memory());
    await sim.startWizard({ kind: "store", store: "gog" });
    await sim.submitWizard({ kind: "store", store: "gog" }, { kind: "continue" });
    const api = createRealApi(fakeHttp(() => real).http, sim);
    await expect(api.getStores()).resolves.toEqual(real);
  });

  it("maintenance: scan and sync times come from the real stores; no fake backup time, no sample collections", async () => {
    const real = [
      { store: "steam", access: "official-api", connection: "disconnected", mode: "installed-only", sync: [{ operation: "scan", state: "idle", lastSuccessAt: 7_000 }] },
      { store: "gog", access: "unofficial-api", connection: "disconnected", mode: "library", sync: [{ operation: "library", state: "idle", lastSuccessAt: 9_000 }] },
    ];
    const sim = createMockApi(memory());
    const api = createRealApi(fakeHttp(() => real).http, sim);
    await sim.createBackup();
    const m = await api.getMaintenance();
    expect(m).toMatchObject({ lastScanAt: 7_000, lastSyncAt: 9_000 });
    expect(m.lastBackupAt).toBeNull(); // the simulator made one, but no real copy exists
    const none = await createRealApi(fakeHttp(() => []).http, createMockApi(memory())).getMaintenance();
    expect(none).toMatchObject({ lastScanAt: null, lastSyncAt: null });
  });
});
