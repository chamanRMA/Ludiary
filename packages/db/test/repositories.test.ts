import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type Database from "better-sqlite3";
import type { I18nKey } from "@ludiary/contracts";
import type { ScanPlan, ScanRootRecord, ScannedEntry, SyncStateRecord } from "@ludiary/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createRepositories, migrate, openDatabase, type Repositories } from "../src";

let dir = "";
let sqlite: Database.Database;
let repos: Repositories;
let n = 0;
const newId = () => `id-${++n}`;

beforeEach(async () => {
  n = 0;
  dir = mkdtempSync(join(tmpdir(), "ludiary-repo-"));
  sqlite = openDatabase(join(dir, "ludiary.sqlite"), undefined);
  await migrate(sqlite, { backupDir: join(dir, "backups") });
  repos = createRepositories(sqlite);
  await repos.identity.ensure(newId, 1);
});
afterEach(() => {
  sqlite.close();
  rmSync(dir, { recursive: true, force: true });
});

const COVER = "https://shared.akamai.steamstatic.com/a/library_600x900.jpg";
const idle = (at: number, extra: Partial<SyncStateRecord> = {}): SyncStateRecord => ({
  store: "steam",
  operation: "scan",
  lastAttemptAt: at,
  lastSuccessAt: at,
  status: "idle",
  error: null,
  nextAllowedAt: at + 60_000,
  ...extra,
});
const entry = (id: string, title: string, path: string, extra: Partial<ScannedEntry> = {}): ScannedEntry => ({
  storeGameId: id,
  kind: "game",
  title,
  normalizedTitle: title.toLowerCase(),
  installPath: path,
  launchData: null,
  ...extra,
});
const emptyPlan = (at: number): ScanPlan => ({
  store: "steam",
  at,
  create: [],
  update: [],
  removeInstallations: [],
  retireProperties: [],
  reviveProperties: [],
  kindChanges: [],
  dlcLinks: [],
  upsertDiscoveredRoots: [],
  deleteRoots: [],
  sync: idle(at),
});
const root = (id: string, path: string, extra: Partial<ScanRootRecord> = {}): ScanRootRecord => ({
  id,
  origin: "user",
  path,
  pathKey: path.toLowerCase(),
  declarationId: null,
  store: null,
  tag: null,
  enabled: true,
  ...extra,
});

async function addPortal() {
  await repos.library.applyScanPlan({
    ...emptyPlan(10),
    create: [{ canonicalId: "c1", propertyId: "p1", installationId: "i1", entry: entry("620", "Portal 2", "D:\\Games\\Portal 2", { media: { coverUrl: COVER }, launchData: { a: "b" }, externalIds: { steamAppId: "620" } }) }],
  });
}

describe("identity", () => {
  it("creates the only user and the local device once", async () => {
    const again = await repos.identity.ensure(newId, 2);
    const first = await repos.identity.ensure(newId, 3);
    expect(again).toEqual(first);
    expect((sqlite.prepare("SELECT count(*) AS c FROM users").get() as { c: number }).c).toBe(1);
    expect(sqlite.prepare("SELECT kind, name FROM devices").all()).toEqual([{ kind: "local", name: "local" }]);
  });

  it("refuses to be used before ensure()", async () => {
    const fresh = createRepositories(sqlite);
    await expect(fresh.library.listLibrary()).rejects.toThrow(/ensure/);
  });
});

