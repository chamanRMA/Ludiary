import { ConnectorError, LocationsUnreadableError, type LocalFiles } from "@ludiary/contracts";
import type { ScanRootRecord } from "../src/model";
import { describe, expect, it, vi } from "vitest";
import { ConnectorRegistrationError, createCore } from "../src";
import { addUserRoot, entry, harness, makeConnector, resolver, scanNow, type Harness } from "./helpers";

const LIB = "D:\\Games";
const MEDIA = "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/10/library_600x900.jpg";

async function withGames(list: () => ReturnType<typeof entry>[], opts: Parameters<typeof harness>[0] = {}) {
  const calls = { n: 0 };
  const h = await harness({
    dirs: [LIB],
    connectors: [makeConnector({ scan: async () => (calls.n++, { entries: list(), unreadableRoots: [] }) })],
    ...opts,
  });
  addUserRoot(h, LIB);
  return { h, calls };
}

const titles = async (h: Harness) => (await h.core.listLibrary()).map((g) => g.title).sort();

describe("scan plan", () => {
  it("creates a canonical game, a property and an installation for a new entry", async () => {
    const { h } = await withGames(() => [entry("10", "Portal", `${LIB}\\Portal`, { media: { coverUrl: MEDIA } })]);
    await scanNow(h);
    const lib = await h.core.listLibrary();
    expect(lib).toHaveLength(1);
    expect(lib[0]).toMatchObject({ title: "Portal", installed: true, stores: ["steam"] });
    const detail = await h.core.getGame(lib[0]!.id);
    expect(detail?.properties[0]).toMatchObject({ store: "steam", installed: true, actions: ["play"] });
    const status = (await h.core.storeStatus())[0]!;
    expect(status.sync[0]).toMatchObject({ status: "idle", error: null });
  });

  it("updates title and installation of an existing property", async () => {
    let title = "Portal";
    let path = `${LIB}\\Portal`;
    const { h } = await withGames(() => [entry("10", title, path)]);
    await scanNow(h);
    title = "Portal Renamed";
    path = `${LIB}\\Portal2`;
    h.clock.time += 120_000;
    await scanNow(h);
    expect(await titles(h)).toEqual(["Portal Renamed"]);
    expect([...h.store.installs.values()].map((i) => i.installPath)).toEqual([`${LIB}\\Portal2`]);
    expect(h.store.properties.size).toBe(1);
  });

  it("retires a scan-only property that disappears, keeps its canonical, and revives it when it returns", async () => {
    let present = true;
    const { h } = await withGames(() => (present ? [entry("10", "Portal", `${LIB}\\Portal`)] : []));
    await scanNow(h);
    const canonicalId = (await h.core.listLibrary())[0]!.id;
    present = false;
    h.clock.time += 120_000;
    await scanNow(h);
    expect(await h.core.listLibrary()).toHaveLength(0);
    expect(h.store.installs.size).toBe(0);
    const prop = [...h.store.properties.values()][0]!;
    expect(prop.removedAt).not.toBeNull();
    expect(h.store.canonical.has(canonicalId)).toBe(true);
    present = true;
    h.clock.time += 120_000;
    await scanNow(h);
    const lib = await h.core.listLibrary();
    expect(lib.map((g) => g.id)).toEqual([canonicalId]);
    expect([...h.store.properties.values()][0]!.removedAt).toBeNull();
  });

  it("keeps what lies under an unreadable root", async () => {
    let unreadable = false;
    const h = await harness({
      dirs: [LIB],
      connectors: [
        makeConnector({
          scan: async (ctx) =>
            unreadable
              ? { entries: [], unreadableRoots: [{ root: ctx.roots[0]!, code: "scan.root-unreadable" }] }
              : { entries: [entry("10", "Portal", `${LIB}\\Portal`)], unreadableRoots: [] },
        }),
      ],
    });
    addUserRoot(h, LIB);
    await scanNow(h);
    unreadable = true;
    h.clock.time += 120_000;
    await scanNow(h);
    expect(await h.core.listLibrary()).toHaveLength(1);
    expect(h.store.installs.size).toBe(1);
    const st = (await h.core.storeStatus())[0]!.sync[0]!;
    expect(st.status).toBe("error");
    expect(st.error?.code).toBe("scan.root-unreadable");
  });

  it("removes only what lies under a readable root when another root is unreadable", async () => {
    const h = await harness({
      dirs: [LIB, "E:\\More"],
      connectors: [
        makeConnector({
          scan: async (ctx) => ({
            entries: [],
            unreadableRoots: [{ root: ctx.roots.find((r) => r.path === "E:\\More")!, code: "scan.root-unreadable" }],
          }),
        }),
      ],
    });
    addUserRoot(h, LIB);
    addUserRoot(h, "E:\\More");
    // Seed two installations by hand, one under each root.
    for (const [id, path] of [["a", `${LIB}\\A`], ["b", "E:\\More\\B"]] as const) {
      h.store.canonical.set(`c-${id}`, { id: `c-${id}`, title: id });
      h.store.properties.set(`p-${id}`, { id: `p-${id}`, canonicalGameId: `c-${id}`, store: "steam", storeGameId: id, kind: "game", baseStoreGameId: null, title: id, normalizedTitle: id, owned: false, removedAt: null, storePlaytimeMinutes: null, storeLastPlayedAt: null });
      h.store.installs.set(`i-${id}`, { id: `i-${id}`, propertyId: `p-${id}`, deviceId: "dev", installPath: path, launchData: null });
    }
    await scanNow(h);
    expect([...h.store.installs.keys()]).toEqual(["i-b"]);
    expect(h.store.properties.get("p-a")!.removedAt).not.toBeNull();
    expect(h.store.properties.get("p-b")!.removedAt).toBeNull();
  });

  it("never retires an owned property, even without installations", async () => {
    const { h } = await withGames(() => []);
    h.store.canonical.set("c", { id: "c", title: "Owned" });
    h.store.properties.set("p", { id: "p", canonicalGameId: "c", store: "steam", storeGameId: "1", kind: "game", baseStoreGameId: null, title: "Owned", normalizedTitle: "owned", owned: true, removedAt: null, storePlaytimeMinutes: null, storeLastPlayedAt: null });
    await scanNow(h);
    expect(h.store.properties.get("p")!.removedAt).toBeNull();
  });

  it("disabling a folder withdraws its games and enabling it brings them back", async () => {
    const { h } = await withGames(() => [entry("10", "Portal", `${LIB}\\Portal`)]);
    await scanNow(h);
    expect(await h.core.listLibrary()).toHaveLength(1);
    const root = [...h.store.roots.values()][0]!;
    await h.core.setScanRootEnabled(root.id, false); // forced: no 60 s wait
    await h.core.whenIdle();
    expect(await h.core.listLibrary()).toHaveLength(0);
    await h.core.setScanRootEnabled(root.id, true);
    await h.core.whenIdle();
    expect(await h.core.listLibrary()).toHaveLength(1);
  });

  it("never merges two properties of the same store", async () => {
    const { h } = await withGames(() => [entry("1", "Same Title", `${LIB}\\A`), entry("2", "Same Title", `${LIB}\\B`)]);
    await scanNow(h);
    expect(await h.core.listLibrary()).toHaveLength(2);
    expect(h.store.canonical.size).toBe(2);
  });

  it("a failed scan changes nothing", async () => {
    let fail = false;
    const { h } = await withGames(() => {
      if (fail) throw new Error("boom");
      return [entry("10", "Portal", `${LIB}\\Portal`)];
    });
    await scanNow(h);
    fail = true;
    h.clock.time += 120_000;
    await scanNow(h);
    expect(await h.core.listLibrary()).toHaveLength(1);
    const st = (await h.core.storeStatus())[0]!.sync[0]!;
    expect(st).toMatchObject({ status: "error", error: { code: "internal" } });
    expect(st.lastSuccessAt).not.toBeNull();
  });
});

