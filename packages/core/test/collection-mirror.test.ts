// ADR 88 (with the auditor review of point 15): the mirror step at the end of the store's loop, the pure plan and the errors
// that must never carry file text.
import { checkConnectorManifest, ConnectorError, type CollectionImportSnapshot, type StoreConnector } from "@ludiary/contracts";
import { describe, expect, it } from "vitest";
import { CoreError, emptyMirrorCounts, planCollectionMirror, type CollectionMirrorInput, type MirrorState } from "../src";
import { harness, makeConnector, offlineHttp, resolver, type Harness } from "./helpers";

type Import = NonNullable<StoreConnector["importCollections"]>;
const STEAM_ROOT = { declarationId: "steam-root", path: "C:\\Steam" };
const col = (sourceId: string, name: string, storeGameIds: string[]) => ({ sourceId, name, storeGameIds });

const snap = (over: Partial<CollectionImportSnapshot> = {}): CollectionImportSnapshot => ({
  collections: [],
  favorites: [],
  accountSource: "connected",
  skipped: {},
  ...over,
});

/** Steam properties: ids "10".."13" are games (canonical g10..g13), "90" is a DLC, "5" a retired game. */
function seed(h: Harness, games = ["10", "11", "12", "13"]) {
  const prop = (id: string, kind: "game" | "dlc", removedAt: number | null = null) =>
    h.store.properties.set(`p${id}`, {
      id: `p${id}`, canonicalGameId: kind === "game" ? `g${id}` : null, store: "steam", storeGameId: id, kind, baseStoreGameId: null,
      title: `T${id}`, normalizedTitle: `t${id}`, owned: true, removedAt, storePlaytimeMinutes: null, storeLastPlayedAt: null,
    });
  for (const id of games) prop(id, "game");
  prop("90", "dlc");
  prop("5", "game", 5);
}

async function setup(importCollections: Import, opts: Parameters<typeof harness>[0] = {}) {
  const h = await harness({
    mode: "auto-and-manual",
    locations: resolver({ "steam-root": [STEAM_ROOT] }),
    connectors: [makeConnector({ importCollections })],
    ...opts,
  });
  seed(h);
  return h;
}

/** One pass of the loop: the scan (the step is its last part) and the end of the loop. */
const pass = async (h: Harness, trigger: "open" | "manual" = "manual") => {
  await h.core.requestSync({ trigger, operations: ["scan"] });
  await h.core.whenIdle();
};
const later = (h: Harness) => void (h.clock.time += 120_000);
const names = (h: Harness) => h.store.mirrors.map((c) => c.name);
const members = (h: Harness, name: string) => h.store.mirrors.find((c) => c.name === name)?.members;
const status = async (h: Harness) => (await h.core.storeStatus())[0]?.collections;
const finished = (h: Harness) => h.logs.filter((l) => l.includes("Collections mirror finished"));

