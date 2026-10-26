// DLC in the database (ADR 83, points 6, 11 and 13).
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type Database from "better-sqlite3";
import type { LibraryEntry, LibraryPlan, ScanPlan, SyncStateRecord } from "@ludiary/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRepositories, MIGRATIONS, migrate, openDatabase, type Repositories } from "../src";

let dir = "";
let sqlite: Database.Database;
let repos: Repositories;
const warn = vi.fn();
let n = 0;
const newId = () => `id-${++n}`;
const COVER = "https://shared.akamai.steamstatic.com/a/library_600x900.jpg";

beforeEach(async () => {
  n = 0;
  warn.mockClear();
  dir = mkdtempSync(join(tmpdir(), "ludiary-dlc-"));
  sqlite = openDatabase(join(dir, "ludiary.sqlite"), undefined);
  await migrate(sqlite, { backupDir: join(dir, "backups") });
  repos = createRepositories(sqlite, { warn });
  await repos.identity.ensure(newId, 1);
});
afterEach(() => {
  sqlite.close();
  rmSync(dir, { recursive: true, force: true });
});

const sync = (at: number): SyncStateRecord => ({ store: "gog", operation: "library", lastAttemptAt: at, lastSuccessAt: at, status: "idle", error: null, nextAllowedAt: at + 1 });
const game = (id: string, title: string, extra: Partial<LibraryEntry> = {}): LibraryEntry => ({
  storeGameId: id,
  kind: "game",
  title,
  normalizedTitle: title.toLowerCase(),
  storePlaytimeMinutes: null,
  storeLastPlayedAt: null,
  ...extra,
});
const dlc = (id: string, title: string, base: string | null = null): LibraryEntry => ({ ...game(id, title), kind: "dlc", baseStoreGameId: base });
const plan = (at: number, p: Partial<LibraryPlan>): LibraryPlan => ({ store: "gog", at, create: [], update: [], disown: [], retire: [], kindChanges: [], dlcLinks: [], sync: sync(at), ...p });
const rows = () => sqlite.prepare("SELECT id, kind, canonical_game_id AS c, base_store_game_id AS b FROM game_properties ORDER BY id").all();
const canonicals = () => (sqlite.prepare("SELECT id, title FROM canonical_games ORDER BY id").all() as { id: string; title: string }[]);

describe("migration 0003_dlc", () => {
  it("adds a nullable base_store_game_id to a database that has data", async () => {
    const other = openDatabase(join(dir, "old.sqlite"), undefined);
    await migrate(other, { backupDir: join(dir, "b2"), migrations: MIGRATIONS.slice(0, 3) });
    other.exec("INSERT INTO users (id, created_at) VALUES ('u', 1)");
    other.exec("INSERT INTO game_properties (id, user_id, store, store_game_id, kind, title, normalized_title) VALUES ('p', 'u', 'gog', '1', 'game', 'T', 't')");
    await migrate(other, { backupDir: join(dir, "b2") });
    expect(other.prepare("SELECT base_store_game_id AS b FROM game_properties").get()).toEqual({ b: null });
    other.close();
  });
});

