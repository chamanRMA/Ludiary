// Library operation, install and disconnect (ADR 74 points 7 and 9, point 12 answers).
import { ConnectorError } from "@ludiary/contracts";
import type { LibrarySnapshot, StoreConnector, SyncContext } from "@ludiary/contracts";
import { describe, expect, it, vi } from "vitest";
import { addUserRoot, entry, fakeCipher, harness, makeConnector, offlineHttp, owned, type Harness } from "./helpers";

const LIB = "D:\\Games";
const MIN = 60_000;
const HOUR = 3_600_000;

interface Setup {
  snapshot: () => LibrarySnapshot | Promise<LibrarySnapshot>;
  calls: { library: number };
  log: string[];
}

async function lib(opts: { connected?: boolean; scan?: boolean; connector?: Partial<Parameters<typeof makeConnector>[0]>; harness?: Parameters<typeof harness>[0] } = {}) {
  const s: Setup = { snapshot: () => ({ complete: true, entries: [owned("10", "Portal"), owned("20", "Half-Life")] }), calls: { library: 0 }, log: [] };
  const connector = makeConnector({
    caps: { library: true, actions: ["play", "install"], storePlaytime: true },
    library: async (_ctx: SyncContext) => {
      s.calls.library++;
      s.log.push("library:start");
      const out = await s.snapshot();
      s.log.push("library:end");
      return out;
    },
    scan: async () => {
      s.log.push("scan:start");
      await Promise.resolve();
      s.log.push("scan:end");
      return { entries: [entry("10", "portal", `${LIB}\\Portal`)], unreadableRoots: [] };
    },
    resolveAction: async (p, action) => ({ kind: "uri", uri: `steam://${action === "install" ? "install" : "rungameid"}/${p.storeGameId}` }),
    connection: {
      start: async () => ({ kind: "info", id: "choose", titleKey: "connectors.steam.t" as never, bodyKey: "connectors.steam.b" as never }),
      submit: async () => ({ kind: "done" }),
      status: async () => ({ state: "connected" }),
      disconnect: async (ctx) => ctx.secrets.delete("apiKey"),
    },
    ...opts.connector,
  });
  const h = await harness({
    dirs: [LIB],
    connectors: [connector],
    http: () => offlineHttp,
    ...(opts.connected === false ? {} : { connected: ["steam" as const] }),
    ...opts.harness,
  });
  addUserRoot(h, LIB);
  return { h, s, connector };
}

const syncLibrary = async (h: Harness, trigger: "open" | "manual" = "manual") => {
  await h.core.requestSync({ trigger, operations: ["library"] });
  await h.core.whenIdle();
};
const libState = (h: Harness) => h.store.sync.get("steam:library");
const titles = async (h: Harness) => (await h.core.listLibrary()).map((g) => g.title).sort();