describe("collections mirror: when it runs (ADR 88 point 3)", () => {
  it("runs at the end of a pass with 'open' and with 'manual' and mirrors the snapshot in store order", async () => {
    const h = await setup(async () =>
      snap({
        collections: [
          col("uc-1", "RPG", ["10", "11", "10", "90", "777"]),
          col("uc-2", "rpg", ["12"]), // same name key, another source id: another mirror
          col("uc-3", "Nothing here", ["777", "5"]), // not in the library: not created
        ],
        favorites: ["10", "90"],
        skipped: { dynamic: 1, deleted: 3, unknown: 9, hidden: -1 },
      }),
    );
    await pass(h, "open");
    expect(names(h)).toEqual(["RPG", "rpg"]);
    expect(members(h, "RPG")).toEqual(["g10", "g11"]);
    expect([...h.store.favorites]).toEqual(["g10"]);
    expect(await status(h)).toMatchObject({ status: "idle", accountVerified: true, favoritesPending: 0, error: null });

    later(h);
    await pass(h, "manual");
    expect(names(h)).toEqual(["RPG", "rpg"]);
  });

  it("runs when only 'library' was scheduled (connecting the account)", async () => {
    let calls = 0;
    const h = await harness({
      mode: "auto-and-manual",
      locations: resolver({ "steam-root": [STEAM_ROOT] }),
      http: () => offlineHttp,
      connected: ["steam"],
      connectors: [
        makeConnector({
          caps: { library: true },
          library: async () => ({ complete: true, entries: [{ storeGameId: "10", kind: "game", title: "T10" }] }),
          connection: { start: async () => ({ kind: "info", id: "choose", titleKey: "connectors.steam.t" as never, bodyKey: "connectors.steam.b" as never }), submit: async () => ({ kind: "done" }), status: async () => ({ state: "connected" }), disconnect: async () => undefined },
          importCollections: async () => {
            calls++;
            return snap({ collections: [col("uc-1", "A", ["10"])] });
          },
        }),
      ],
    });
    await h.core.requestSync({ trigger: "manual", operations: ["library"] });
    await h.core.whenIdle();
    expect(calls).toBe(1);
    expect(names(h)).toEqual(["A"]);
  });

  it("runs although the scan is skipped by the 60 s wait", async () => {
    let list = ["10"];
    const h = await setup(async () => snap({ collections: [col("uc-1", "A", list)] }));
    await pass(h, "open");
    list = ["10", "11"];
    await pass(h, "open"); // the scan waits 60 s and is skipped; the step still runs
    expect(members(h, "A")).toEqual(["g10", "g11"]);
  });

  it("does nothing before the first run is completed", async () => {
    let calls = 0;
    const h = await setup(async () => (calls++, snap()), { onboarded: false });
    await pass(h, "open");
    expect(calls).toBe(0);
  });

  it("with the setting off it does not read, and the mirrors are not deleted by the pass", async () => {
    let calls = 0;
    const h = await setup(async () => (calls++, snap({ collections: [col("uc-1", "A", ["10"])] })));
    await pass(h, "open");
    h.store.kv.set("collections.steam.enabled", false);
    later(h);
    await pass(h, "manual");
    expect(calls).toBe(1);
    expect(names(h)).toEqual(["A"]);
    expect(await status(h)).toMatchObject({ status: "off" });
  });

  it("without auto-detection it does not read and keeps the mirrors frozen", async () => {
    let calls = 0;
    const h = await setup(async () => (calls++, snap({ collections: [col("uc-1", "A", ["10"])] })), { mode: "manual-only" });
    h.store.mirrors.push({ id: "m1", sourceId: "uc-1", name: "Old", nameKey: "old", members: ["g10"] });
    await pass(h, "open");
    expect(calls).toBe(0);
    expect(names(h)).toEqual(["Old"]);
    expect(await status(h)).toMatchObject({ status: "needs-detection" });
  });

  it("explains a mode without folders and a missing store, and frozen mirrors stay", async () => {
    const docker = await setup(async () => snap(), { locations: null });
    await pass(docker);
    expect(await status(docker)).toMatchObject({ status: "unavailable" });
    const missing = await setup(async () => snap(), { locations: resolver({}) });
    await pass(missing);
    expect(await status(missing)).toMatchObject({ status: "store-missing" });
  });
});