describe("applyScanPlan", () => {
  it("creates canonical game, property and installation", async () => {
    await addPortal();
    const lib = await repos.library.listLibrary();
    expect(lib).toEqual([
      { id: "c1", title: "Portal 2", coverUrl: COVER, stores: ["steam"], installed: true, favorite: false, playtimeMinutes: 0, tags: [], mainAction: "play", unsynced: false },
    ]);
    const props = await repos.library.listProperties("steam");
    expect(props).toEqual([{ id: "p1", canonicalGameId: "c1", store: "steam", storeGameId: "620", kind: "game", baseStoreGameId: null, dlcInferred: false, title: "Portal 2", normalizedTitle: "portal 2", owned: false, removedAt: null, storePlaytimeMinutes: null, storeLastPlayedAt: null }]);
    expect(await repos.library.listInstallations("steam")).toEqual([{ id: "i1", propertyId: "p1", deviceId: expect.any(String), installPath: "D:\\Games\\Portal 2", launchData: { a: "b" }, detectedBy: "scan" }]);
    expect(sqlite.prepare("SELECT user_id FROM installations").get()).toEqual({ user_id: expect.any(String) });
    expect((await repos.syncState.get("steam", "scan"))?.status).toBe("idle");
  });

  it("updates title, media and the installation, keeping ids", async () => {
    await addPortal();
    await repos.library.applyScanPlan({
      ...emptyPlan(20),
      update: [{ propertyId: "p1", installationId: "other-id", entry: entry("620", "Portal Two", "E:\\Moved", { media: { coverUrl: COVER, heroUrl: COVER } }) }],
    });
    const [g] = await repos.library.listLibrary();
    expect(g).toMatchObject({ id: "c1", title: "Portal Two", coverFallbackUrl: COVER });
    const installs = await repos.library.listInstallations("steam");
    expect(installs).toHaveLength(1);
    expect(installs[0]).toMatchObject({ id: "i1", installPath: "E:\\Moved", launchData: null });
  });

  it("retires with removed_at, hides the game, keeps the canonical row, and revives", async () => {
    await addPortal();
    await repos.library.applyScanPlan({ ...emptyPlan(30), removeInstallations: ["i1"], retireProperties: ["p1"] });
    expect(await repos.library.listLibrary()).toEqual([]);
    expect(await repos.library.getGame("c1")).toBeNull();
    expect(sqlite.prepare("SELECT removed_at FROM game_properties").get()).toEqual({ removed_at: 30 });
    expect(sqlite.prepare("SELECT count(*) AS c FROM canonical_games").get()).toEqual({ c: 1 });
    expect(await repos.library.listInstallations("steam")).toEqual([]);

    await repos.library.applyScanPlan({
      ...emptyPlan(40),
      update: [{ propertyId: "p1", installationId: "i2", entry: entry("620", "Portal 2", "D:\\Games\\Portal 2") }],
      reviveProperties: ["p1"],
    });
    const lib = await repos.library.listLibrary();
    expect(lib.map((g) => [g.id, g.installed])).toEqual([["c1", true]]);
    expect(sqlite.prepare("SELECT removed_at FROM game_properties").get()).toEqual({ removed_at: null });
  });

  it("upserts discovered roots keeping id and switch, and deletes the ones given", async () => {
    await repos.library.applyScanPlan({
      ...emptyPlan(1),
      upsertDiscoveredRoots: [root("r1", "C:\\Steam", { origin: "discovered", store: "steam", declarationId: "steam-root", tag: "library" }), root("r2", "E:\\Lib", { origin: "discovered", store: "steam", declarationId: "steam-root" })],
    });
    await repos.scanRoots.setEnabled("r1", false);
    await repos.library.applyScanPlan({
      ...emptyPlan(2),
      upsertDiscoveredRoots: [root("new-id", "C:\\Steam", { origin: "discovered", store: "steam", declarationId: "steam-root", tag: "other" })],
      deleteRoots: ["r2"],
    });
    const roots = await repos.scanRoots.list();
    expect(roots).toEqual([{ id: "r1", origin: "discovered", path: "C:\\Steam", pathKey: "c:\\steam", declarationId: "steam-root", store: "steam", tag: "other", enabled: false }]);
  });

  it("does not let one store take over a folder stored for another (ADR 79)", async () => {
    await repos.library.applyScanPlan({ ...emptyPlan(1), upsertDiscoveredRoots: [root("u1", "D:\\Shared", { origin: "discovered", store: "ubisoft", declarationId: "ubisoft-installs", tag: "game-900001" })] });
    await repos.library.applyScanPlan({ ...emptyPlan(2), upsertDiscoveredRoots: [root("g1", "D:\\Shared", { origin: "discovered", store: "gog", declarationId: "gog-games", tag: null })] });
    const roots = await repos.scanRoots.list();
    expect(roots).toHaveLength(1);
    expect(roots[0]).toMatchObject({ id: "u1", store: "ubisoft", declarationId: "ubisoft-installs", tag: "game-900001" });
  });

  it("does not delete user roots through deleteRoots", async () => {
    await repos.scanRoots.addUser(root("u1", "D:\\Mine"));
    await repos.library.applyScanPlan({ ...emptyPlan(1), deleteRoots: ["u1"] });
    expect(await repos.scanRoots.list()).toHaveLength(1);
  });

  it("undoes everything if the plan fails halfway", async () => {
    await addPortal();
    const before = {
      canon: sqlite.prepare("SELECT count(*) AS c FROM canonical_games").get(),
      sync: await repos.syncState.get("steam", "scan"),
    };
    await expect(
      repos.library.applyScanPlan({
        ...emptyPlan(99),
        create: [{ canonicalId: "c9", propertyId: "p9", installationId: "i9", entry: entry("999", "New", "D:\\New") }],
        removeInstallations: ["i1"],
        upsertDiscoveredRoots: [root("r9", "C:\\X", { origin: "discovered", store: "steam" })],
        update: [{ propertyId: "does-not-exist", installationId: "i10", entry: entry("1", "Ghost", "D:\\Ghost") }],
      }),
    ).rejects.toThrow(/unknown property/);
    expect(sqlite.prepare("SELECT count(*) AS c FROM canonical_games").get()).toEqual(before.canon);
    expect(await repos.library.listInstallations("steam")).toHaveLength(1);
    expect(await repos.scanRoots.list()).toEqual([]);
    expect(await repos.syncState.get("steam", "scan")).toEqual(before.sync);
  });

  it("rejects a second property with the same store id (unique index)", async () => {
    await addPortal();
    await expect(
      repos.library.applyScanPlan({ ...emptyPlan(5), create: [{ canonicalId: "c2", propertyId: "p2", installationId: "i2", entry: entry("620", "Dup", "D:\\Dup") }] }),
    ).rejects.toThrow();
    expect(await repos.library.listLibrary()).toHaveLength(1);
  });
});