describe("library operation: plan", () => {
  it("stores owned games that are not installed, with the store's playtime and last played", async () => {
    const { h, s } = await lib();
    s.snapshot = () => ({
      complete: true,
      entries: [owned("10", "Portal", { storePlaytimeMinutes: 90, storeLastPlayedAt: "2024-01-02T03:04:05.000Z" }), owned("20", "Half-Life")],
    });
    await syncLibrary(h);
    expect(await titles(h)).toEqual(["Half-Life", "Portal"]);
    const portal = (await h.core.listLibrary()).find((g) => g.title === "Portal")!;
    expect(portal).toMatchObject({ installed: false, playtimeMinutes: 90, mainAction: "install" });
    const p = [...h.store.properties.values()].find((x) => x.storeGameId === "10")!;
    expect(p).toMatchObject({ owned: true, storeLastPlayedAt: Date.parse("2024-01-02T03:04:05.000Z") });
    expect(libState(h)).toMatchObject({ status: "idle", error: null, lastSuccessAt: h.clock.time });
  });

  it("the same AppID is the same property whether the scan or the library saw it first", async () => {
    const { h } = await lib();
    await h.core.requestSync({ trigger: "manual", operations: ["scan"] });
    await h.core.whenIdle();
    expect(h.store.properties.size).toBe(1);
    h.clock.time += 20 * MIN;
    await syncLibrary(h);
    expect(h.store.properties.size).toBe(2); // 10 merged, 20 new
    expect(h.store.canonical.size).toBe(2);
    expect([...h.store.properties.values()].find((x) => x.storeGameId === "10")).toMatchObject({ owned: true });
    expect(h.store.installs.size).toBe(1);
    expect((await h.core.listLibrary()).find((g) => g.title === "Portal")).toMatchObject({ installed: true, mainAction: "play" });
  });

  it("a complete snapshot disowns what is missing and retires it unless it is installed; a partial one does not", async () => {
    const { h, s } = await lib();
    await h.core.requestSync({ trigger: "manual", operations: ["library", "scan"] }); // 10 gets installed by the scan
    await h.core.whenIdle();
    s.snapshot = () => ({ complete: false, entries: [] });
    h.clock.time += 20 * MIN;
    await syncLibrary(h);
    expect([...h.store.properties.values()].every((p) => p.owned && p.removedAt === null)).toBe(true);
    s.snapshot = () => ({ complete: true, entries: [owned("30", "New")] });
    h.clock.time += 20 * MIN;
    await syncLibrary(h);
    const byId = Object.fromEntries([...h.store.properties.values()].map((p) => [p.storeGameId, p]));
    expect(byId["10"]).toMatchObject({ owned: false, removedAt: null }); // installed: disowned, still shown
    expect(byId["20"]).toMatchObject({ owned: false });
    expect(byId["20"]!.removedAt).not.toBeNull();
    expect(byId["30"]).toMatchObject({ owned: true });
    expect(await titles(h)).toEqual(["New", "Portal"]);
  });

  it("an empty complete snapshot never empties the owned games (the empty-answer guard)", async () => {
    const { h, s } = await lib();
    await syncLibrary(h);
    s.snapshot = () => ({ complete: true, entries: [] });
    h.clock.time += 20 * MIN;
    await syncLibrary(h);
    expect(await titles(h)).toEqual(["Half-Life", "Portal"]);
    expect([...h.store.properties.values()].every((p) => p.owned)).toBe(true);
    expect(h.logs.some((l) => l.startsWith("warn:") && l.includes("empty library"))).toBe(true);
    expect(libState(h)).toMatchObject({ status: "idle" });
  });

  it("an empty complete snapshot with nothing owned is fine", async () => {
    const { h, s } = await lib();
    s.snapshot = () => ({ complete: true, entries: [] });
    await syncLibrary(h);
    expect(await titles(h)).toEqual([]);
    expect(libState(h)).toMatchObject({ status: "idle" });
  });

  it("drops invalid entries, DLC and repeats, and an invalid one makes the snapshot non-authoritative", async () => {
    const { h, s } = await lib();
    await syncLibrary(h);
    s.snapshot = () => ({
      complete: true,
      entries: [
        owned("10", "Portal"),
        owned("10", "Portal again"),
        owned("40", "Bad time", { storePlaytimeMinutes: -5 }),
        owned("41", "Bad date", { storeLastPlayedAt: "not a date" }),
        owned("42", "Bad media", { media: { coverUrl: "https://evil.example/x.jpg" } }),
        { storeGameId: "43", kind: "dlc", title: "Some DLC" },
        owned("", "No id"),
      ],
    });
    h.clock.time += 20 * MIN;
    await syncLibrary(h);
    const ids = [...h.store.properties.values()].map((p) => p.storeGameId).sort();
    expect(ids).toEqual(["10", "20", "42"]); // 42 keeps its game, only the foreign cover URL is dropped
    expect(h.store.properties.get([...h.store.properties.values()].find((p) => p.storeGameId === "20")!.id)).toMatchObject({ owned: true }); // not disowned
    expect(h.logs.join("\n")).not.toContain("Bad time");
  });

  it("is rejected as a whole when the entries are not a list", async () => {
    const { h, s } = await lib();
    s.snapshot = () => ({ complete: true, entries: "x" as never });
    await syncLibrary(h);
    expect(libState(h)).toMatchObject({ status: "error", error: { code: "store.unexpected-response" } });
    expect(h.store.properties.size).toBe(0);
  });
});

