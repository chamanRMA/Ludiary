import type { GameDetailDto } from "@ludiary/api-contract";
import { describe, expect, it, vi } from "vitest";
import type { LudiaryApi } from "./api";
import { ApiError, type Http } from "./http";
import { createMockApi, type KeyValueStorage } from "./mock";
import { createRealApi } from "./real";

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
      delete: async (p) => void (await run("DELETE", p)),
    },
  };
}

const serverSettings = {
  locale: "es",
  detection: "auto-and-manual",
  scanRoots: [{ id: "a", origin: "discovered", path: "C:\\Steam", enabled: true, store: "steam" }],
};

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

describe("real client: point B, the rest comes from the simulator", () => {
  it("delegates other stores' wizards without touching the server; services are empty and simulated-only actions are refused", async () => {
    const { http, log } = fakeHttp(() => []);
    const sim = createMockApi(memory());
    const names = ["startWizard", "submitWizard", "cancelWizard", "disconnect"] as const;
    for (const name of names) vi.spyOn(sim as LudiaryApi, name);
    const api = createRealApi(http, sim, null);
    const epic = { kind: "service", service: "rawg" } as const;
    expect(await api.getServices()).toEqual([]);
    await api.startWizard(epic);
    await api.submitWizard(epic, { kind: "continue" });
    await api.cancelWizard(epic);
    await api.disconnect(epic);
    await expect(api.createBackup()).rejects.toBeInstanceOf(ApiError);
    await expect(api.exportLogs()).rejects.toBeInstanceOf(ApiError);
    await expect(api.simulateExpiredSession("ubisoft")).rejects.toBeInstanceOf(ApiError);
    await api.revokeSessions();
    for (const name of names) expect(sim[name], name).toHaveBeenCalled();
    expect(log).toEqual(["POST /api/sessions/revoke {}"]);
  });

  it("settings: server fields from the server, the rest from the simulator, and each patch goes to its owner", async () => {
    const { http, log } = fakeHttp((m, p) => (p === "/api/settings" ? { ...serverSettings, ...(m === "PATCH" ? { detection: "manual-only" } : {}) } : undefined));
    const sim = createMockApi(memory());
    const api = createRealApi(http, sim);

    const first = await api.getSettings();
    expect(first).toMatchObject({ locale: "es", detection: "auto-and-manual", autostart: false, syncOnStart: true, autoUpdate: true, backups: { periodic: true, folder: null } });
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
    expect(await api.getCollections()).toEqual([]);
    const none = await createRealApi(fakeHttp(() => []).http, createMockApi(memory())).getMaintenance();
    expect(none).toMatchObject({ lastScanAt: null, lastSyncAt: null });
  });
});