describe("DLC rows", () => {
  it("inserts a DLC without a canonical game, linked to the base created in the same plan", async () => {
    await repos.library.applyLibraryPlan(plan(10, { create: [{ canonicalId: "c1", propertyId: "p1", entry: game("1", "Base") }, { canonicalId: "c1", propertyId: "p2", entry: dlc("2", "Pack", "1") }] }));
    expect(canonicals()).toHaveLength(1);
    expect(rows()).toEqual([
      { id: "p1", kind: "game", c: "c1", b: null },
      { id: "p2", kind: "dlc", c: "c1", b: "1" },
    ]);
    expect(await repos.library.countOwned("gog")).toBe(1);
    expect(await repos.library.listLibrary()).toHaveLength(1);
  });

  it("keeps an orphan with a null canonical and links it later", async () => {
    await repos.library.applyLibraryPlan(plan(10, { create: [{ canonicalId: null, propertyId: "p2", entry: dlc("2", "Pack", "1") }] }));
    expect(canonicals()).toHaveLength(0);
    expect(rows()).toEqual([{ id: "p2", kind: "dlc", c: null, b: "1" }]);
    await repos.library.applyLibraryPlan(plan(20, { create: [{ canonicalId: "c1", propertyId: "p1", entry: game("1", "Base") }], dlcLinks: [{ propertyId: "p2", canonicalId: "c1" }] }));
    expect(rows()).toEqual([
      { id: "p1", kind: "game", c: "c1", b: null },
      { id: "p2", kind: "dlc", c: "c1", b: "1" },
    ]);
  });

  it("dlcLinks only touch DLC of the store", async () => {
    await repos.library.applyLibraryPlan(plan(10, { create: [{ canonicalId: "c1", propertyId: "p1", entry: game("1", "Base") }] }));
    await repos.library.applyLibraryPlan(plan(20, { dlcLinks: [{ propertyId: "p1", canonicalId: null }] }));
    expect(rows()).toEqual([{ id: "p1", kind: "game", c: "c1", b: null }]);
  });

  it("the canonical game of a game with DLC keeps following its store; updating a DLC never renames it", async () => {
    await repos.library.applyLibraryPlan(plan(10, { create: [{ canonicalId: "c1", propertyId: "p1", entry: game("1", "Base") }, { canonicalId: "c1", propertyId: "p2", entry: dlc("2", "Pack", "1") }] }));
    await repos.library.applyLibraryPlan(plan(20, { update: [{ propertyId: "p2", entry: dlc("2", "Pack renamed", "1") }] }));
    expect(canonicals()).toEqual([{ id: "c1", title: "Base" }]);
    await repos.library.applyLibraryPlan(plan(30, { update: [{ propertyId: "p1", entry: game("1", "Base 2", { media: { coverUrl: COVER } }) }] }));
    expect(canonicals()).toEqual([{ id: "c1", title: "Base 2" }]);
    expect(sqlite.prepare("SELECT media FROM canonical_games").get()).toEqual({ media: JSON.stringify({ coverUrl: COVER }) });
  });

  it("a DLC that becomes a game gets its own canonical game and leaves the base title and cover alone", async () => {
    await repos.library.applyLibraryPlan(plan(10, { create: [{ canonicalId: "c1", propertyId: "p1", entry: game("1", "Base", { media: { coverUrl: COVER } }) }, { canonicalId: "c1", propertyId: "p2", entry: dlc("2", "Standalone", "1") }] }));
    await repos.library.applyLibraryPlan(plan(20, { update: [{ propertyId: "p2", entry: game("2", "Standalone") }], kindChanges: [{ propertyId: "p2", kind: "game", canonicalId: "c2" }] }));
    expect(canonicals()).toEqual([
      { id: "c1", title: "Base" },
      { id: "c2", title: "Standalone" },
    ]);
    expect(rows()).toEqual([
      { id: "p1", kind: "game", c: "c1", b: null },
      { id: "p2", kind: "game", c: "c2", b: null },
    ]);
    expect(sqlite.prepare("SELECT media FROM canonical_games WHERE id = 'c1'").get()).toEqual({ media: JSON.stringify({ coverUrl: COVER }) });
  });

  it("a game that becomes a DLC deletes its now empty canonical game, in the same transaction", async () => {
    await repos.library.applyLibraryPlan(plan(10, { create: [{ canonicalId: "c1", propertyId: "p1", entry: game("1", "Base") }, { canonicalId: "c2", propertyId: "p2", entry: game("2", "Expansion") }] }));
    await repos.library.applyLibraryPlan(plan(20, { update: [{ propertyId: "p2", entry: dlc("2", "Expansion", "1") }], kindChanges: [{ propertyId: "p2", kind: "dlc", canonicalId: "c1" }] }));
    expect(canonicals()).toEqual([{ id: "c1", title: "Base" }]);
    expect(rows()).toEqual([
      { id: "p1", kind: "game", c: "c1", b: null },
      { id: "p2", kind: "dlc", c: "c1", b: "1" },
    ]);
  });

  it("stores dlcInferred in the property metadata", async () => {
    await repos.library.applyLibraryPlan(plan(10, { create: [{ canonicalId: null, propertyId: "p2", entry: { ...dlc("2", "Pack", "1"), dlcInferred: true } }] }));
    expect(sqlite.prepare("SELECT store_metadata AS m FROM game_properties").get()).toEqual({ m: JSON.stringify({ dlcInferred: true }) });
  });
});