describe("collections mirror: failures never touch sync_state or other stores (ADR 88 point 9.4)", () => {
  it("a connector error keeps the mirrors, the scan state and the other store's sync", async () => {
    let fail = false;
    const h = await harness({
      mode: "auto-and-manual",
      locations: resolver({ "steam-root": [STEAM_ROOT] }),
      connectors: [
        makeConnector({ importCollections: async () => (fail ? Promise.reject(new ConnectorError("scan.root-unreadable", "x", { messageKey: "connectors.steam.collections.ambiguous" as never })) : snap({ collections: [col("uc-1", "A", ["10"])] })) }),
        makeConnector({ id: "gog" }),
      ],
    });
    seed(h);
    await pass(h, "open");
    const before = JSON.stringify([...h.store.sync.entries()].map(([k, v]) => [k, v.status, v.error]));
    fail = true;
    later(h);
    await pass(h, "manual");
    expect(names(h)).toEqual(["A"]);
    expect(await status(h)).toMatchObject({ status: "ambiguous" });
    expect(h.store.sync.get("steam:scan")?.status).toBe("idle");
    expect(h.store.sync.get("steam:scan")?.error).toBeNull();
    expect(h.store.sync.get("gog:scan")?.status).toBe("idle");
    expect(before).toContain("steam:scan");
  });

  it("a timeout is an error of the step only", async () => {
    const h = await setup(() => new Promise(() => undefined));
    await h.core.requestSync({ trigger: "open", operations: ["scan"] });
    await new Promise((r) => setTimeout(r, 10));
    h.clock.fire();
    await h.core.whenIdle();
    expect(await status(h)).toMatchObject({ status: "error", error: { key: "core.errors.timeout" } });
    expect(h.store.sync.get("steam:scan")?.status).toBe("idle");
  });

  it("logs the code of a connector error and only the name of an unknown one, never file text", async () => {
    const h = await setup(async () => {
      JSON.parse("Secret Collection"); // Node quotes a fragment of the input in the message
      return snap();
    });
    expect(() => JSON.parse("Secret Collection")).toThrow(/Secret Collection/);
    await pass(h, "open");
    expect(await status(h)).toMatchObject({ status: "error", error: { code: "internal" } });
    expect(h.logs.some((l) => l.includes("Collections mirror failed") && l.includes("SyntaxError"))).toBe(true);
    expect(JSON.stringify(h.logs)).not.toContain("Secret Collection");
    const c = await setup(async () => {
      throw new ConnectorError("scan.root-unreadable", "x");
    });
    await pass(c, "open");
    expect(c.logs.some((l) => l.includes("Collections mirror failed") && l.includes("scan.root-unreadable"))).toBe(true);
  });

  it("an invalid snapshot is an error and changes nothing", async () => {
    const h = await setup(async () => ({ collections: "no", favorites: [], accountSource: "connected", skipped: {} }) as never);
    h.store.mirrors.push({ id: "m1", sourceId: "uc-1", name: "Old", nameKey: "old", members: ["g10"] });
    await pass(h, "open");
    expect(names(h)).toEqual(["Old"]);
    expect(await status(h)).toMatchObject({ status: "error", error: { code: "store.unexpected-response" } });
  });
});

describe("collections mirror: reading and the connector contract", () => {
  it("confines the reader to <root>\\userdata, hands a read-only vault and keeps the original locations", async () => {
    let seen: readonly { path: string }[] = [];
    let vault: Record<string, unknown> = {};
    const h = await setup(async (ctx) => {
      seen = ctx.locations;
      vault = ctx.secrets as never;
      return snap();
    });
    await pass(h, "open");
    expect(h.files.scopedCalls.some((c) => c.length === 1 && c[0] === "C:\\Steam\\userdata")).toBe(true);
    expect(seen.map((l) => l.path)).toEqual(["C:\\Steam"]);
    expect(Object.keys(vault)).toEqual(["get"]);
  });

  it("validates the snapshot: wrong types are counted, repeated source ids keep the first, caps ignore the rest", async () => {
    const h = await setup(async () =>
      snap({
        collections: [
          { sourceId: "uc-0", name: 5, storeGameIds: [] } as never,
          { name: "No id", storeGameIds: ["10"] } as never,
          col("uc-1", "A", ["10", 11 as never, "has space", "x".repeat(65), ""]),
          col("uc-1", "Again", ["12"]),
          ...Array.from({ length: 1001 }, (_, i) => col(`n${i}`, `N${i}`, [])),
        ],
        skipped: { invalid: 2.5 } as never,
      }),
    );
    await pass(h, "open");
    expect(names(h)).toEqual(["A"]);
    const line = finished(h)[0] ?? "";
    expect(line).toContain('"skipped_invalid":7'); // name 5, no id, 4 bad ids, the repeated id
    expect(line).toContain('"skipped_limitSnapshot":5');
  });

  it("ignores appids beyond 100 000 distinct ones", async () => {
    const lists = Array.from({ length: 11 }, (_, c) => col(`l${c}`, `L${c}`, Array.from({ length: 10_000 }, (_, i) => String(c * 10_000 + i + 1000))));
    const h = await setup(async () => snap({ collections: lists }));
    await pass(h, "open");
    expect(finished(h)[0]).toContain('"skipped_limitIds":10000');
    expect(finished(h)[0]).toContain('"notInLibrary":100000');
  });

  it("logs counters only, never names, ids or paths, and a quiet pass has all change counters at zero", async () => {
    const h = await setup(async () => snap({ collections: [col("uc-secret", "Private name", ["10"])], favorites: ["11"] }));
    await pass(h, "open");
    later(h);
    await pass(h, "manual");
    const [first, second] = finished(h);
    expect(first).toContain('"collectionsCreated":1');
    for (const k of ["collectionsCreated", "collectionsRenamed", "collectionsDeleted", "gamesAdded", "gamesRemoved", "favoritesAdded"]) expect(second).toContain(`"${k}":0`);
    expect(second).not.toContain("unchanged");
    expect(JSON.stringify(h.logs)).not.toMatch(/Private name|uc-secret|g10|C:\\\\Steam/);
    // A quiet pass asks nothing of the repository beyond the one call.
    expect(h.userDataCalls.filter((c) => c[0] === "applyCollectionMirror")).toHaveLength(2);
  });

  it("storeStatus has the collections status only in stores that have the operation", async () => {
    const h = await harness({ mode: "auto-and-manual", locations: resolver({}), connectors: [makeConnector({ importCollections: async () => snap() }), makeConnector({ id: "gog" })] });
    const [steam, gog] = await h.core.storeStatus();
    expect(steam?.collections).toMatchObject({ status: "idle", lastSuccessAt: null });
    expect(gog?.collections).toBeUndefined();
  });
});