describe("waiting time and forced scans", () => {
  it("waits 60 s since the last attempt, then scans again", async () => {
    const { h, calls } = await withGames(() => []);
    await scanNow(h);
    h.clock.time += 30_000;
    await scanNow(h);
    expect(calls.n).toBe(1);
    h.clock.time += 31_000;
    await scanNow(h);
    expect(calls.n).toBe(2);
  });

  it("changing the detection mode forces a scan without waiting", async () => {
    const { h, calls } = await withGames(() => []);
    await scanNow(h);
    await h.core.updateSettings({ detection: "auto-and-manual" });
    await h.core.whenIdle();
    expect(calls.n).toBe(2);
    await h.core.updateSettings({ locale: "es" }); // not a detection change
    await h.core.whenIdle();
    expect(calls.n).toBe(2);
  });

  it("requests only for 'library' do nothing in this cut", async () => {
    const { h, calls } = await withGames(() => []);
    await h.core.requestSync({ trigger: "manual", operations: ["library"] });
    await h.core.whenIdle();
    expect(calls.n).toBe(0);
  });

  it("marks the store as running before requestSync resolves", async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((r) => (release = r));
    const h = await harness({ dirs: [LIB], connectors: [makeConnector({ scan: async () => (await gate, { entries: [], unreadableRoots: [] }) })] });
    addUserRoot(h, LIB);
    await h.core.requestSync({ trigger: "open" });
    expect((await h.core.storeStatus())[0]!.sync[0]!.status).toBe("running");
    release();
    await h.core.whenIdle();
    expect((await h.core.storeStatus())[0]!.sync[0]!.status).toBe("idle");
  });

  it("resets orphaned 'running' states at startup", async () => {
    const h = await harness();
    h.store.sync.set("steam:scan", { store: "steam", operation: "scan", lastAttemptAt: 1, lastSuccessAt: null, status: "running", error: null, nextAllowedAt: null });
    await createCore(h.deps);
    expect(h.store.sync.get("steam:scan")!.status).toBe("idle");
  });
});

