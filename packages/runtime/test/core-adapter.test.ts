import { ConnectorError } from "@ludiary/contracts";
import { CoreError, type GameDetail, type LudiaryCore, type ScanRootRecord, type StoreStatus } from "@ludiary/core";
import { describe, expect, it } from "vitest";
import { createCoreFacade, FacadeCoreError, toFacadeError } from "../src/core-adapter";

const root: ScanRootRecord = {
  id: "r1",
  origin: "discovered",
  path: "D:\\SteamLibrary",
  pathKey: "d:\\steamlibrary",
  declarationId: "steam-root",
  store: "steam",
  tag: "library",
  enabled: true,
};

const detail: GameDetail = {
  id: "g1",
  title: "Portal 2",
  coverUrl: "https://shared.akamai.steamstatic.com/a.jpg",
  stores: ["steam"],
  installed: true,
  favorite: false,
  playtimeMinutes: 0,
  tags: [],
  properties: [{ id: "p1", store: "steam", installed: true, installPath: "D:\\SteamLibrary\\steamapps\\common\\Portal 2", actions: ["play"] }],
  dlc: [],
  collections: [],
};

const status: StoreStatus = {
  store: "steam",
  access: "official-api",
  connection: "not-applicable",
  mode: "installed-only",
  sync: [
    {
      store: "steam",
      operation: "scan",
      lastAttemptAt: 5,
      lastSuccessAt: null,
      status: "error",
      nextAllowedAt: 65,
      error: { code: "scan.root-unreadable", key: "connectors.common.errors.scan.root-unreadable" as never },
    },
    { store: "steam", operation: "library", lastAttemptAt: null, lastSuccessAt: 9, status: "idle", error: null, nextAllowedAt: null },
  ],
};

function fakeCore(over: Partial<LudiaryCore> = {}): LudiaryCore & { calls: unknown[][] } {
  const calls: unknown[][] = [];
  const rec =
    <T>(name: string, value: T) =>
    async (...args: unknown[]) => {
      calls.push([name, ...args]);
      return value;
    };
  return {
    calls,
    capabilities: { canScan: true, canLaunch: true, canPickFolder: true },
    listLibrary: rec("listLibrary", [{ ...detail, internalOnly: "must not leak" } as never]),
    getGame: async (id: string) => (id === "g1" ? ({ ...detail, secret: "x" } as never) : null),
    launch: rec("launch", { status: "started" as const }),
    requestSync: rec("requestSync", undefined),
    whenIdle: rec("whenIdle", undefined),
    storeStatus: rec("storeStatus", [status]),
    getSettings: rec("getSettings", { locale: "es" as const, detection: "manual-only" as const }),
    updateSettings: rec("updateSettings", { locale: "en" as const, detection: null }),
    getOnboarding: rec("getOnboarding", { completedAt: 7, detection: "later" as const }),
    completeOnboarding: rec("completeOnboarding", undefined),
    resetOnboarding: rec("resetOnboarding", undefined),
    listScanRoots: rec("listScanRoots", [root]),
    setScanRootEnabled: rec("setScanRootEnabled", root),
    pickScanRoot: rec("pickScanRoot", root),
    removeScanRoot: rec("removeScanRoot", undefined),
    startWizard: rec("startWizard", { wizardId: "w1", response: { kind: "info", id: "choose", titleKey: "connectors.steam.choose.title", bodyKey: "connectors.steam.choose.body" } }),
    submitWizard: rec("submitWizard", { kind: "rejected", stepId: "apikey", error: { code: "auth.invalid", key: "connectors.steam.error.key", params: { a: 1 }, internal: "x" } }),
    wizardCallback: rec("wizardCallback", { store: "steam", response: { kind: "done", accountLabel: "Ana" } }),
    cancelWizard: rec("cancelWizard", undefined),
    disconnect: rec("disconnect", undefined),
    ...over,
  } as LudiaryCore & { calls: unknown[][] };
}