describe("scan conflict", () => {
  it("a DLC scan entry over a game row does not overwrite the installation launch data", async () => {
    await repos.library.applyLibraryPlan(plan(10, { create: [{ canonicalId: "c1", propertyId: "p1", entry: game("1", "Base") }] }));
    const scan = (at: number, entry: ScanPlan["update"][number]["entry"]): ScanPlan => ({
      store: "gog", at, create: [], update: [{ propertyId: "p1", installationId: "i1", entry }], removeInstallations: [], retireProperties: [], reviveProperties: [], kindChanges: [], dlcLinks: [],
      upsertDiscoveredRoots: [], deleteRoots: [], sync: sync(at),
    });
    const base = { storeGameId: "1", normalizedTitle: "base", installPath: "D:\Games\Base" } as const;
    await repos.library.applyScanPlan(scan(20, { ...base, kind: "game", title: "Base", launchData: { exe: "base.exe" } }));
    await repos.library.applyScanPlan(scan(30, { ...base, kind: "dlc", title: "Pack", baseStoreGameId: "0", installPath: "D:\Games\Pack", launchData: null }));
    expect(await repos.library.listInstallations("gog")).toEqual([expect.objectContaining({ installPath: "D:\Games\Base", launchData: { exe: "base.exe" } })]);
  });
});

describe("getGame DLC", () => {
  it("lists live DLC by title with installed, and Tiendas/Biblioteca do not count them", async () => {
    await repos.library.applyLibraryPlan(
      plan(10, {
        create: [
          { canonicalId: "c1", propertyId: "p1", entry: game("1", "Base") },
          { canonicalId: "c1", propertyId: "p3", entry: dlc("3", "Zeta", "1") },
          { canonicalId: "c1", propertyId: "p2", entry: dlc("2", "alpha", "1") },
        ],
      }),
    );
    const device = (sqlite.prepare("SELECT id FROM devices").get() as { id: string }).id;
    sqlite.prepare("INSERT INTO installations (id, user_id, property_id, device_id, install_path, detected_by, last_seen_at) SELECT 'i', user_id, 'p3', ?, 'D:\\x', 'scan', 1 FROM game_properties WHERE id = 'p3'").run(device);
    const g = await repos.library.getGame("c1");
    expect(g?.dlc).toEqual([
      { id: "p2", title: "alpha", store: "gog", installed: false },
      { id: "p3", title: "Zeta", store: "gog", installed: true },
    ]);
    expect(g?.properties).toHaveLength(1);
  });

  it("cuts at 1000 and warns with the count", async () => {
    const create = [{ canonicalId: "c1", propertyId: "p0", entry: game("0", "Base") }];
    for (let i = 1; i <= 1001; i++) create.push({ canonicalId: "c1", propertyId: `d${i}`, entry: dlc(String(i), `Dlc ${String(i).padStart(4, "0")}`, "0") });
    await repos.library.applyLibraryPlan(plan(10, { create }));
    expect((await repos.library.getGame("c1"))?.dlc).toHaveLength(1000);
    expect(warn).toHaveBeenCalledWith(expect.any(String), { dlc: 1001, shown: 1000 });
  });
});