describe("library reads", () => {
  it("returns a detail with properties, install path and no actions (the core fills them)", async () => {
    await addPortal();
    const d = await repos.library.getGame("c1");
    expect(d).toMatchObject({ id: "c1", dlc: [], collections: [], properties: [{ id: "p1", store: "steam", installed: true, installPath: "D:\\Games\\Portal 2", actions: [] }] });
    expect(await repos.library.getGame("zzz")).toBeNull();
  });

  it("getGame and listInstallations ignore rows that belong to another user", async () => {
    await addPortal();
    // A property of another user pointing at the same canonical game must never show up in this user's detail.
    sqlite.prepare("INSERT INTO users (id, created_at) VALUES ('other', 1)").run();
    sqlite
      .prepare(
        "INSERT INTO game_properties (id, user_id, canonical_game_id, store, store_game_id, kind, title, normalized_title, owned) VALUES ('foreign', 'other', 'c1', 'gog', '99', 'game', 'Foreign', 'foreign', 1)",
      )
      .run();
    const d = await repos.library.getGame("c1");
    expect(d?.properties.map((p) => p.id)).toEqual(["p1"]);
    expect(await repos.library.listInstallations("gog")).toEqual([]);
  });

  it("returns launch targets with their installation on this device", async () => {
    await addPortal();
    const t = await repos.library.getLaunchTargets("c1");
    expect(t).toHaveLength(1);
    expect(t[0]).toMatchObject({ canonicalGameId: "c1", property: { id: "p1", store: "steam" }, installation: { installPath: "D:\\Games\\Portal 2", launchData: { a: "b" } } });
    expect(await repos.library.getLaunchTargets("zzz")).toEqual([]);
    await repos.library.applyScanPlan({ ...emptyPlan(2), removeInstallations: ["i1"] });
    expect((await repos.library.getLaunchTargets("c1"))[0]!.installation).toBeNull();
  });

  it("sorts by normalized title and prefers Steam artwork", async () => {
    await repos.library.applyScanPlan({
      ...emptyPlan(1),
      create: [
        { canonicalId: "cb", propertyId: "pb", installationId: "ib", entry: entry("2", "Beta", "D:\\B") },
        { canonicalId: "ca", propertyId: "pa", installationId: "ia", entry: entry("1", "Alpha", "D:\\A", { media: { coverUrl: COVER } }) },
      ],
    });
    expect((await repos.library.listLibrary()).map((g) => g.title)).toEqual(["Alpha", "Beta"]);
  });

  it("a game with no Steam property shows the artwork its other store resolved (ADR 76)", async () => {
    const GOG_COVER = "https://images.gog.com/" + "a".repeat(64) + ".jpg?namespace=gamesdb";
    await repos.library.applyScanPlan({
      ...emptyPlan(1),
      store: "gog",
      create: [{ canonicalId: "cg", propertyId: "pg", installationId: "ig", entry: entry("1512372112", "Cold Waters", "F:\\G\\CW") }],
    });
    await repos.library.setResolvedMedia("gog", new Map([["1512372112", { coverUrl: GOG_COVER }]]), ["1512372112"], 2);
    expect(await repos.library.listLibrary()).toMatchObject([{ title: "Cold Waters", coverUrl: GOG_COVER }]);
  });
});