describe("detection modes (ADR 42, 72)", () => {
  const discoverTwo = {
    discover: async () => [
      { declarationId: "steam-root", path: "C:\\Steam", tag: "library" },
      { declarationId: "steam-root", path: "E:\\Lib", tag: "library" },
    ],
  };

  async function modeHarness(mode: "auto-and-manual" | "manual-only" | "later" | null, onboarded = true) {
    const seen: string[][] = [];
    const resolve = vi.fn(async () => [{ declarationId: "steam-root", path: "C:\\Steam" }]);
    const h = await harness({
      dirs: [LIB, "C:\\Steam", "E:\\Lib"],
      mode,
      onboarded,
      locations: { resolve },
      connectors: [
        makeConnector({
          ...discoverTwo,
          scan: async (ctx) => (seen.push(ctx.roots.map((r) => `${r.origin}:${r.path}`)), { entries: [], unreadableRoots: [] }),
        }),
      ],
    });
    addUserRoot(h, LIB);
    return { h, seen, resolve };
  }

  it("does nothing before the first run is completed", async () => {
    const { h, seen } = await modeHarness("auto-and-manual", false);
    await scanNow(h);
    expect(seen).toEqual([]);
    expect(h.store.sync.size).toBe(0);
  });

  it("'later': no roots, the connector is not called, detected installations are withdrawn", async () => {
    const { h, seen, resolve } = await modeHarness("later");
    h.store.canonical.set("c", { id: "c", title: "X" });
    h.store.properties.set("p", { id: "p", canonicalGameId: "c", store: "steam", storeGameId: "1", kind: "game", baseStoreGameId: null, title: "X", normalizedTitle: "x", owned: false, removedAt: null, storePlaytimeMinutes: null, storeLastPlayedAt: null });
    h.store.installs.set("i", { id: "i", propertyId: "p", deviceId: "dev", installPath: `${LIB}\\X`, launchData: null });
    await scanNow(h);
    expect(seen).toEqual([]);
    expect(resolve).not.toHaveBeenCalled();
    expect(h.store.installs.size).toBe(0);
    expect(h.store.properties.get("p")!.removedAt).not.toBeNull();
  });

  it("null mode behaves as 'later'", async () => {
    const { h, seen } = await modeHarness(null);
    await scanNow(h);
    expect(seen).toEqual([]);
  });

  it("'manual-only': only enabled user folders, no auto-detection", async () => {
    const { h, seen, resolve } = await modeHarness("manual-only");
    addUserRoot(h, "E:\\Off", false);
    await scanNow(h);
    expect(seen).toEqual([[`user:${LIB}`]]);
    expect(resolve).not.toHaveBeenCalled();
  });

  it("'manual-only' ignores discovered roots stored by an earlier 'auto-and-manual' run", async () => {
    const { h, seen } = await modeHarness("auto-and-manual");
    await scanNow(h);
    expect(seen[0]).toContain("discovered:C:\\Steam");
    await h.core.updateSettings({ detection: "manual-only" });
    await h.core.whenIdle();
    expect(seen.at(-1)).toEqual([`user:${LIB}`]);
  });

  it("'auto-and-manual': resolves locations, discovers roots, stores them enabled and scans them", async () => {
    const { h, seen, resolve } = await modeHarness("auto-and-manual");
    await scanNow(h);
    expect(resolve).toHaveBeenCalledTimes(1); // only the 'scan' declaration, not the launcher
    expect(seen[0]).toEqual([`user:${LIB}`, "discovered:C:\\Steam", "discovered:E:\\Lib"]);
    const discovered = [...h.store.roots.values()].filter((r) => r.origin === "discovered");
    expect(discovered.map((r) => [r.path, r.enabled, r.tag, r.store])).toEqual([
      ["C:\\Steam", true, "library", "steam"],
      ["E:\\Lib", true, "library", "steam"],
    ]);
  });

  it("keeps the switch of a discovered root and deletes the ones the connector stops returning", async () => {
    const { h, seen } = await modeHarness("auto-and-manual");
    await scanNow(h);
    const off = [...h.store.roots.values()].find((r) => r.path === "E:\\Lib")!;
    h.store.roots.set(off.id, { ...off, enabled: false });
    h.clock.time += 120_000;
    await scanNow(h);
    expect(seen[1]).toEqual([`user:${LIB}`, "discovered:C:\\Steam"]);
    expect([...h.store.roots.values()].find((r) => r.path === "E:\\Lib")!.enabled).toBe(false);
    // The connector now returns only C:\Steam.
    h.deps.connectors[0]!.discoverRoots = async () => [{ declarationId: "steam-root", path: "C:\\Steam" }];
    h.clock.time += 120_000;
    await scanNow(h);
    expect([...h.store.roots.values()].map((r) => r.path).sort()).toEqual(["C:\\Steam", LIB]);
  });

  it("keeps stored discovered roots and scans them when a location cannot be read (ADR 79)", async () => {
    let fail = false;
    const seen: string[][] = [];
    const h = await harness({
      dirs: [LIB, "C:\\Steam", "E:\\Lib"],
      mode: "auto-and-manual",
      locations: {
        resolve: async () => {
          if (fail) throw new Error("registry helper unavailable");
          return [{ declarationId: "steam-root", path: "C:\\Steam" }];
        },
      },
      connectors: [
        makeConnector({
          ...discoverTwo,
          scan: async (ctx) => (seen.push(ctx.roots.map((r) => `${r.origin}:${r.path}`)), { entries: [], unreadableRoots: [] }),
        }),
      ],
    });
    addUserRoot(h, LIB);
    await scanNow(h);
    fail = true;
    h.clock.time += 120_000;
    await scanNow(h);
    expect(seen[1]).toEqual(seen[0]);
    expect([...h.store.roots.values()].filter((r) => r.origin === "discovered")).toHaveLength(2);
  });

  it("hands a connector's tag back in ScanRoot after storing the root (ADR 79)", async () => {
    const seen: unknown[] = [];
    const h = await harness({
      dirs: [LIB, "C:\\Steam"],
      mode: "auto-and-manual",
      locations: resolver({ "steam-root": [{ declarationId: "steam-root", path: "C:\\Steam", subkey: "900001" }] }),
      connectors: [
        makeConnector({
          discover: async (ctx) => ctx.locations.map((l) => ({ declarationId: l.declarationId, path: l.path, tag: `game-${l.subkey}` })),
          scan: async (ctx) => (seen.push(...ctx.roots), { entries: [], unreadableRoots: [] }),
        }),
      ],
    });
    await scanNow(h);
    expect(seen).toContainEqual({ origin: "discovered", declarationId: "steam-root", path: "C:\\Steam", tag: "game-900001" });
  });

  it("ignores discovered roots that are not directories, not declared or relative", async () => {
    const h = await harness({
      dirs: [LIB, "C:\\Steam"],
      mode: "auto-and-manual",
      locations: resolver({ "steam-root": [{ declarationId: "steam-root", path: "C:\\Steam" }] }),
      connectors: [
        makeConnector({
          discover: async () => [
            { declarationId: "steam-root", path: "C:\\Steam" },
            { declarationId: "steam-root", path: "Z:\\Missing" },
            { declarationId: "unknown", path: LIB },
            { declarationId: "steam-root", path: "relative\\dir" },
            { declarationId: "steam-root", path: "c:\\steam\\" },
          ],
        }),
      ],
    });
    await scanNow(h);
    expect([...h.store.roots.values()].map((r) => r.path)).toEqual(["C:\\Steam"]);
  });
});

