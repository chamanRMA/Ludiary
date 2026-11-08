// Manual games in the database (ADR 93 points 3, 6 and 15).
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type Database from "better-sqlite3";
import type { LibraryPlan, ScanPlan, SyncStateRecord } from "@ludiary/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { applyRestoreAdjustments, createRepositories, migrate, openDatabase, type KeptValues, type Repositories, type RestorePaths } from "../src";

let dir = "";
let sqlite: Database.Database;
let repos: Repositories;
let n = 0;
const newId = () => `id-${++n}`;
const EXE = "D:\\Games\\Farm\\farm.exe";
const FOLDER = "D:\\Games\\Farm";
const same = (e: string) => e.toLowerCase() === EXE.toLowerCase();
const paths: RestorePaths = { compareKey: (p) => p.toLowerCase(), dirname: (p) => p.slice(0, p.lastIndexOf("\\")) };

beforeEach(async () => {
  n = 0;
  dir = mkdtempSync(join(tmpdir(), "ludiary-manual-"));
  sqlite = openDatabase(join(dir, "ludiary.sqlite"), undefined);
  await migrate(sqlite, { backupDir: join(dir, "backups") });
  repos = createRepositories(sqlite);
  await repos.identity.ensure(newId, 1);
});
afterEach(() => {
  sqlite.close();
  rmSync(dir, { recursive: true, force: true });
});

const count = (table: string) => (sqlite.prepare(`SELECT count(*) AS n FROM ${table}`).get() as { n: number }).n;
const add = (executable = EXE, installPath = FOLDER) => repos.library.addManualGame({ title: "Farm", executable, installPath, same: (e) => e.toLowerCase() === executable.toLowerCase() }, 5);
const sync = (store: string): SyncStateRecord => ({ store: store as "gog", operation: "library", lastAttemptAt: 9, lastSuccessAt: 9, status: "idle", error: null, nextAllowedAt: 10 });

describe("addManualGame", () => {
  it("writes canonical, property and installation in one go, and returns the same game for the same executable", async () => {
    const a = await add();
    expect(a.created).toBe(true);
    const b = await repos.library.addManualGame({ title: "Other", executable: EXE.toUpperCase(), installPath: FOLDER, same }, 6);
    expect(b).toEqual({ canonicalId: a.canonicalId, created: false });
    expect([count("canonical_games"), count("game_properties"), count("installations")]).toEqual([1, 1, 1]);
    expect(sqlite.prepare("SELECT store, kind, owned, user_id FROM game_properties").get()).toMatchObject({ store: "manual", kind: "game", owned: 1 });
    expect(sqlite.prepare("SELECT detected_by AS d, install_path AS p, launch_data AS l FROM installations").get()).toEqual({ d: "library", p: FOLDER, l: JSON.stringify({ executable: EXE }) });
    expect(await repos.library.findManualByExecutable(same)).toBe(a.canonicalId);
    const g = (await repos.library.getGame(a.canonicalId))!;
    expect(g).toMatchObject({ title: "Farm", stores: [], installed: true, properties: [{ store: "manual", installed: true }] });
  });
});

describe("rename, change and remove", () => {
  it("renames canonical and property together; a store game is action-unavailable", async () => {
    const { canonicalId } = await add();
    await repos.userData.updateGame(canonicalId, { title: "My farm" }, 7);
    expect(sqlite.prepare("SELECT title, normalized_title AS t FROM canonical_games").get()).toMatchObject({ title: "My farm" });
    expect(sqlite.prepare("SELECT title FROM game_properties").get()).toEqual({ title: "My farm" });
    sqlite.prepare("UPDATE game_properties SET store = 'steam'").run();
    await expect(repos.userData.updateGame(canonicalId, { title: "x" }, 8)).rejects.toMatchObject({ code: "action-unavailable" });
  });

  it("changes the executable of this device in place and creates it when missing", async () => {
    const { canonicalId } = await add();
    await repos.library.setManualInstallation(canonicalId, { executable: "E:\\New\\n.exe", installPath: "E:\\New" }, 9);
    expect(sqlite.prepare("SELECT install_path AS p, detected_by AS d FROM installations").all()).toEqual([{ p: "E:\\New", d: "library" }]);
    sqlite.prepare("DELETE FROM installations").run();
    await repos.library.setManualInstallation(canonicalId, { executable: EXE, installPath: FOLDER }, 10);
    expect(count("installations")).toBe(1);
    await expect(repos.library.setManualInstallation("nope", { executable: EXE, installPath: FOLDER }, 10)).rejects.toMatchObject({ code: "not-found" });
  });

  it("removes the game with its user data and orphan tags in one transaction; refuses store games", async () => {
    const { canonicalId } = await add();
    const other = await add("D:\\Games\\Two\\two.exe", "D:\\Games\\Two");
    await repos.userData.updateGame(canonicalId, { favorite: true, tags: [{ name: "Mine", key: "mine" }] }, 7);
    await repos.userData.updateGame(other.canonicalId, { tags: [{ name: "Mine", key: "mine" }] }, 7);
    const col = await repos.userData.createCollection({ name: "C", key: "c" }, 7);
    await repos.userData.updateGame(canonicalId, { collectionIds: [col.id] }, 8);
    await repos.library.removeManual(canonicalId);
    expect([count("canonical_games"), count("game_properties"), count("installations"), count("user_game_data"), count("collection_games"), count("tags")]).toEqual([1, 1, 1, 0, 0, 1]);
    await repos.library.removeManual(other.canonicalId);
    expect(count("tags")).toBe(0);
    await expect(repos.library.removeManual(other.canonicalId)).rejects.toMatchObject({ code: "not-found" });
    sqlite.prepare("INSERT INTO canonical_games (id, user_id, title, normalized_title, created_at, updated_at) SELECT 'cs', id, 'S', 's', 1, 1 FROM users").run();
    sqlite.prepare("INSERT INTO game_properties (id, user_id, canonical_game_id, store, store_game_id, kind, title, normalized_title) SELECT 'ps', id, 'cs', 'steam', '1', 'game', 'S', 's' FROM users").run();
    await expect(repos.library.removeManual("cs")).rejects.toMatchObject({ code: "action-unavailable" });
  });
});

