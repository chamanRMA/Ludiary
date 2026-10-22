// Migration 0002 and the repositories of ADR 74.
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import type { LibraryEntry, LibraryPlan, ScanPlan, SyncStateRecord } from "@ludiary/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createRepositories, MIGRATIONS, migrate, openDatabase, type Repositories } from "../src";

let dir = "";
let sqlite: Database.Database;
let repos: Repositories;
let n = 0;
const newId = () => `id-${++n}`;

beforeEach(async () => {
  n = 0;
  dir = mkdtempSync(join(tmpdir(), "ludiary-acct-"));
  sqlite = openDatabase(join(dir, "ludiary.sqlite"), undefined);
});
afterEach(() => {
  sqlite.close();
  rmSync(dir, { recursive: true, force: true });
});

async function ready() {
  await migrate(sqlite, { backupDir: join(dir, "backups") });
  repos = createRepositories(sqlite);
  await repos.identity.ensure(newId, 1);
}

const idle = (at: number, op: "library" | "scan" = "library"): SyncStateRecord => ({
  store: "steam",
  operation: op,
  lastAttemptAt: at,
  lastSuccessAt: at,
  status: "idle",
  error: null,
  nextAllowedAt: at + 1,
});
const lib = (id: string, title: string, extra: Partial<LibraryEntry> = {}): LibraryEntry => ({
  storeGameId: id,
  title,
  normalizedTitle: title.toLowerCase(),
  storePlaytimeMinutes: null,
  storeLastPlayedAt: null,
  ...extra,
});
const plan = (at: number, p: Partial<LibraryPlan> = {}): LibraryPlan => ({ store: "steam", at, create: [], update: [], disown: [], retire: [], sync: idle(at), ...p });
const scanPlan = (at: number, p: Partial<ScanPlan>): ScanPlan => ({
  store: "steam",
  at,
  create: [],
  update: [],
  removeInstallations: [],
  retireProperties: [],
  reviveProperties: [],
  upsertDiscoveredRoots: [],
  deleteRoots: [],
  sync: idle(at, "scan"),
  ...p,
});
const connect = (status: "connected" | "expired" = "connected") =>
  repos.connections.put({ store: "steam", status, accountLabel: null, connectedAt: 5 });

describe("migration 0002_store_account", () => {
  it("upgrades a database that has 0001 with data, after the safety copy", async () => {
    await migrate(sqlite, { backupDir: join(dir, "backups"), migrations: [MIGRATIONS[0]!] });
    // Raw SQL: the Drizzle schema already has the 0002 columns.
    sqlite.exec("INSERT INTO users (id, created_at) VALUES ('u', 1)");
    sqlite.exec("INSERT INTO canonical_games (id, user_id, title, normalized_title, created_at, updated_at) VALUES ('c1', 'u', 'Portal 2', 'portal 2', 1, 1)");
    sqlite.exec("INSERT INTO game_properties (id, user_id, canonical_game_id, store, store_game_id, kind, title, normalized_title) VALUES ('p1', 'u', 'c1', 'steam', '620', 'game', 'Portal 2', 'portal 2')");
    const res = await migrate(sqlite, { backupDir: join(dir, "backups") });
    expect(res.applied).toEqual(["0002_store_account", "0003_recheck_steam_media"]);
    expect(res.backupFile && existsSync(res.backupFile)).toBe(true);
    const cols = (sqlite.prepare("PRAGMA table_info(game_properties)").all() as { name: string }[]).map((c) => c.name);
    expect(cols).toEqual(expect.arrayContaining(["store_playtime_minutes", "store_last_played_at"]));
    expect(sqlite.prepare("SELECT title, store_playtime_minutes AS m, store_last_played_at AS l FROM game_properties").get()).toEqual({ title: "Portal 2", m: null, l: null });
  });

  it("0003 forgets resolved Steam media so the next scan asks again (PNG covers were rejected before)", async () => {
    await migrate(sqlite, { backupDir: join(dir, "backups"), migrations: MIGRATIONS.slice(0, 2) });
    sqlite.exec("INSERT INTO users (id, created_at) VALUES ('u', 1)");
    sqlite.exec("INSERT INTO canonical_games (id, user_id, title, normalized_title, created_at, updated_at) VALUES ('c1', 'u', 'Ace', 'ace', 1, 1)");
    const meta = JSON.stringify({ media: { coverUrl: "https://x/a.jpg" }, resolvedMedia: { heroUrl: "https://x/h.jpg" }, mediaResolvedAt: 5 });
    const ins = sqlite.prepare("INSERT INTO game_properties (id, user_id, canonical_game_id, store, store_game_id, kind, title, normalized_title, store_metadata) VALUES (?, 'u', 'c1', ?, ?, 'game', 'Ace', 'ace', ?)");
    ins.run("p1", "steam", "228400", meta);
    ins.run("p2", "gog", "1", meta);
    await migrate(sqlite, { backupDir: join(dir, "backups") });
    const read = (id: string) => JSON.parse((sqlite.prepare("SELECT store_metadata AS m FROM game_properties WHERE id = ?").get(id) as { m: string }).m);
    expect(read("p1")).toEqual({ media: { coverUrl: "https://x/a.jpg" } }); // initial media kept, resolution forgotten
    expect(read("p2")).toEqual(JSON.parse(meta)); // other stores untouched
  });

  it("has the unique index of secrets and the CHECK of store_connections", async () => {
    await ready();
    const user = (sqlite.prepare("SELECT id FROM users").get() as { id: string }).id;
    const ins = sqlite.prepare("INSERT INTO secrets (id, user_id, scope, name, ciphertext, key_id, updated_at) VALUES (?, ?, 'store:steam', 'apiKey', 'x', 1, 1)");
    ins.run("s1", user);
    expect(() => ins.run("s2", user)).toThrow(/UNIQUE/);
    const conn = sqlite.prepare("INSERT INTO store_connections (user_id, store, status, connected_at) VALUES (?, ?, ?, 1)");
    expect(() => conn.run(user, "steam", "bogus")).toThrow(/CHECK/);
    conn.run(user, "steam", "connected");
    expect(() => conn.run(user, "steam", "expired")).toThrow(/UNIQUE|PRIMARY/);
  });
});

