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
    expect(log).toEqual(["POST /api/games/g1/launch {}", 'POST /api/games/g1/launch {"propertyId":"p1"}']);
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
  it("delegates wizards, services, collections, backups, logs and disconnect without touching the server", async () => {
    const { http, log } = fakeHttp(() => []);
    const sim = createMockApi(memory());
    const names = ["getServices", "startWizard", "submitWizard", "cancelWizard", "disconnect", "getCollections", "createBackup", "exportLogs", "simulateExpiredSession"] as const;
    for (const name of names) vi.spyOn(sim as LudiaryApi, name);
    const api = createRealApi(http, sim);
    const steam = { kind: "store", store: "steam" } as const;
    await api.getServices();
    await api.startWizard(steam);
    await api.submitWizard(steam, { kind: "continue" });
    await api.cancelWizard(steam);
    await api.disconnect(steam);
    await api.getCollections();
    await api.createBackup();
    await api.exportLogs();
    await api.simulateExpiredSession("epic");
    for (const name of names) expect(sim[name], name).toHaveBeenCalledTimes(1);
    expect(log).toEqual([]);
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
    ];
    const { http } = fakeHttp(() => real);
    const sim = createMockApi(memory());
    const api = createRealApi(http, sim);
    expect((await api.getStores())[0]).toMatchObject({ connection: "disconnected", mode: "installed-only" });

    const steam = { kind: "store", store: "steam" } as const;
    await sim.startWizard(steam);
    await sim.submitWizard(steam, { kind: "fields", values: { mode: "installed-only" } });
    const after = await api.getStores();
    expect(after[0]).toMatchObject({ connection: "connected", mode: "installed-only", sync: real[0]?.sync });
    expect(after[1]).toEqual(real[1]);
  });

  it("maintenance: scan and sync times come from the real stores, the backup time from the simulator", async () => {
    const real = [
      { store: "steam", access: "official-api", connection: "disconnected", mode: "installed-only", sync: [{ operation: "scan", state: "idle", lastSuccessAt: 7_000 }] },
      { store: "gog", access: "unofficial-api", connection: "disconnected", mode: "library", sync: [{ operation: "library", state: "idle", lastSuccessAt: 9_000 }] },
    ];
    const sim = createMockApi(memory());
    const api = createRealApi(fakeHttp(() => real).http, sim);
    await sim.createBackup();
    const m = await api.getMaintenance();
    expect(m).toMatchObject({ lastScanAt: 7_000, lastSyncAt: 9_000 });
    expect(m.lastBackupAt).not.toBeNull();
    const none = await createRealApi(fakeHttp(() => []).http, createMockApi(memory())).getMaintenance();
    expect(none).toMatchObject({ lastScanAt: null, lastSyncAt: null });
  });
});