describe("resolved media (ADR 73)", () => {
  const HASHED = "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/620/abc/library_600x900.jpg";
  const HERO = "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/620/abc/header.jpg";
  const add = (id: string, store: "steam" | "gog" = "steam") =>
    sqlite
      .prepare(
        "INSERT INTO game_properties (id, user_id, canonical_game_id, store, store_game_id, kind, title, normalized_title, owned) VALUES (?, (SELECT id FROM users LIMIT 1), NULL, ?, ?, 'game', 't', 't', 0)",
      )
      .run(`x-${id}`, store, id);

  it("the scan keeps what resolveMedia stored, and a later scan does not ask again", async () => {
    await addPortal();
    await repos.library.setResolvedMedia("steam", new Map([["620", { coverUrl: HASHED }]]), ["620"], 500);
    await repos.library.applyScanPlan({
      ...emptyPlan(20),
      update: [{ propertyId: "p1", installationId: "i9", entry: entry("620", "Portal 2", "D:/G", { media: { coverUrl: COVER, heroUrl: COVER } }) }],
    });
    const stored = JSON.parse((sqlite.prepare("SELECT store_metadata AS m FROM game_properties WHERE id = 'p1'").get() as { m: string }).m);
    expect(stored).toMatchObject({ resolvedMedia: { coverUrl: HASHED }, mediaResolvedAt: 500, media: { coverUrl: COVER } });
    expect(await repos.library.listMediaPending("steam", 400, 10)).toEqual([]);
  });

  it("summary applies the precedence field by field", async () => {
    await addPortal(); // scan media: coverUrl only
    expect(await repos.library.listLibrary()).toMatchObject([{ coverUrl: COVER }]);
    await repos.library.setResolvedMedia("steam", new Map([["620", { heroUrl: HERO }]]), ["620"], 1);
    const [g] = await repos.library.listLibrary();
    expect(g).toMatchObject({ coverUrl: COVER, coverFallbackUrl: HERO }); // cover from the scan, hero resolved
    await repos.library.setResolvedMedia("steam", new Map([["620", { coverUrl: HASHED, heroUrl: HERO }]]), ["620"], 2);
    expect((await repos.library.getGame("c1"))).toMatchObject({ coverUrl: HASHED, coverFallbackUrl: HERO });
    await repos.library.setResolvedMedia("steam", new Map(), ["620"], 3); // the store knows nothing: back to the scan
    expect(await repos.library.listLibrary()).toMatchObject([{ coverUrl: COVER }]);
  });

  it("listMediaPending: unresolved or older than the limit, only games, not retired, only that store, with a limit", async () => {
    await addPortal();
    add("1");
    add("2");
    add("3");
    add("77", "gog");
    sqlite.prepare("UPDATE game_properties SET kind = 'dlc' WHERE store_game_id = '3'").run();
    await repos.library.setResolvedMedia("steam", new Map(), ["1"], 100);
    expect(await repos.library.listMediaPending("steam", 50, 10)).toEqual(["2", "620"]);
    expect(await repos.library.listMediaPending("steam", 150, 10)).toEqual(["2", "620", "1"]); // never resolved first, then the expired
    expect(await repos.library.listMediaPending("steam", 150, 2)).toHaveLength(2);
    await repos.library.applyScanPlan({ ...emptyPlan(5), removeInstallations: ["i1"], retireProperties: ["p1"] });
    expect(await repos.library.listMediaPending("steam", 50, 10)).toEqual(["2"]);
  });

  it("setResolvedMedia marks every requested id, empty when absent, and ignores unknown ids", async () => {
    add("1");
    add("2");
    await repos.library.setResolvedMedia("steam", new Map([["1", { coverUrl: HASHED }]]), ["1", "2", "404"], 7);
    const rows = sqlite.prepare("SELECT store_game_id AS id, store_metadata AS m FROM game_properties ORDER BY store_game_id").all() as { id: string; m: string }[];
    expect(rows.map((r) => [r.id, JSON.parse(r.m)])).toEqual([
      ["1", { resolvedMedia: { coverUrl: HASHED }, mediaResolvedAt: 7 }],
      ["2", { resolvedMedia: {}, mediaResolvedAt: 7 }],
    ]);
  });

  it("the new queries filter by user_id", async () => {
    add("1");
    sqlite.prepare("INSERT INTO users (id, created_at) VALUES ('other', 1)").run();
    sqlite
      .prepare(
        "INSERT INTO game_properties (id, user_id, canonical_game_id, store, store_game_id, kind, title, normalized_title, owned) VALUES ('foreign', 'other', NULL, 'steam', '99', 'game', 'F', 'f', 1)",
      )
      .run();
    expect(await repos.library.listMediaPending("steam", 50, 10)).toEqual(["1"]);
    await repos.library.setResolvedMedia("steam", new Map(), ["1", "99"], 9);
    expect((sqlite.prepare("SELECT store_metadata AS m FROM game_properties WHERE id = 'foreign'").get() as { m: string | null }).m).toBeNull();
  });
});