describe("secrets and connections", () => {
  beforeEach(ready);

  it("upserts one row per scope and name, deletes one or a whole scope", async () => {
    const rec = (scope: string, name: string, ciphertext: string) => ({ scope, name, ciphertext, keyId: 1, updatedAt: 1 });
    await repos.secrets.put(rec("store:steam", "apiKey", "a"));
    await repos.secrets.put(rec("store:steam", "apiKey", "b"));
    await repos.secrets.put(rec("store:steam", "steamId", "c"));
    await repos.secrets.put(rec("store:gog", "apiKey", "d"));
    expect((await repos.secrets.get("store:steam", "apiKey"))?.ciphertext).toBe("b");
    expect((sqlite.prepare("SELECT count(*) AS c FROM secrets").get() as { c: number }).c).toBe(3);
    await repos.secrets.delete("store:steam", "steamId");
    expect(await repos.secrets.get("store:steam", "steamId")).toBeNull();
    expect(await repos.secrets.deleteScope("store:steam")).toBe(1);
    expect(await repos.secrets.get("store:gog", "apiKey")).not.toBeNull();
    expect(await repos.secrets.deleteScope("store:steam")).toBe(0);
  });

  it("round-trips connections, changes the status and deletes", async () => {
    expect(await repos.connections.get("steam")).toBeNull();
    await repos.connections.put({ store: "steam", status: "connected", accountLabel: "Ana", connectedAt: 7 });
    await repos.connections.put({ store: "steam", status: "connected", accountLabel: null, connectedAt: 8 });
    expect(await repos.connections.get("steam")).toEqual({ store: "steam", status: "connected", accountLabel: null, connectedAt: 8 });
    await repos.connections.setStatus("steam", "expired");
    expect((await repos.connections.list()).map((c) => c.status)).toEqual(["expired"]);
    await repos.connections.delete("steam");
    expect(await repos.connections.list()).toEqual([]);
  });

  it("filters by user_id: rows of another user are invisible and untouched", async () => {
    sqlite.prepare("INSERT INTO users (id, created_at) VALUES ('other', 2)").run();
    sqlite.prepare("INSERT INTO secrets (id, user_id, scope, name, ciphertext, key_id, updated_at) VALUES ('x', 'other', 'store:steam', 'apiKey', 'zzz', 1, 1)").run();
    sqlite.prepare("INSERT INTO store_connections (user_id, store, status, connected_at) VALUES ('other', 'steam', 'connected', 1)").run();
    sqlite.prepare("INSERT INTO sync_state (user_id, store, operation, status) VALUES ('other', 'steam', 'library', 'idle')").run();
    sqlite.prepare("INSERT INTO canonical_games (id, user_id, title, normalized_title, created_at, updated_at) VALUES ('oc', 'other', 'T', 't', 1, 1)").run();
    sqlite
      .prepare("INSERT INTO game_properties (id, user_id, canonical_game_id, store, store_game_id, kind, title, normalized_title, owned) VALUES ('op', 'other', 'oc', 'steam', '1', 'game', 'T', 't', 1)")
      .run();

    expect(await repos.secrets.get("store:steam", "apiKey")).toBeNull();
    expect(await repos.connections.get("steam")).toBeNull();
    expect(await repos.connections.list()).toEqual([]);
    expect(await repos.library.countOwned("steam")).toBe(0);
    expect(await repos.library.listLibrary()).toEqual([]);

    await repos.secrets.deleteScope("store:steam");
    await repos.connections.delete("steam");
    await repos.connections.setStatus("steam", "expired");
    await repos.syncState.delete("steam", "library");
    await repos.library.applyLibraryPlan(plan(9, { disown: ["op"], retire: ["op"] }));
    const count = (t: string) => (sqlite.prepare(`SELECT count(*) AS c FROM ${t} WHERE user_id = 'other'`).get() as { c: number }).c;
    expect([count("secrets"), count("store_connections")]).toEqual([1, 1]);
    expect(count("sync_state")).toBe(1);
    expect(sqlite.prepare("SELECT owned, removed_at AS r FROM game_properties WHERE id = 'op'").get()).toEqual({ owned: 1, r: null });
  });

  it("syncState.delete removes only that operation", async () => {
    await repos.syncState.put(idle(1, "library"));
    await repos.syncState.put(idle(1, "scan"));
    await repos.syncState.delete("steam", "library");
    expect(await repos.syncState.get("steam", "library")).toBeNull();
    expect(await repos.syncState.get("steam", "scan")).not.toBeNull();
  });
});