describe("isolation and time limit (ADR 40 rule 1)", () => {
  it("a failing connector does not affect the others and non-connector errors become 'internal'", async () => {
    const h = await harness({
      dirs: [LIB],
      connectors: [
        makeConnector({ id: "gog", scan: async () => Promise.reject(new TypeError("bad")) }),
        makeConnector({ id: "steam", scan: async () => ({ entries: [entry("10", "Portal", `${LIB}\\Portal`)], unreadableRoots: [] }) }),
      ],
    });
    addUserRoot(h, LIB);
    await scanNow(h);
    expect(await titles(h)).toEqual(["Portal"]);
    const by = Object.fromEntries((await h.core.storeStatus()).map((s) => [s.store, s.sync[0]]));
    expect(by.gog).toMatchObject({ status: "error", error: { code: "internal" } });
    expect(by.steam).toMatchObject({ status: "idle", error: null });
  });

  it("keeps code and key of a ConnectorError", async () => {
    const h = await harness({
      dirs: [LIB],
      connectors: [makeConnector({ scan: async () => Promise.reject(new ConnectorError("store.rate-limited", "slow down", { params: { seconds: 5 } })) })],
    });
    addUserRoot(h, LIB);
    await scanNow(h);
    expect((await h.core.storeStatus())[0]!.sync[0]!.error).toEqual({
      code: "store.rate-limited",
      key: "connectors.common.errors.store.rate-limited",
      params: { seconds: 5 },
    });
  });

  it("gives up after the time limit even if the connector ignores the signal", async () => {
    const h = await harness({ dirs: [LIB], connectors: [makeConnector({ scan: () => new Promise(() => undefined) })] });
    addUserRoot(h, LIB);
    await h.core.requestSync({ trigger: "manual" });
    await vi.waitFor(() => expect(h.clock.controllers.length).toBeGreaterThan(0));
    h.clock.fire();
    await h.core.whenIdle();
    expect((await h.core.storeStatus())[0]!.sync[0]).toMatchObject({ status: "error", error: { code: "internal", key: "core.errors.timeout" } });
  });
});