describe("core to LudiaryCoreFacade adapter (ADR 72 point 4)", () => {
  it("maps summaries and details to DTOs, dropping fields the contract does not define", async () => {
    const facade = createCoreFacade(fakeCore());
    const [first] = await facade.listLibrary();
    expect(first).toEqual({
      id: "g1",
      title: "Portal 2",
      coverUrl: "https://shared.akamai.steamstatic.com/a.jpg",
      stores: ["steam"],
      installed: true,
      favorite: false,
      playtimeMinutes: 0,
      tags: [],
    });
    expect(Object.keys(first!)).not.toContain("internalOnly");
    const game = await facade.getGame("g1");
    expect(game?.properties).toEqual([
      { id: "p1", store: "steam", installed: true, installPath: "D:\\SteamLibrary\\steamapps\\common\\Portal 2", actions: ["play"] },
    ]);
    expect(Object.keys(game!)).not.toContain("secret");
    expect(await facade.getGame("nope")).toBeNull();
  });

  it("maps store status: state names, optional fields only when present, translated errors", async () => {
    const [store] = await createCoreFacade(fakeCore()).storeStatus();
    expect(store).toEqual({
      store: "steam",
      access: "official-api",
      connection: "not-applicable",
      mode: "installed-only",
      sync: [
        { operation: "scan", state: "error", nextAllowedAt: 65, error: { code: "scan.root-unreadable", key: "connectors.common.errors.scan.root-unreadable" } },
        { operation: "library", state: "idle", lastSuccessAt: 9 },
      ],
    });
  });

  it("builds settings with the scan roots, and scan roots without internal columns", async () => {
    const core = fakeCore();
    const facade = createCoreFacade(core);
    expect(await facade.getSettings()).toEqual({
      locale: "es",
      detection: "manual-only",
      scanRoots: [{ id: "r1", origin: "discovered", path: "D:\\SteamLibrary", store: "steam", enabled: true, declarationId: "steam-root", tag: "library" }],
    });
    await facade.updateSettings({ locale: "en" });
    expect(core.calls.find((c) => c[0] === "updateSettings")).toEqual(["updateSettings", { locale: "en" }]);
    const picked = await facade.pickScanRoot();
    expect(picked).not.toHaveProperty("pathKey");
    expect(await facade.getOnboarding()).toEqual({ completedAt: 7, detection: "later" });
  });

  it("passes through a cancelled folder dialog and plain results", async () => {
    const facade = createCoreFacade(fakeCore({ pickScanRoot: async () => null }));
    expect(await facade.pickScanRoot()).toBeNull();
    expect(await facade.launch("g1", "p1")).toEqual({ status: "started" });
  });

  it("maps ADR 74 fields: mainAction, unsynced, owned stays out, accountLabel", async () => {
    const owned = { ...detail, installed: false, mainAction: "install" as const, unsynced: true, properties: [{ id: "p1", store: "steam" as const, installed: false, owned: true, actions: ["install" as const] }] };
    const facade = createCoreFacade(fakeCore({ listLibrary: async () => [owned], getGame: async () => owned, storeStatus: async () => [{ ...status, accountLabel: "Ana" }] }));
    const [g] = await facade.listLibrary();
    expect(g).toMatchObject({ mainAction: "install", unsynced: true });
    expect((await facade.getGame("g1"))!.properties).toEqual([{ id: "p1", store: "steam", installed: false, actions: ["install"] }]);
    expect((await facade.storeStatus())[0]!.accountLabel).toBe("Ana");
    expect((await createCoreFacade(fakeCore({ listLibrary: async () => [{ ...detail, mainAction: null }] })).listLibrary())[0]!.mainAction).toBeNull();
  });

  it("passes launch action and maps the wizard calls, converting rejected to a TranslatedErrorDto", async () => {
    const core = fakeCore();
    const facade = createCoreFacade(core);
    await facade.launch("g1", undefined, "install");
    expect(core.calls.at(-1)).toEqual(["launch", "g1", undefined, "install"]);
    expect((await facade.startWizard("steam", "http://127.0.0.1:1")).wizardId).toBe("w1");
    expect(core.calls.at(-1)).toEqual(["startWizard", "steam", "http://127.0.0.1:1"]);
    const rejected = await facade.submitWizard("w1", "apikey", { kind: "fields", values: { apiKey: "x" } });
    expect(rejected).toEqual({ kind: "rejected", stepId: "apikey", error: { code: "auth.invalid", key: "connectors.steam.error.key", params: { a: 1 } } });
    expect(await facade.wizardCallback("w1", { "openid.mode": "id_res" })).toEqual({ store: "steam", response: { kind: "done", accountLabel: "Ana" } });
    await facade.cancelWizard("w1");
    await facade.disconnect("steam");
    expect(core.calls.slice(-2)).toEqual([["cancelWizard", "w1"], ["disconnect", "steam"]]);
  });

  it("turns wizard CoreError into FacadeCoreError", async () => {
    const facade = createCoreFacade(fakeCore({ cancelWizard: async () => { throw new CoreError("not-found", "gone"); }, disconnect: async () => { throw new CoreError("not-found", "no"); } }));
    expect(await facade.disconnect("steam").catch((e: unknown) => e)).toBeInstanceOf(FacadeCoreError);
  });

  it("turns CoreError into the shape api expects, without message or cause", async () => {
    const cause = new Error("C:\\Users\\someone\\secret.txt");
    const facade = createCoreFacade(
      fakeCore({
        launch: async () => {
          throw new CoreError("launch.rejected", "bad uri for connector steam", { cause, params: { store: "steam" } });
        },
      }),
    );
    const error = (await facade.launch("g1").catch((e: unknown) => e)) as FacadeCoreError;
    expect(error).toBeInstanceOf(FacadeCoreError);
    expect(error).toMatchObject({ code: "launch.rejected", key: "core.errors.launch.rejected", params: { store: "steam" } });
    expect(error.cause).toBeUndefined();
    expect(error.message).not.toContain("someone");
  });

  it("turns a stray ConnectorError into the same shape and leaves unknown errors untouched (they end as 500)", () => {
    const connectorError = toFacadeError(new ConnectorError("network.timeout", "slow")) as FacadeCoreError;
    expect(connectorError).toMatchObject({ code: "network.timeout", key: "connectors.common.errors.network.timeout" });
    const unknown = new TypeError("boom");
    expect(toFacadeError(unknown)).toBe(unknown);
  });
});