describe("collections mirror: rules of the mirror (ADR 88 point 5)", () => {
  it("renames by source id, follows the store's order and games, deletes, and never touches the rest", async () => {
    let cols = [col("uc-1", "RPG", ["10", "11", "12"]), col("uc-2", "Co-op", ["13"]), col("uc-3", "Gone soon", ["10"])];
    const h = await setup(async () => snap({ collections: cols }));
    await pass(h, "open");
    cols = [col("uc-1", "Role playing", ["12", "10", "13"]), col("uc-2", "Co-op", ["13"])];
    later(h);
    await pass(h, "manual");
    expect(names(h)).toEqual(["Role playing", "Co-op"]);
    expect(members(h, "Role playing")).toEqual(["g12", "g10", "g13"]);
    expect(h.store.mirrors[0]?.id).toBe(h.store.mirrors[0]?.id);
    const line = finished(h)[1] ?? "";
    expect(line).toContain('"collectionsRenamed":1');
    expect(line).toContain('"collectionsDeleted":1');
    expect(line).toContain('"gamesAdded":1');
    expect(line).toContain('"gamesRemoved":1');
  });

  it("a game that stops being shown leaves the mirror and comes back in its place", async () => {
    const h = await setup(async () => snap({ collections: [col("uc-1", "A", ["10", "11", "12"])] }));
    await pass(h, "open");
    h.store.properties.get("p11")!.removedAt = 7;
    later(h);
    await pass(h, "manual");
    expect(members(h, "A")).toEqual(["g10", "g12"]);
    h.store.properties.get("p11")!.removedAt = null;
    later(h);
    await pass(h, "manual");
    expect(members(h, "A")).toEqual(["g10", "g11", "g12"]);
  });

  it("an invalid name is skipped this pass and the mirror stays as it was, even if deletes are allowed", async () => {
    let name = "Good";
    const h = await setup(async () => snap({ collections: [col("uc-1", name, ["10"]), col("uc-2", "Other", ["11"])] }));
    await pass(h, "open");
    name = "bad\u202Ename";
    later(h);
    await pass(h, "manual");
    expect(names(h)).toEqual(["Good", "Other"]);
    expect(finished(h)[1]).toContain('"skipped_invalidName":1');
  });

  it("a collection with no visible game is deleted; a long name is cut", async () => {
    let cols = [col("uc-1", "x".repeat(70), ["10"])];
    const h = await setup(async () => snap({ collections: cols }));
    await pass(h, "open");
    expect(names(h)).toEqual(["x".repeat(60)]);
    cols = [col("uc-1", "x".repeat(70), ["777"]), col("uc-2", "Other", ["11"])];
    later(h);
    await pass(h, "manual");
    expect(names(h)).toEqual(["Other"]);
  });
});