describe("scan roots", () => {
  it("adds user roots once per path key, toggles and removes only user roots", async () => {
    expect(await repos.scanRoots.addUser(root("u1", "D:\\Games"))).toMatchObject({ id: "u1", origin: "user" });
    expect(await repos.scanRoots.addUser(root("u2", "D:\\GAMES".toLowerCase()))).toBeNull();
    await repos.library.applyScanPlan({ ...emptyPlan(1), upsertDiscoveredRoots: [root("d1", "C:\\Steam", { origin: "discovered", store: "steam" })] });
    await repos.scanRoots.setEnabled("u1", false);
    expect((await repos.scanRoots.get("u1"))?.enabled).toBe(false);
    expect(await repos.scanRoots.get("none")).toBeNull();
    expect(await repos.scanRoots.remove("d1")).toBe(false);
    expect(await repos.scanRoots.remove("u1")).toBe(true);
    expect(await repos.scanRoots.remove("u1")).toBe(false);
    expect((await repos.scanRoots.list()).map((r) => r.id)).toEqual(["d1"]);
  });
});

describe("sync state", () => {
  it("round-trips an error with key and params, lists and resets 'running'", async () => {
    const err = { code: "store.rate-limited" as const, key: "connectors.common.errors.store.rate-limited" as I18nKey, params: { seconds: 5 } };
    await repos.syncState.put(idle(1, { status: "error", error: err }));
    await repos.syncState.put({ ...idle(2), store: "gog", status: "running" });
    expect(await repos.syncState.get("steam", "scan")).toMatchObject({ status: "error", error: err });
    await repos.syncState.put(idle(3, { status: "idle", error: null }));
    expect((await repos.syncState.get("steam", "scan"))?.error).toBeNull();
    expect((await repos.syncState.list()).map((s) => s.store)).toEqual(["gog", "steam"]);
    expect(await repos.syncState.resetRunning()).toBe(1);
    expect((await repos.syncState.get("gog", "scan"))?.status).toBe("idle");
    expect(await repos.syncState.get("ea", "library")).toBeNull();
  });
});

describe("settings", () => {
  it("stores JSON values per user, overwrites, and deletes", async () => {
    expect(await repos.settings.get("ui.locale")).toBeUndefined();
    await repos.settings.set("ui.locale", "es");
    await repos.settings.set("onboarding.completedAt", 1234);
    await repos.settings.set("ui.locale", "en");
    expect(await repos.settings.get("ui.locale")).toBe("en");
    expect(await repos.settings.get("onboarding.completedAt")).toBe(1234);
    await repos.settings.delete("ui.locale");
    expect(await repos.settings.get("ui.locale")).toBeUndefined();
    expect((sqlite.prepare("SELECT count(*) AS c FROM settings").get() as { c: number }).c).toBe(1);
  });
});