describe("store syncs and scans leave manual rows intact (A8)", () => {
  it("full scan and library plans with removals and retirements", async () => {
    const { canonicalId } = await add();
    const snap = () => JSON.stringify(sqlite.prepare("SELECT * FROM installations").all()) + JSON.stringify(sqlite.prepare("SELECT * FROM game_properties WHERE store = 'manual'").all());
    const before = snap();
    const entry = { storeGameId: "1", kind: "game" as const, title: "S", normalizedTitle: "s", storePlaytimeMinutes: null, storeLastPlayedAt: null };
    const lib: LibraryPlan = { store: "gog", at: 20, create: [{ canonicalId: "cg", propertyId: "pg", entry }], update: [], disown: [], retire: [], kindChanges: [], dlcLinks: [], sync: sync("gog") };
    await repos.library.applyLibraryPlan(lib);
    await repos.library.applyLibraryPlan({ ...lib, create: [], retire: ["pg"] });
    const scan: ScanPlan = { store: "steam", at: 30, create: [], update: [], removeInstallations: [], retireProperties: [], reviveProperties: [], kindChanges: [], dlcLinks: [], upsertDiscoveredRoots: [], deleteRoots: [], sync: sync("steam") };
    await repos.library.applyScanPlan(scan);
    expect(snap()).toBe(before);
    expect(await repos.library.findManualByExecutable(same)).toBe(canonicalId);
    expect(sqlite.prepare("SELECT removed_at FROM game_properties WHERE store = 'manual'").get()).toEqual({ removed_at: null });
  });
});

describe("applyRestoreAdjustments (ADR 93 point 6, A1, A7)", () => {
  const kept = (current: { executable: string; installPath: string }[]): KeptValues => ({
    nextAllowedAt: [],
    activeUserRoots: [],
    activeManualExecutables: current.map((c) => ({ key: c.executable.toLowerCase(), ...c })),
  });
  const rows = () => sqlite.prepare("SELECT install_path AS p, launch_data AS l FROM installations").all();

  it("keeps a manual installation whose executable is current and folder matches, rewriting it with the current values", async () => {
    await add();
    applyRestoreAdjustments(sqlite, kept([{ executable: "D:\\GAMES\\Farm\\FARM.exe", installPath: "D:\\GAMES\\Farm" }]), 50, paths);
    expect(rows()).toEqual([{ p: "D:\\GAMES\\Farm", l: JSON.stringify({ executable: "D:\\GAMES\\Farm\\FARM.exe" }) }]);
  });

  it("deletes it when the executable is not current, the folder differs, or there are no path helpers", async () => {
    await add();
    applyRestoreAdjustments(sqlite, kept([{ executable: "D:\\Other\\o.exe", installPath: "D:\\Other" }]), 50, paths);
    expect(rows()).toEqual([]);
    await add();
    sqlite.prepare("UPDATE installations SET install_path = 'D:\\Elsewhere'").run();
    applyRestoreAdjustments(sqlite, kept([{ executable: EXE, installPath: FOLDER }]), 51, paths);
    expect(rows()).toEqual([]);
    await add();
    applyRestoreAdjustments(sqlite, kept([{ executable: EXE, installPath: FOLDER }]), 52);
    expect(rows()).toEqual([]);
  });

  it("still deletes every non-manual installation", async () => {
    await add();
    sqlite.prepare("UPDATE game_properties SET store = 'steam'").run();
    applyRestoreAdjustments(sqlite, kept([{ executable: EXE, installPath: FOLDER }]), 50, paths);
    expect(rows()).toEqual([]);
  });
});