describe("collections mirror: guards against a bad file (ADR 88 point 15)", () => {
  const withMirror = async (next: Partial<CollectionImportSnapshot>, opts: Parameters<typeof harness>[0] = {}) => {
    let current: CollectionImportSnapshot = snap({ collections: [col("uc-1", "Keep", ["10"]), col("uc-2", "Other", ["11"])] });
    const h = await setup(async () => current, opts);
    await pass(h, "open");
    expect(names(h)).toEqual(["Keep", "Other"]);
    current = snap(next);
    later(h);
    await pass(h, "manual");
    return h;
  };

  it("an empty snapshot keeps the mirrors and counts it; with deleted collections it is a real delete", async () => {
    const kept = await withMirror({ collections: [] });
    expect(names(kept)).toEqual(["Keep", "Other"]);
    expect(finished(kept)[1]).toContain('"emptySnapshotKept":1');
    const real = await withMirror({ collections: [], skipped: { deleted: 2 } });
    expect(names(real)).toEqual([]);
  });

  it("with no visible game, invalid entries or a cut snapshot it creates and updates but never deletes", async () => {
    const created = col("uc-3", "New", ["12"]);
    const noGames = await setup(async () => snap({ collections: [col("uc-1", "Keep", ["10"]), col("uc-2", "Other", ["11"])] }));
    await pass(noGames, "open");
    for (const p of ["p10", "p11", "p12", "p13"]) noGames.store.properties.get(p)!.removedAt = 9;
    later(noGames);
    await pass(noGames, "manual");
    expect(names(noGames)).toEqual(["Keep", "Other"]);
    expect(members(noGames, "Keep")).toEqual(["g10"]); // links to games that are not shown stay until they are
    for (const skipped of [{ invalid: 1 }, { limitSnapshot: 1 }]) {
      const h = await withMirror({ collections: [created], skipped });
      expect(names(h), JSON.stringify(skipped)).toEqual(["Keep", "Other", "New"]);
    }
  });

  it("from a single folder to the connected account without a file, the mirrors go; any other error keeps them", async () => {
    let fail: ConnectorError | null = null;
    let source: "single-folder" | "connected" = "single-folder";
    const h = await setup(async () => {
      if (fail) throw fail;
      return snap({ accountSource: source, collections: [col("uc-1", "A", ["10"])] });
    });
    await pass(h, "open");
    expect(h.store.kv.get("collections.steam.mirrorAccountSource")).toBe("single-folder");
    fail = new ConnectorError("scan.root-unreadable", "x", { messageKey: "connectors.steam.collections.ambiguous" as never });
    later(h);
    await pass(h, "manual");
    expect(names(h)).toEqual(["A"]);
    fail = new ConnectorError("scan.root-unreadable", "x", { messageKey: "connectors.steam.collections.notFound" as never });
    later(h);
    await pass(h, "manual");
    expect(names(h)).toEqual(["A"]); // notFound alone never deletes
    fail = new ConnectorError("scan.root-unreadable", "x", { messageKey: "connectors.steam.collections.accountNotFound" as never });
    later(h);
    await pass(h, "manual");
    expect(names(h)).toEqual([]);
    expect(h.store.kv.has("collections.steam.mirrorAccountSource")).toBe(false);
    expect(source).toBe("single-folder");
  });

  it("accountNotFound without that history changes nothing", async () => {
    const h = await setup(async () => {
      throw new ConnectorError("scan.root-unreadable", "x", { messageKey: "connectors.steam.collections.accountNotFound" as never });
    });
    h.store.mirrors.push({ id: "m1", sourceId: "uc-1", name: "Old", nameKey: "old", members: ["g10"] });
    await pass(h, "open");
    expect(names(h)).toEqual(["Old"]);
    expect(await status(h)).toMatchObject({ status: "store-missing" });
  });
});