describe("validation of connector output (ADR 40 rule 4)", () => {
  async function scanned(entries: ReturnType<typeof entry>[]) {
    const { h } = await withGames(() => entries);
    await scanNow(h);
    return h;
  }

  it("drops invalid entries without failing the scan", async () => {
    const long = "x".repeat(161);
    const h = await scanned([
      entry("ok", "Fine", `${LIB}\\Fine`),
      entry("rel", "Relative", "Fine\\Rel"),
      entry("out", "Outside", "C:\\Elsewhere\\Out"),
      entry("sibling", "Prefix trap", "D:\\Games2\\Trap"),
      entry("", "Empty id", `${LIB}\\E`),
      entry(long, "Long id", `${LIB}\\L`),
      entry("ctl", "Bad\u0007title", `${LIB}\\C`),
      entry("blank", "   ", `${LIB}\\B`),
      entry("long-title", "t".repeat(301), `${LIB}\\T`),
      entry("ld", "Launch data", `${LIB}\\D`, { launchData: Object.fromEntries(Array.from({ length: 17 }, (_, i) => [`k${i}`, "v"])) }),
      entry("ld2", "Launch data 2", `${LIB}\\D2`, { launchData: { k: "v".repeat(1025) } }),
      entry("dlc", "A DLC", `${LIB}\\DLC`, { kind: "dlc" }),
    ]);
    expect(await titles(h)).toEqual(["Fine"]);
    expect((await h.core.storeStatus())[0]!.sync[0]!.status).toBe("idle");
    expect(h.logs.some((l) => l.includes("not stored"))).toBe(true);
    expect(h.logs.join("\n")).not.toContain("Elsewhere");
  });

  it("accepts a 158-character id (ADR 78)", async () => {
    const h = await scanned([entry("x".repeat(158), "Epic sized", `${LIB}\\E`)]);
    expect(await titles(h)).toEqual(["Epic sized"]);
  });

  it("keeps the first of a repeated id", async () => {
    const h = await scanned([entry("1", "First", `${LIB}\\A`), entry("1", "Second", `${LIB}\\B`)]);
    expect(await titles(h)).toEqual(["First"]);
  });

  it("accepts launchData at the limits", async () => {
    const data = Object.fromEntries(Array.from({ length: 16 }, (_, i) => [`k${i}`, "v".repeat(1024)]));
    const h = await scanned([entry("1", "Limits", `${LIB}\\A`, { launchData: data })]);
    expect([...h.store.installs.values()][0]!.launchData).toEqual(data);
  });

  it("keeps only https media on a declared host", async () => {
    const bad = [
      "http://shared.akamai.steamstatic.com/a.jpg",
      "https://evil.example.com/a.jpg",
      "https://shared.akamai.steamstatic.com.evil.com/a.jpg",
      "https://user:pw@shared.akamai.steamstatic.com/a.jpg",
      "javascript:alert(1)",
      "not a url",
    ];
    const h = await scanned([
      entry("1", "Media", `${LIB}\\A`, { media: { coverUrl: MEDIA, heroUrl: bad[0]!, iconUrl: bad[1]! } }),
      ...bad.map((u, i) => entry(`b${i}`, `Bad ${i}`, `${LIB}\\B${i}`, { media: { coverUrl: u } })),
    ]);
    const plans = h.store.applied.flatMap((p) => p.create.map((c) => c.entry));
    expect(plans.find((e) => e.storeGameId === "1")!.media).toEqual({ coverUrl: MEDIA });
    for (let i = 0; i < bad.length; i++) expect(plans.find((e) => e.storeGameId === `b${i}`)!.media).toBeUndefined();
  });

  it("normalizes titles for storage", async () => {
    const h = await scanned([entry("1", "  Ratchet & Clank™  ", `${LIB}\\A`)]);
    expect([...h.store.properties.values()][0]).toMatchObject({ title: "Ratchet & Clank™", normalizedTitle: "ratchet and clank" });
  });
});