describe("applyLibraryPlan, countOwned and what the reads compute", () => {
  beforeEach(ready);
  const cover = "https://shared.akamai.steamstatic.com/a/library_600x900.jpg";

  it("creates, updates the same AppID, keeps resolvedMedia, disowns and retires in one transaction", async () => {
    await repos.library.applyLibraryPlan(
      plan(10, {
        create: [
          { canonicalId: "c1", propertyId: "p1", entry: lib("620", "Portal 2", { media: { coverUrl: cover }, storePlaytimeMinutes: 90, storeLastPlayedAt: 5000 }) },
          { canonicalId: "c2", propertyId: "p2", entry: lib("730", "Counter-Strike 2") },
        ],
      }),
    );
    expect(await repos.library.countOwned("steam")).toBe(2);
    await repos.library.setResolvedMedia("steam", new Map([["620", { coverUrl: "https://shared.akamai.steamstatic.com/a/h/library_capsule.jpg" }]]), ["620"], 11);
    await repos.library.applyLibraryPlan(plan(20, { update: [{ propertyId: "p1", entry: lib("620", "Portal Two", { storePlaytimeMinutes: 120, storeLastPlayedAt: 6000 }) }], disown: ["p2"], retire: ["p2"] }));
    const props = await repos.library.listProperties("steam");
    expect(props.find((p) => p.id === "p1")).toMatchObject({ title: "Portal Two", owned: true, storePlaytimeMinutes: 120, storeLastPlayedAt: 6000 });
    expect(props.find((p) => p.id === "p2")).toMatchObject({ owned: false, removedAt: 20 });
    expect(JSON.parse((sqlite.prepare("SELECT store_metadata AS m FROM game_properties WHERE id = 'p1'").get() as { m: string }).m)).toMatchObject({ resolvedMedia: expect.any(Object), mediaResolvedAt: 11 });
    expect(await repos.library.countOwned("steam")).toBe(1);
    expect((await repos.library.listLibrary()).map((g) => g.title)).toEqual(["Portal Two"]);
    expect((await repos.syncState.get("steam", "library"))?.lastSuccessAt).toBe(20);
  });

  it("an owned property that was retired comes back owned and visible", async () => {
    await repos.library.applyLibraryPlan(plan(10, { create: [{ canonicalId: "c1", propertyId: "p1", entry: lib("1", "A") }] }));
    await repos.library.applyLibraryPlan(plan(11, { disown: ["p1"], retire: ["p1"] }));
    await repos.library.applyLibraryPlan(plan(12, { update: [{ propertyId: "p1", entry: lib("1", "A") }] }));
    expect(await repos.library.countOwned("steam")).toBe(1);
    expect(await repos.library.listLibrary()).toHaveLength(1);
  });

  it("rolls everything back when the plan fails midway", async () => {
    await expect(
      repos.library.applyLibraryPlan(
        plan(10, { create: [{ canonicalId: "c1", propertyId: "p1", entry: lib("1", "A") }], update: [{ propertyId: "missing", entry: lib("2", "B") }] }),
      ),
    ).rejects.toThrow(/unknown property/);
    expect(await repos.library.listProperties("steam")).toEqual([]);
    expect(await repos.syncState.get("steam", "library")).toBeNull();
  });

  it("the scan no longer overwrites the title of an owned property but still installs it", async () => {
    await repos.library.applyLibraryPlan(plan(10, { create: [{ canonicalId: "c1", propertyId: "p1", entry: lib("620", "Portal 2") }] }));
    await repos.library.applyScanPlan(
      scanPlan(11, {
        update: [{ propertyId: "p1", installationId: "i1", entry: { storeGameId: "620", kind: "game", title: "portal2", normalizedTitle: "portal2", installPath: "D:\\G\\Portal 2", launchData: null } }],
      }),
    );
    const [g] = await repos.library.listLibrary();
    expect(g).toMatchObject({ title: "Portal 2", installed: true, mainAction: "play" });
    expect((await repos.library.listProperties("steam"))[0]).toMatchObject({ title: "Portal 2", owned: true });
  });

  it("mainAction: install when owned and not installed, play when installed, null for scan-only with no owner", async () => {
    await repos.library.applyLibraryPlan(plan(10, { create: [{ canonicalId: "c1", propertyId: "p1", entry: lib("1", "Owned") }] }));
    await repos.library.applyScanPlan(
      scanPlan(11, {
        create: [{ canonicalId: "c2", propertyId: "p2", installationId: "i2", entry: { storeGameId: "2", kind: "game", title: "Installed", normalizedTitle: "installed", installPath: "D:\\I", launchData: null } }],
      }),
    );
    const byTitle = Object.fromEntries((await repos.library.listLibrary()).map((g) => [g.title, g]));
    expect(byTitle.Owned).toMatchObject({ installed: false, mainAction: "install" });
    expect(byTitle.Installed).toMatchObject({ installed: true, mainAction: "play" });
    sqlite.prepare("UPDATE game_properties SET owned = 0 WHERE id = 'p1'").run();
    expect((await repos.library.listLibrary()).find((g) => g.title === "Owned")?.mainAction).toBeNull();
  });

  it("unsynced: not installed and the store is not connected; never for an installed game", async () => {
    await repos.library.applyLibraryPlan(plan(10, { create: [{ canonicalId: "c1", propertyId: "p1", entry: lib("1", "Owned") }] }));
    await repos.library.applyScanPlan(
      scanPlan(11, {
        create: [{ canonicalId: "c2", propertyId: "p2", installationId: "i2", entry: { storeGameId: "2", kind: "game", title: "Installed", normalizedTitle: "installed", installPath: "D:\\I", launchData: null } }],
      }),
    );
    const unsynced = async () => Object.fromEntries((await repos.library.listLibrary()).map((g) => [g.title, g.unsynced]));
    expect(await unsynced()).toEqual({ Owned: true, Installed: false }); // no connection row
    await connect("connected");
    expect(await unsynced()).toEqual({ Owned: false, Installed: false });
    await repos.connections.setStatus("steam", "expired");
    expect(await unsynced()).toEqual({ Owned: true, Installed: false });
    const detail = await repos.library.getGame("c1");
    expect(detail).toMatchObject({ unsynced: true, mainAction: "install" });
    expect(detail?.properties[0]).toMatchObject({ owned: true, installed: false });
    expect(await repos.library.getGame("c2")).toMatchObject({ unsynced: false });
    await repos.connections.delete("steam");
    expect((await repos.library.getGame("c1"))?.unsynced).toBe(true);
    // Disconnecting does not touch the properties (ADR 74 point 12).
    expect(await repos.library.countOwned("steam")).toBe(1);
  });

  it("playtime: sum of the store times of a canonical game, last played is the latest", async () => {
    await repos.library.applyLibraryPlan(
      plan(10, {
        create: [
          { canonicalId: "c1", propertyId: "p1", entry: lib("1", "A", { storePlaytimeMinutes: 30, storeLastPlayedAt: 100 }) },
          { canonicalId: "c2", propertyId: "p2", entry: lib("2", "B") },
        ],
      }),
    );
    // A second property in the same canonical game (a future merge): the totals add up.
    sqlite
      .prepare("INSERT INTO game_properties (id, user_id, canonical_game_id, store, store_game_id, kind, title, normalized_title, owned, store_playtime_minutes, store_last_played_at) SELECT 'p3', user_id, 'c1', 'gog', '9', 'game', 'A', 'a', 1, 45, 300 FROM game_properties WHERE id = 'p1'")
      .run();
    const games = Object.fromEntries((await repos.library.listLibrary()).map((g) => [g.title, g]));
    expect(games.A).toMatchObject({ playtimeMinutes: 75, lastPlayedAt: 300 });
    expect(games.B?.playtimeMinutes).toBe(0);
    expect(games.B).not.toHaveProperty("lastPlayedAt");
  });
});