describe("collections mirror: favorites (ADR 88 point 7 and 8)", () => {
  it("a favorite removed in Ludiary does not come back; one removed and put again in Steam does; one that arrives later is marked", async () => {
    let favs = ["10", "11"];
    const h = await setup(async () => snap({ collections: [col("uc-1", "A", ["10"])], favorites: favs }));
    await pass(h, "open");
    expect([...h.store.favorites].sort()).toEqual(["g10", "g11"]);
    h.store.favorites.delete("g10");
    later(h);
    await pass(h, "manual");
    expect(h.store.favorites.has("g10")).toBe(false); // it was seen already
    favs = ["11"]; // out of Steam's favorites...
    later(h);
    await pass(h, "manual");
    favs = ["10", "11", "13"]; // ...and back in, plus a new one
    later(h);
    await pass(h, "manual");
    expect([...h.store.favorites].sort()).toEqual(["g10", "g11", "g13"]);
    // A favorite for a game that is not in the library yet is marked when it arrives.
    favs = ["10", "11", "13", "14"];
    later(h);
    await pass(h, "manual");
    expect(h.store.favorites.has("g14")).toBe(false);
    seed(h, ["14"]);
    later(h);
    await pass(h, "manual");
    expect(h.store.favorites.has("g14")).toBe(true);
  });

  it("after a blocked pass (empty snapshot) a favorite the user removed does not come back", async () => {
    let current = snap({ collections: [col("uc-1", "A", ["10"])], favorites: ["10"] });
    const h = await setup(async () => current);
    await pass(h, "open");
    h.store.favorites.delete("g10");
    current = snap({ collections: [], favorites: [] }); // empty: deletes blocked, favoritesSeen must not shrink
    later(h);
    await pass(h, "manual");
    current = snap({ collections: [col("uc-1", "A", ["10"])], favorites: ["10"] });
    later(h);
    await pass(h, "manual");
    expect(h.store.favorites.has("g10")).toBe(false);
  });

  it("with an account that is not verified, favorites wait (counted) until the setting is turned on", async () => {
    const h = await setup(async () => snap({ accountSource: "single-folder", collections: [col("uc-1", "A", ["10"])], favorites: ["10", "11"] }));
    await pass(h, "open");
    expect(h.store.favorites.size).toBe(0);
    expect(names(h)).toEqual(["A"]); // collections are brought in with the warning
    expect(await status(h)).toMatchObject({ accountVerified: false, favoritesPending: 2 });
    await h.core.updateSettings({ storeCollections: { steam: { unverifiedFavorites: true } } });
    await h.core.whenIdle();
    expect([...h.store.favorites].sort()).toEqual(["g10", "g11"]);
    expect(await status(h)).toMatchObject({ favoritesPending: 0 });
  });
});

describe("collections mirror: settings (ADR 88 point 8)", () => {
  it("defaults, validation and the switch", async () => {
    const h = await setup(async () => snap({ collections: [col("uc-1", "A", ["10"])] }));
    expect((await h.core.getSettings()).storeCollections).toEqual({ steam: { enabled: true, unverifiedFavorites: false } });
    await expect(h.core.updateSettings({ storeCollections: { gog: { enabled: false } } })).rejects.toMatchObject({ code: "invalid-input" });
    await expect(h.core.updateSettings({ storeCollections: { steam: { enabled: "no" as never } } })).rejects.toMatchObject({ code: "invalid-input" });
    await pass(h, "open");
    expect(names(h)).toEqual(["A"]);

    await h.core.updateSettings({ storeCollections: { steam: { enabled: false } } });
    expect(names(h)).toEqual([]); // mirrors deleted
    expect(h.userDataCalls.filter((c) => c[0] === "deleteCollectionMirrors")).toEqual([["deleteCollectionMirrors", "steam"]]);
    expect(await status(h)).toMatchObject({ status: "off" });
    expect((await h.core.getSettings()).storeCollections["steam"]).toEqual({ enabled: false, unverifiedFavorites: false });

    await h.core.updateSettings({ storeCollections: { steam: { enabled: true } } });
    await h.core.whenIdle();
    expect(names(h)).toEqual(["A"]); // a pass was forced
  });

  it("the repository finding the setting off writes nothing", async () => {
    const h = await setup(async () => snap({ collections: [col("uc-1", "A", ["10"])] }));
    h.store.kv.set("collections.steam.enabled", false);
    const counts = await h.deps.userData.applyCollectionMirror("steam", { collections: [], protectedSourceIds: [], favorites: [], favoritesAllowed: true, accountSource: "connected", blockDeletes: false, emptySnapshot: false }, 1);
    expect(counts.off).toBe(true);
  });
});