describe("library operation: who, when and in which order", () => {
  it("only runs for a connected store", async () => {
    const none = await lib({ connected: false });
    await syncLibrary(none.h);
    expect(none.s.calls.library).toBe(0);
    const expired = await lib({ connected: false });
    expired.h.store.connectionRows.set("steam", { store: "steam", status: "expired", accountLabel: null, connectedAt: 1 });
    await syncLibrary(expired.h);
    expect(expired.s.calls.library).toBe(0);
  });

  it("the manual button respects the floor of the connector", async () => {
    const { h, s } = await lib();
    await syncLibrary(h);
    h.clock.time += 9 * MIN;
    await syncLibrary(h);
    expect(s.calls.library).toBe(1);
    h.clock.time += 2 * MIN;
    await syncLibrary(h);
    expect(s.calls.library).toBe(2);
  });

  it("opening the web syncs only when the last good one is older than 6 hours", async () => {
    const { h, s } = await lib();
    await syncLibrary(h, "open");
    expect(s.calls.library).toBe(1);
    h.clock.time += 5 * HOUR;
    await syncLibrary(h, "open");
    expect(s.calls.library).toBe(1);
    h.clock.time += HOUR + MIN;
    await syncLibrary(h, "open");
    expect(s.calls.library).toBe(2);
  });

  it("after an error the automatic attempt waits twice the floor; the manual one only the floor", async () => {
    const { h, s } = await lib();
    let fail = true;
    s.snapshot = () => {
      if (fail) throw new ConnectorError("network.unavailable", "down");
      return { complete: true, entries: [owned("10", "Portal")] };
    };
    await syncLibrary(h, "open");
    expect(libState(h)).toMatchObject({ status: "error", error: { code: "network.unavailable" } });
    fail = false;
    h.clock.time += 15 * MIN;
    await syncLibrary(h, "open");
    expect(s.calls.library).toBe(1); // 15 < 20
    await syncLibrary(h, "manual");
    expect(s.calls.library).toBe(2); // the manual one is available after the floor (10 min)
    expect(libState(h)).toMatchObject({ status: "idle" });
  });

  it("a rejected key (401/403) leaves the store expired and the library as it was", async () => {
    const { h, s } = await lib();
    await syncLibrary(h);
    s.snapshot = () => {
      throw new ConnectorError("auth.invalid", "403", { messageKey: "connectors.steam.error.key" as never });
    };
    h.clock.time += 20 * MIN;
    await syncLibrary(h);
    expect(h.store.connectionRows.get("steam")?.status).toBe("expired");
    expect(libState(h)).toMatchObject({ status: "error", error: { code: "auth.invalid", key: "connectors.steam.error.key" } });
    expect(await titles(h)).toEqual(["Half-Life", "Portal"]);
    expect([...h.store.properties.values()].every((p) => p.owned && p.removedAt === null)).toBe(true);
    const status = (await h.core.storeStatus())[0]!;
    expect(status).toMatchObject({ connection: "expired", mode: "installed-only" });
    s.calls.library = 0;
    h.clock.time += 20 * MIN;
    await syncLibrary(h);
    expect(s.calls.library).toBe(0); // expired: no more calls until reconnected
  });

  it("a private profile is an error of the sync, not of the connection", async () => {
    const { h, s } = await lib();
    s.snapshot = () => {
      throw new ConnectorError("account.private-profile", "private", { messageKey: "connectors.steam.error.private" as never });
    };
    await syncLibrary(h);
    expect(h.store.connectionRows.get("steam")?.status).toBe("connected");
    expect(libState(h)).toMatchObject({ status: "error", error: { code: "account.private-profile" } });
  });

  it("library runs before scan in a store's queue and they never overlap", async () => {
    const { h, s } = await lib();
    await h.core.requestSync({ trigger: "manual", operations: ["scan", "library"] });
    await h.core.whenIdle();
    expect(s.log).toEqual(["library:start", "library:end", "scan:start", "scan:end"]);
  });

  it("a second request while one is running is ignored (the floor), not run in parallel", async () => {
    const { h, s } = await lib();
    let release: () => void = () => undefined;
    const gate = new Promise<void>((r) => (release = r));
    s.snapshot = async () => {
      await gate;
      return { complete: true, entries: [owned("10", "Portal")] };
    };
    await h.core.requestSync({ trigger: "manual", operations: ["library"] });
    await h.core.requestSync({ trigger: "manual", operations: ["library"] });
    release();
    await h.core.whenIdle();
    expect(s.calls.library).toBe(1);
  });

  it("onboarding not completed: nothing runs; completing it syncs the connected library", async () => {
    const { h, s } = await lib({ harness: { onboarded: false } });
    await syncLibrary(h);
    expect(s.calls.library).toBe(0);
    await h.core.completeOnboarding("manual-only");
    await h.core.whenIdle();
    expect(s.calls.library).toBe(1);
  });

  it("resolves media after a good sync (ADR 73)", async () => {
    const resolveMedia = vi.fn(async (ids: readonly string[]) => new Map(ids.map((id) => [id, { coverUrl: `https://shared.akamai.steamstatic.com/${id}.jpg` }])));
    const { h } = await lib({ connector: { resolveMedia } });
    await syncLibrary(h);
    expect(resolveMedia).toHaveBeenCalled();
    expect([...h.store.resolved.keys()].sort()).toEqual(["10", "20"]);
    expect(libState(h)).toMatchObject({ status: "idle" });
  });
});