describe("DLC titles (ADR 84)", () => {
  const seed = async () =>
    repos.library.applyLibraryPlan(
      plan(10, {
        create: [
          { canonicalId: "c1", propertyId: "p1", entry: game("1", "Base") },
          { canonicalId: "c1", propertyId: "p2", entry: dlc("2", "Zeta", "1") },
          { canonicalId: "c1", propertyId: "p3", entry: dlc("3", "Beta", "1") },
        ],
      }),
    );

  it("lists only DLC of that store, not retired, pending, and stamps even without a title", async () => {
    await seed();
    expect(await repos.library.listTitlePending("gog", 0, 10)).toEqual(["2", "3"]); // never the game "1"
    expect(await repos.library.listTitlePending("steam", 0, 10)).toEqual([]);
    await repos.library.setResolvedTitles("gog", new Map([["2", "Alpha pack"]]), ["2", "3"], 100);
    expect(await repos.library.listTitlePending("gog", 50, 10)).toEqual([]);
    expect(await repos.library.listTitlePending("gog", 150, 10)).toEqual(["2", "3"]);
    await repos.library.applyLibraryPlan(plan(20, { retire: ["p3"] }));
    expect(await repos.library.listTitlePending("gog", 150, 10)).toEqual(["2"]);
  });

  it("never writes to a game row, nor to another store's row", async () => {
    await seed();
    await repos.library.setResolvedTitles("gog", new Map([["1", "Hacked"]]), ["1"], 5);
    await repos.library.setResolvedTitles("steam", new Map([["2", "Hacked"]]), ["2"], 5);
    expect(sqlite.prepare("SELECT count(*) AS n FROM game_properties WHERE store_metadata LIKE '%Hacked%' OR store_metadata LIKE '%titleResolvedAt%'").get()).toEqual({ n: 0 });
  });

  it("getGame shows and sorts by the resolved title; a missing answer keeps the previous one", async () => {
    await seed();
    const id = (await repos.library.listLibrary())[0]!.id;
    expect((await repos.library.getGame(id))!.dlc.map((d) => d.title)).toEqual(["Beta", "Zeta"]);
    await repos.library.setResolvedTitles("gog", new Map([["2", "Alpha pack"]]), ["2", "3"], 100);
    expect((await repos.library.getGame(id))!.dlc.map((d) => d.title)).toEqual(["Alpha pack", "Beta"]);
    await repos.library.setResolvedTitles("gog", new Map(), ["2"], 200);
    expect((await repos.library.getGame(id))!.dlc.map((d) => d.title)).toEqual(["Alpha pack", "Beta"]);
  });

  it("a library sync keeps resolvedTitle and titleResolvedAt, so nothing is pending afterwards", async () => {
    await seed();
    await repos.library.setResolvedTitles("gog", new Map([["2", "Alpha pack"]]), ["2", "3"], 100);
    await repos.library.applyLibraryPlan(plan(30, { update: [{ propertyId: "p2", entry: dlc("2", "Zeta", "1") }, { propertyId: "p3", entry: dlc("3", "Beta", "1") }] }));
    expect(await repos.library.listTitlePending("gog", 50, 10)).toEqual([]);
    const id = (await repos.library.listLibrary())[0]!.id;
    expect((await repos.library.getGame(id))!.dlc[0]!.title).toBe("Alpha pack");
  });

  it("a scan keeps them too", async () => {
    await seed();
    await repos.library.setResolvedTitles("gog", new Map([["2", "Alpha pack"]]), ["2", "3"], 100);
    await repos.library.applyScanPlan({
      store: "gog",
      at: 40,
      create: [],
      update: [{ propertyId: "p2", installationId: "i2", entry: { storeGameId: "2", kind: "dlc", title: "Zeta", normalizedTitle: "zeta", baseStoreGameId: "1", installPath: "D:\G", launchData: null } }],
      removeInstallations: [], retireProperties: [], reviveProperties: [], kindChanges: [], dlcLinks: [], upsertDiscoveredRoots: [], deleteRoots: [],
      sync: sync(40),
    } satisfies ScanPlan);
    expect(await repos.library.listTitlePending("gog", 50, 10)).toEqual([]);
    expect(sqlite.prepare("SELECT json_extract(store_metadata, '$.resolvedTitle') AS t FROM game_properties WHERE id = 'p2'").get()).toEqual({ t: "Alpha pack" });
  });
});