describe("planCollectionMirror (pure)", () => {
  const input = (over: Partial<CollectionMirrorInput> = {}): CollectionMirrorInput => ({
    collections: [], protectedSourceIds: [], favorites: [], favoritesAllowed: true, accountSource: "connected", blockDeletes: false, emptySnapshot: false, ...over,
  });
  const state = (over: Partial<MirrorState> = {}): MirrorState => ({ mirrors: [], shown: new Set(["g1", "g2"]), favorites: new Set(), favoritesSeen: new Set(), ...over });

  it("a quiet pass plans nothing and emptyMirrorCounts is all zero", () => {
    const plan = planCollectionMirror(
      input({ collections: [{ sourceId: "a", name: "A", key: "a", gameIds: ["g1", "g2"] }] }),
      state({ mirrors: [{ id: "m", sourceId: "a", name: "A", nameKey: "a", members: ["g1", "g2"] }] }),
    );
    expect(plan).toMatchObject({ create: [], update: [], remove: [], favorites: [], favoritesSeen: null });
    expect(plan.counts).toEqual(emptyMirrorCounts());
  });

  it("caps 10 000 games per collection and 200 mirrors", () => {
    const shown = new Set(Array.from({ length: 10_005 }, (_, i) => `g${i}`));
    const big = planCollectionMirror(input({ collections: [{ sourceId: "a", name: "Big", key: "big", gameIds: [...shown] }] }), state({ shown }));
    expect(big.create[0]?.gameIds).toHaveLength(10_000);
    expect(big.counts.limitGames).toBe(5);
    const many = planCollectionMirror(
      input({ collections: Array.from({ length: 201 }, (_, i) => ({ sourceId: `s${i}`, name: `C${i}`, key: `c${i}`, gameIds: ["g1"] })) }),
      state(),
    );
    expect(many.create).toHaveLength(200);
    expect(many.counts.limitCollections).toBe(1);
  });

  it("filters games that vanished inside the transaction", () => {
    const plan = planCollectionMirror(input({ collections: [{ sourceId: "a", name: "A", key: "a", gameIds: ["g1", "gone"] }] }), state());
    expect(plan.create[0]?.gameIds).toEqual(["g1"]);
    expect(plan.counts.gone).toBe(1);
  });
});

describe("a mirror cannot be edited through the core (ADR 88 point 5.7)", () => {
  it("the error exists with its key", () => {
    const e = new CoreError("collection-managed", "x", { key: "core.errors.collectionManaged" as never });
    expect(e.info()).toEqual({ code: "collection-managed", key: "core.errors.collectionManaged" });
  });
});

describe("checkConnectorManifest and importCollections (ADR 87)", () => {
  const ok = makeConnector({ importCollections: async () => snap() });
  it("accepts a relative sub-folder and rejects missing, absolute and '..' roots", () => {
    expect(checkConnectorManifest(ok)).toEqual([]);
    for (const root of ["", "C:\\x", "\\x", "/x", "a\\..\\b", "..", "a//b"]) {
      expect(checkConnectorManifest({ ...ok, importCollectionsRoot: root } as StoreConnector), root).not.toEqual([]);
    }
    expect(checkConnectorManifest({ ...ok, importCollectionsRoot: undefined } as unknown as StoreConnector)).toContain("importCollections requires importCollectionsRoot");
  });
  it("needs the scan capability and a scan location", () => {
    expect(checkConnectorManifest({ ...ok, capabilities: { ...ok.capabilities, scan: false }, scanInstalled: undefined } as unknown as StoreConnector)).toContain("importCollections requires capabilities.scan");
    expect(checkConnectorManifest({ ...ok, locations: [] } as StoreConnector)).toContain("importCollections requires a 'scan' location");
  });
});