describe("install (ADR 74 point 7)", () => {
  async function owner() {
    const x = await lib();
    await syncLibrary(x.h);
    const game = (title: string) => x.h.core.listLibrary().then((l) => l.find((g) => g.title === title)!.id);
    return { ...x, game };
  }

  it("opens the install URI of an owned game that is not installed, once per 5 seconds", async () => {
    const { h, game } = await owner();
    const id = await game("Half-Life");
    expect(await h.core.launch(id, undefined, "install")).toEqual({ status: "started" });
    expect(h.opened).toEqual(["steam://install/20"]);
    expect(await h.core.launch(id, undefined, "install")).toEqual({ status: "already-starting" });
    expect(h.opened).toHaveLength(1);
    h.clock.time += 6_000;
    expect(await h.core.launch(id, undefined, "install")).toEqual({ status: "started" });
  });

  it("is refused when the game is installed or not owned, and play is refused when it is not installed", async () => {
    const { h, game } = await owner();
    await h.core.requestSync({ trigger: "manual", operations: ["scan"] }); // installs Portal
    await h.core.whenIdle();
    await expect(h.core.launch(await game("Portal"), undefined, "install")).rejects.toMatchObject({ code: "action-unavailable" });
    await expect(h.core.launch(await game("Half-Life"), undefined, "play")).rejects.toMatchObject({ code: "not-installed" });
    const prop = [...h.store.properties.values()].find((p) => p.storeGameId === "20")!;
    h.store.properties.set(prop.id, { ...prop, owned: false });
    await expect(h.core.launch(await game("Half-Life"), prop.id, "install")).rejects.toMatchObject({ code: "action-unavailable" });
    expect(h.opened).toEqual([]);
  });

  it("is refused for an unknown action, for a store without the capability and for a mode that cannot launch", async () => {
    const { h, game } = await owner();
    const id = await game("Half-Life");
    await expect(h.core.launch(id, undefined, "format" as never)).rejects.toMatchObject({ code: "invalid-input" });
    const noInstall = await lib({ connector: { caps: { library: true, actions: ["play"] } } });
    await syncLibrary(noInstall.h);
    const id2 = (await noInstall.h.core.listLibrary())[0]!.id;
    await expect(noInstall.h.core.launch(id2, undefined, "install")).rejects.toMatchObject({ code: "action-unavailable" });
    const noLauncher = await lib({ harness: { launcher: null } });
    await syncLibrary(noLauncher.h);
    await expect(noLauncher.h.core.launch((await noLauncher.h.core.listLibrary())[0]!.id, undefined, "install")).rejects.toMatchObject({ code: "action-unavailable" });
  });

  it("the main action and the actions of a property follow the mode and the capabilities", async () => {
    const { h, game } = await owner();
    const id = await game("Half-Life");
    expect((await h.core.listLibrary()).map((g) => g.mainAction).sort()).toEqual(["install", "install"]);
    expect((await h.core.getGame(id))!.properties[0]).toMatchObject({ owned: true, actions: ["install"] });
    const noLauncher = await lib({ harness: { launcher: null } });
    await syncLibrary(noLauncher.h);
    expect((await noLauncher.h.core.listLibrary()).map((g) => g.mainAction)).toEqual([null, null]);
  });
});