describe("connector registration", () => {
  it("refuses a connector whose manifest is wrong", async () => {
    const bad = makeConnector({ caps: { uriSchemes: ["http"] } });
    await expect(harness({ connectors: [bad] })).rejects.toBeInstanceOf(ConnectorRegistrationError);
  });
  it("refuses a duplicate id", async () => {
    await expect(harness({ connectors: [makeConnector(), makeConnector()] })).rejects.toThrow(/duplicate/);
  });
  it("refuses launch kinds the platform cannot run", async () => {
    const exec = makeConnector({ caps: { launchKinds: ["exec"], uriSchemes: [] } });
    await expect(harness({ connectors: [exec] })).rejects.toThrow(/launch kind 'exec'/);
  });
  it("accepts a mode without launcher (it cannot launch)", async () => {
    const h = await harness({ launcher: null });
    expect(h.core.capabilities).toEqual({ canScan: true, canLaunch: false, canPickFolder: false, canBackup: false });
  });
});

describe("discovery that cannot be completed (ADR 79)", () => {
  const decls = (...ids: string[]) =>
    ids.map((id) => ({ id, purpose: "scan" as const, os: ["windows" as const], sources: [{ kind: "known-folder" as const, folder: "ProgramFilesX86" as const, relative: id }] }));
  const stored = (path: string, declarationId: string, store = "steam"): ScanRootRecord => ({
    id: `r-${path}`, origin: "discovered", path, pathKey: path.toLowerCase(), declarationId, store: store as ScanRootRecord["store"], tag: null, enabled: true,
  });
  const scanned = () => {
    const seen: string[][] = [];
    return { seen, scan: async (ctx: { roots: readonly { origin: string; path: string }[] }) => (seen.push(ctx.roots.map((r) => r.path)), { entries: [], unreadableRoots: [] }) };
  };
  const scanState = (h: Harness) => [...h.store.sync.values()].find((s) => s.operation === "scan");

  it("an unreadable declaration keeps its stored roots, the other one goes on, and the state carries a warning", async () => {
    const { seen, scan } = scanned();
    const h = await harness({
      dirs: [LIB, "C:\\A", "E:\\Old", "C:\\Bp"],
      mode: "auto-and-manual",
      locations: {
        resolve: async (d) => {
          if (d.id === "b") throw new LocationsUnreadableError("down", [{ declarationId: "b", path: "C:\\Bp" }]);
          return [{ declarationId: "a", path: "C:\\A" }];
        },
      },
      connectors: [makeConnector({ locations: decls("a", "b"), scan })],
    });
    addUserRoot(h, LIB);
    const old = stored("E:\\Old", "b");
    h.store.roots.set(old.id, old);
    const gone = stored("E:\\GoneA", "a");
    h.store.roots.set(gone.id, gone);
    await scanNow(h);
    expect(seen[0]).toEqual([LIB, "C:\\A", "C:\\Bp", "E:\\Old"]);
    expect(h.store.roots.has(old.id)).toBe(true); // kept
    expect(h.store.roots.has(gone.id)).toBe(false); // its declaration did resolve
    expect(scanState(h)).toMatchObject({ status: "idle", error: { code: "scan.discovery-unavailable" } });
  });

  it("with the registry down and nothing resolved, stored roots are kept and scanned", async () => {
    const { seen, scan } = scanned();
    const h = await harness({
      dirs: ["E:\\Old"],
      mode: "auto-and-manual",
      locations: { resolve: async () => { throw new LocationsUnreadableError("down"); } },
      connectors: [makeConnector({ scan })],
    });
    const old = stored("E:\\Old", "steam-root");
    h.store.roots.set(old.id, old);
    await scanNow(h);
    expect(seen[0]).toEqual(["E:\\Old"]);
    expect(h.store.roots.has(old.id)).toBe(true);
    expect(scanState(h)?.error?.code).toBe("scan.discovery-unavailable");
  });

  it("a successful discovery leaves no warning", async () => {
    const h = await harness({ dirs: ["C:\\Steam"], mode: "auto-and-manual", locations: resolver({ "steam-root": [{ declarationId: "steam-root", path: "C:\\Steam" }] }), connectors: [makeConnector()] });
    await scanNow(h);
    expect(scanState(h)).toMatchObject({ status: "idle", error: null });
  });

  it("a folder that cannot be checked only unresolves its own declaration", async () => {
    const { seen, scan } = scanned();
    const h = await harness({
      dirs: ["C:\\A", "C:\\B", "E:\\OldA", "E:\\OldB"],
      mode: "auto-and-manual",
      locations: resolver({ a: [{ declarationId: "a", path: "C:\\A" }], b: [{ declarationId: "b", path: "C:\\B" }] }),
      connectors: [makeConnector({ locations: decls("a", "b"), scan })],
    });
    (h.files as LocalFiles).isDirectoryStrict = async (p) => {
      if (p === "C:\\B") throw Object.assign(new Error("denied"), { code: "EACCES" });
      return true;
    };
    const oldA = stored("E:\\OldA", "a");
    const oldB = stored("E:\\OldB", "b");
    h.store.roots.set(oldA.id, oldA);
    h.store.roots.set(oldB.id, oldB);
    await scanNow(h);
    expect(h.store.roots.has(oldA.id)).toBe(false); // "a" was read fine, so its missing root goes
    expect(h.store.roots.has(oldB.id)).toBe(true);
    expect(seen[0]).toEqual(["C:\\A", "E:\\OldB"]);
  });

  it("a folder that cannot be checked makes discovery null: stored roots stay", async () => {
    const { seen, scan } = scanned();
    const h = await harness({
      dirs: ["C:\\Steam", "E:\\Old"],
      mode: "auto-and-manual",
      locations: resolver({ "steam-root": [{ declarationId: "steam-root", path: "C:\\Steam" }] }),
      connectors: [makeConnector({ scan })],
    });
    (h.files as LocalFiles).isDirectoryStrict = async () => { throw Object.assign(new Error("denied"), { code: "EACCES" }); };
    const old = stored("E:\\Old", "steam-root");
    h.store.roots.set(old.id, old);
    await scanNow(h);
    expect(seen[0]).toEqual(["E:\\Old"]);
    expect(h.store.roots.has(old.id)).toBe(true);
  });

  it("a list cut at 64 deletes nothing stored", async () => {
    const many = Array.from({ length: 65 }, (_, i) => `C:\\G${i}`);
    const h = await harness({
      dirs: [...many, "E:\\Old"],
      mode: "auto-and-manual",
      locations: resolver({ "steam-root": many.map((p) => ({ declarationId: "steam-root", path: p })) }),
      connectors: [makeConnector()],
    });
    const old = stored("E:\\Old", "steam-root");
    h.store.roots.set(old.id, old);
    await scanNow(h);
    expect(h.store.roots.has(old.id)).toBe(true);
    expect([...h.store.roots.values()].filter((r) => r.origin === "discovered")).toHaveLength(65);
    expect(scanState(h)).toMatchObject({ status: "idle", error: { code: "scan.discovery-unavailable" } });
  });

  it("does not take a folder another store already owns, and does not touch that store's root", async () => {
    const { seen, scan } = scanned();
    const h = await harness({
      dirs: ["C:\\Shared"],
      mode: "auto-and-manual",
      locations: resolver({ "steam-root": [{ declarationId: "steam-root", path: "C:\\Shared" }] }),
      connectors: [makeConnector({ scan })],
    });
    const theirs = stored("C:\\Shared", "ubisoft-installs", "ubisoft");
    h.store.roots.set(theirs.id, theirs);
    await scanNow(h);
    expect(seen).toEqual([]); // nothing of its own to scan
    expect(h.store.roots.get(theirs.id)).toEqual(theirs);
    expect(h.store.roots.size).toBe(1);
  });
});