describe("disconnect (ADR 74 point 9, point 12.1)", () => {
  it("wipes the secrets of the scope, the connection and the library sync state, and leaves the games alone", async () => {
    const { h } = await lib({ harness: { cipher: fakeCipher(1) } });
    await syncLibrary(h);
    await h.core.requestSync({ trigger: "manual", operations: ["scan"] });
    await h.core.whenIdle();
    h.store.secretRows.set("store:steam|apiKey", { scope: "store:steam", name: "apiKey", ciphertext: "x", keyId: 1, updatedAt: 1 });
    h.store.secretRows.set("store:steam|steamId", { scope: "store:steam", name: "steamId", ciphertext: "x", keyId: 9, updatedAt: 1 }); // a compartment
    h.store.secretRows.set("store:gog|apiKey", { scope: "store:gog", name: "apiKey", ciphertext: "x", keyId: 1, updatedAt: 1 });
    const before = [...h.store.properties.values()];
    await h.core.disconnect("steam");
    expect([...h.store.secretRows.keys()]).toEqual(["store:gog|apiKey"]);
    expect(h.store.connectionRows.has("steam")).toBe(false);
    expect(h.store.sync.has("steam:library")).toBe(false);
    expect(h.store.sync.has("steam:scan")).toBe(true);
    expect([...h.store.properties.values()]).toEqual(before); // no property is touched
    expect(await titles(h)).toEqual(["Half-Life", "Portal"]);
    expect((await h.core.storeStatus())[0]).toMatchObject({ connection: "disconnected", mode: "installed-only" });
  });

  it("a token rotation that ends after the disconnect stores nothing and writes no state (ADR 77, audit A2)", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    let setError: unknown = null;
    const { h } = await lib({
      harness: { cipher: fakeCipher(1) },
      connector: {
        library: async (ctx: SyncContext) => {
          await gate;
          try {
            await ctx.secrets.set("refreshToken", "rotated"); // the late write of a refreshed token
          } catch (e) {
            setError = e;
            throw e;
          }
          return { complete: true, entries: [owned("10", "Portal")] };
        },
      },
    });
    await h.core.requestSync({ trigger: "manual", operations: ["library"] });
    await h.core.disconnect("steam");
    release();
    await h.core.whenIdle();
    expect([...h.store.secretRows.keys()].filter((k) => k.startsWith("store:steam|"))).toEqual([]);
    expect(setError).toMatchObject({ code: "auth.required" });
    expect(h.store.sync.has("steam:library")).toBe(false);
    expect(h.store.connectionRows.has("steam")).toBe(false);
    expect(await titles(h)).toEqual([]); // the dropped result did not touch the library
  });

  it("a connector that fails to disconnect cannot stop the wipe; a store without connection is not-found", async () => {
    const { h } = await lib({
      connector: {
        connection: {
          start: async () => ({ kind: "info", id: "choose", titleKey: "connectors.steam.t" as never, bodyKey: "connectors.steam.b" as never }),
          submit: async () => ({ kind: "done" }),
          status: async () => ({ state: "connected" }),
          disconnect: async () => {
            throw new Error("boom");
          },
        },
      },
    });
    h.store.secretRows.set("store:steam|apiKey", { scope: "store:steam", name: "apiKey", ciphertext: "x", keyId: 1, updatedAt: 1 });
    await h.core.disconnect("steam");
    expect(h.store.secretRows.size).toBe(0);
    expect(h.store.connectionRows.has("steam")).toBe(false);
    await expect(h.core.disconnect("gog")).rejects.toMatchObject({ code: "not-found" });
  });

  it("after reconnecting, a forced library sync runs at once (the sync state is gone)", async () => {
    const { h, s } = await lib();
    await syncLibrary(h);
    await h.core.disconnect("steam");
    h.store.connectionRows.set("steam", { store: "steam", status: "connected", accountLabel: null, connectedAt: h.clock.time });
    await syncLibrary(h); // no floor: nothing is left to wait for
    expect(s.calls.library).toBe(2);
  });
});
