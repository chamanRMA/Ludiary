// ADR 89 points 6.3, 6.4 and 16 (H1, H3, M2, M3, M4): the startup state machine on real SQLite files in temporary folders.
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createBackupStore, MIGRATIONS, openDatabase, userBackupName } from "@ludiary/db";
import { makeLudiaryDb, tempDir, type FixtureOptions } from "../../db/test/backup-fixtures";
import { migrateDatabase } from "../src/compose";
import { restartSequence, waitForLockRelease } from "../src/launcher";
import { SimulatedCut, startDatabase, type CutPoint } from "../src/restore-startup";

let dir = "";
let dataDir = "";
let userDir = "";
const NOW = Date.UTC(2026, 10, 4, 12);
const INSTALL = "0a1b2c3d";
const COPY_ID = userBackupName(NOW - 86_400_000, "bbbbbbbb", "manual");
let runs = 0;
const noop = () => {};
type Db = ReturnType<typeof openDatabase>;

beforeEach(() => {
  dir = tempDir();
  dataDir = join(dir, "data");
  userDir = join(dir, "Copias");
  mkdirSync(dataDir, { recursive: true });
  mkdirSync(userDir, { recursive: true });
  runs = 0;
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const CURRENT: FixtureOptions = {
  marker: "current",
  installId: INSTALL,
  periodic: true,
  folder: "D:\\Mine",
  nextAllowedAt: [["steam", "library", 999]],
  roots: [
    { origin: "user", path: "D:\\Games", enabled: true },
    { origin: "user", path: "D:\\Off", enabled: false },
    { origin: "discovered", path: "C:\\Steam", enabled: true },
  ],
};
const RESTORED: FixtureOptions = {
  marker: "restored",
  installId: "bbbbbbbb",
  periodic: false,
  folder: "\\\\other\\share",
  nextAllowedAt: [["steam", "library", 5], ["gog", "library", 6]],
  levels: 5,
  withInstallation: true,
  roots: [
    { origin: "user", path: "\\\\server\\x", enabled: true }, // UNC
    { origin: "user", path: "D:\\Games", enabled: true }, // also on in the current database
    { origin: "user", path: "E:\\Other", enabled: true },
    { origin: "discovered", path: "C:\\Elsewhere", enabled: true },
  ],
};

async function scene(current: FixtureOptions = CURRENT, restored: FixtureOptions = RESTORED, id = COPY_ID): Promise<void> {
  await makeLudiaryDb(join(dataDir, "ludiary.db"), current);
  await makeLudiaryDb(join(userDir, id), restored);
  await prepare(id);
}
const store = () => createBackupStore({ db: undefined as never, dataDir, internalDir: join(dataDir, "backups"), addon: undefined });
const reset = () => {
  for (const d of [dataDir, userDir]) {
    rmSync(d, { recursive: true, force: true });
    mkdirSync(d, { recursive: true });
  }
};
const prepare = (id = COPY_ID) => store().prepareRestore(userDir, id, NOW);

interface RunOptions {
  composeFails?: number;
  migrateFails?: boolean;
  cut?: CutPoint;
}
async function start(o: RunOptions = {}) {
  let composeCalls = 0;
  const at = NOW + 1000 * ++runs;
  const result = await startDatabase({
    dataDir,
    addon: undefined,
    log: noop,
    now: () => at,
    migrate: async (db, skip) => {
      if (o.migrateFails && skip) throw new Error("migration exploded");
      await migrateDatabase(db, join(dataDir, "backups"), noop, skip);
    },
    compose: async () => {
      if (composeCalls++ < (o.composeFails ?? 0)) throw new Error("compose exploded");
      return { composed: true };
    },
    ...(o.cut
      ? {
          cut: (p: CutPoint) => {
            if (p === o.cut) throw new SimulatedCut(p);
          },
        }
      : {}),
  });
  return result;
}

const q = <T>(db: Db, sql: string): T[] => db.prepare(sql).all() as T[];
const marker = (db: Db) => (q<{ value: string }>(db, "SELECT value FROM settings WHERE key = 'test.marker'")[0]?.value ?? null);
const setting = (db: Db, key: string): unknown => {
  const v = q<{ value: string }>(db, `SELECT value FROM settings WHERE key = '${key}'`)[0]?.value;
  return v === undefined ? undefined : JSON.parse(v);
};
const roots = (db: Db) => q<{ path: string; origin: string; enabled: number }>(db, "SELECT path, origin, enabled FROM scan_roots").sort((a, b) => (a.path < b.path ? -1 : 1));
const snapshot = (db: Db) => ({
  marker: marker(db),
  roots: roots(db),
  installations: q(db, "SELECT id FROM installations"),
  sync: q(db, "SELECT store, operation, next_allowed_at FROM sync_state ORDER BY store, operation"),
  settings: q<{ key: string }>(db, "SELECT key, value FROM settings WHERE key LIKE 'backups.%' AND key != 'backups.restoredAt' ORDER BY key"),
  migrations: q<{ n: number }>(db, "SELECT count(*) AS n FROM schema_migrations")[0]?.n,
});
const open = () => openDatabase(join(dataDir, "ludiary.db"), undefined);
const internal = () => (existsSync(join(dataDir, "backups")) ? readdirSync(join(dataDir, "backups")) : []);
const pending = () => readdirSync(dataDir).filter((f) => f.startsWith("restore-pending"));

describe("restoration at startup", () => {
  it("applies the copy: restored data, current settings kept, installations gone, no pre-migration copy", async () => {
    await scene();
    const { db, lastRestore } = await start();
    expect(marker(db)).toBe('"restored"');
    expect(snapshot(db).migrations).toBe(MIGRATIONS.length); // migrated up from level 5 to the current one
    expect(q(db, "SELECT id FROM installations")).toEqual([]); // a launch_data of the copy is never used (point 6.3 C)
    expect(setting(db, "backups.periodic")).toBe(true);
    expect(setting(db, "backups.folder")).toBe("D:\\Mine");
    expect(setting(db, "backups.installId")).toBe(INSTALL);
    expect(setting(db, "backups.restoredAt")).toBe(NOW + 1000);
    expect(q(db, "SELECT store, operation, next_allowed_at AS at FROM sync_state ORDER BY store")).toEqual([
      { store: "gog", operation: "library", at: null },
      { store: "steam", operation: "library", at: 999 },
    ]);
    expect(lastRestore).toEqual({ id: COPY_ID, at: NOW + 1000, outcome: "ok", disabledRoots: 2 });
    expect(pending()).toEqual([]);
    expect(internal().filter((f) => f.startsWith("pre-migration"))).toEqual([]);
    const pre = internal().filter((f) => f.startsWith("pre-restore"));
    expect(pre).toHaveLength(1);
    expect(pre[0]).toMatch(/^pre-restore-\d{15}-origin\.sqlite$/); // the current data had no restoredAt: origin of a chain
    const copy = openDatabase(join(dataDir, "backups", pre[0]!), undefined);
    expect(marker(copy)).toBe('"current"');
    copy.close();
    db.close();
  });

  it("H1: only a user folder that is also on in the current database stays on, whatever the install id; discovered ones go", async () => {
    for (const installId of ["bbbbbbbb", INSTALL]) {
      reset();
      await scene(CURRENT, { ...RESTORED, installId }, userBackupName(NOW - 1000, "bbbbbbbb", "manual"));
      const { db } = await start();
      expect(roots(db), installId).toEqual([
        { path: "D:\\Games", origin: "user", enabled: 1 },
        { path: "E:\\Other", origin: "user", enabled: 0 },
        { path: "\\\\server\\x", origin: "user", enabled: 0 },
      ]);
      db.close();
    }
  });

  it("H3: a cut after any phase ends in the restored state, identical to the uninterrupted run", async () => {
    await scene();
    const whole = await start();
    const expected = snapshot(whole.db);
    whole.db.close();
    for (const cut of ["after-swap", "after-migrate", "after-adjust", "after-compose"] as const) {
      reset();
      await scene();
      await expect(start({ cut }), cut).rejects.toBeInstanceOf(SimulatedCut);
      const again = await start();
      expect(again.lastRestore, cut).toMatchObject({ outcome: "ok", disabledRoots: 2 });
      expect(snapshot(again.db), cut).toEqual(expected);
      expect(pending(), cut).toEqual([]);
      again.db.close();
    }
  });

  it("H3: a cut in the middle of the swap (phase swapped, the .sqlite still there) finishes the swap", async () => {
    await scene();
    const sqlite = join(dataDir, "restore-pending.sqlite");
    const before = join(dir, "pending-copy.sqlite");
    copyFileSync(sqlite, before);
    const oldDb = join(dir, "current-copy.db");
    copyFileSync(join(dataDir, "ludiary.db"), oldDb);
    await expect(start({ cut: "after-swap" })).rejects.toBeInstanceOf(SimulatedCut);
    // Put the files back as they were at the moment of the cut: swapped phase, nothing renamed yet, a stale -wal around.
    copyFileSync(before, sqlite);
    copyFileSync(oldDb, join(dataDir, "ludiary.db"));
    writeFileSync(join(dataDir, "ludiary.db-wal"), "stale");
    const { db, lastRestore } = await start();
    expect(marker(db)).toBe('"restored"');
    expect(lastRestore?.outcome).toBe("ok");
    db.close();
  });

  it("H3: a cut during the roll back (phase rolling-back) finishes it and keeps the previous data", async () => {
    await scene();
    await expect(start({ cut: "after-adjust" })).rejects.toBeInstanceOf(SimulatedCut);
    const json = join(dataDir, "restore-pending.json");
    writeFileSync(json, JSON.stringify({ ...JSON.parse(readFileSync(json, "utf8")), phase: "rolling-back" }));
    const { db, lastRestore } = await start();
    expect(marker(db)).toBe('"current"');
    expect(lastRestore).toMatchObject({ id: COPY_ID, outcome: "rolled-back" });
    expect(pending()).toEqual([]);
    db.close();
  });

  it("H3: step C twice leaves the same thing", async () => {
    await scene();
    await expect(start({ cut: "after-adjust" })).rejects.toBeInstanceOf(SimulatedCut);
    const once = open();
    const a = snapshot(once);
    once.close();
    const { db } = await start(); // phase adjusted: C is repeated
    expect(snapshot(db)).toEqual(a);
    db.close();
  });

  it("M4: a composeCore that fails after C rolls everything back; the copy before is intact and the data in use are the old ones", async () => {
    await scene();
    const before = readdirSync(join(dataDir)).length;
    const { db, lastRestore } = await start({ composeFails: 1 });
    expect(marker(db)).toBe('"current"');
    expect(setting(db, "backups.restoredAt")).toBeUndefined();
    expect(roots(db).find((r) => r.path === "D:\\Off")?.enabled).toBe(0);
    expect(lastRestore).toMatchObject({ id: COPY_ID, outcome: "rolled-back", disabledRoots: 0 });
    expect(pending()).toEqual([]);
    expect(internal().filter((f) => f.startsWith("pre-restore"))).toHaveLength(1); // M2: nothing pruned, nothing lost
    expect(readdirSync(dataDir).length).toBeGreaterThanOrEqual(before - 2);
    db.close();
  });

  it("M4: a migration that fails on the restored copy also rolls back", async () => {
    await scene();
    const { db, lastRestore } = await start({ migrateFails: true });
    expect(marker(db)).toBe('"current"');
    expect(lastRestore?.outcome).toBe("rolled-back");
    db.close();
  });

  it("M2: a second restoration in a row keeps the -origin copy while the plain ones are pruned; a roll back prunes nothing", async () => {
    await scene();
    mkdirSync(join(dataDir, "backups"), { recursive: true });
    for (let i = 1; i <= 4; i++) writeFileSync(join(dataDir, "backups", `pre-restore-${String(1000 + i).padStart(15, "0")}.sqlite`), "old");
    (await start()).db.close(); // restoration 1: creates the -origin copy; restoredAt stays in the base
    const origin = internal().find((f) => f.endsWith("-origin.sqlite"))!;
    expect(origin).toBeTruthy();
    // Restoration 2 right away (no plain start in between).
    await makeLudiaryDb(join(userDir, "second.tmp"), { ...RESTORED, marker: "second" });
    const second = userBackupName(NOW - 500, "bbbbbbbb", "manual");
    copyFileSync(join(userDir, "second.tmp"), join(userDir, second));
    await prepare(second);
    (await start()).db.close();
    const left = internal().filter((f) => f.startsWith("pre-restore"));
    expect(left).toContain(origin); // the origin of the chain survives
    expect(left.filter((f) => !f.endsWith("-origin.sqlite"))).toHaveLength(3); // the 3 newest plain ones
    expect(left).not.toContain(`pre-restore-${String(1001).padStart(15, "0")}.sqlite`);

    // A roll back prunes nothing.
    const count = left.length;
    const third = userBackupName(NOW - 400, "bbbbbbbb", "manual");
    copyFileSync(join(userDir, "second.tmp"), join(userDir, third));
    await prepare(third);
    (await start({ composeFails: 1 })).db.close();
    expect(internal().filter((f) => f.startsWith("pre-restore")).length).toBe(count + 1);
  });

  it("M3: an unreadable current database is moved aside, without opening it, to a -raw folder and the restoration goes on", async () => {
    await makeLudiaryDb(join(userDir, COPY_ID), RESTORED);
    writeFileSync(join(dataDir, "ludiary.db"), "garbage, not sqlite".repeat(20));
    writeFileSync(join(dataDir, "ludiary.db-wal"), "wal");
    writeFileSync(join(dataDir, "ludiary.db-shm"), "shm");
    await prepare();
    const { db, lastRestore } = await start();
    expect(marker(db)).toBe('"restored"');
    const raw = internal().find((f) => f.endsWith("-raw"))!;
    expect(readdirSync(join(dataDir, "backups", raw))).toContain("ludiary.db"); // -wal and -shm too when they exist and survive the failed open
    expect(setting(db, "backups.periodic")).toBeUndefined(); // defaults: nothing carried over
    expect(setting(db, "backups.installId")).toBeUndefined();
    expect(lastRestore).toMatchObject({ outcome: "ok", disabledRoots: 3 });
    db.close();
  });

  it("M3: the roll back of a restoration that moved the files aside brings them back", async () => {
    await makeLudiaryDb(join(userDir, COPY_ID), RESTORED);
    writeFileSync(join(dataDir, "ludiary.db"), "garbage, not sqlite".repeat(20));
    await prepare();
    // The files come back as they were; the plain start that follows then fails on them, as it would have before the restoration.
    await expect(start({ composeFails: 1 })).rejects.toThrow();
    expect(readFileSync(join(dataDir, "ludiary.db"), "utf8")).toContain("garbage");
    expect(pending()).toEqual([]);
  });

  it("a prepared phase whose .sqlite vanished is dropped; leftovers without a .json are deleted; nothing pending is a plain start", async () => {
    await makeLudiaryDb(join(dataDir, "ludiary.db"), { ...CURRENT, restoredAt: 5 });
    writeFileSync(join(dataDir, "restore-pending.json"), JSON.stringify({ phase: "prepared", id: COPY_ID, requestedAt: 1 }));
    const dropped = await start();
    expect(dropped.lastRestore).toMatchObject({ id: COPY_ID, outcome: "rolled-back" });
    expect(marker(dropped.db)).toBe('"current"');
    dropped.db.close();
    writeFileSync(join(dataDir, "restore-pending.sqlite"), "half");
    writeFileSync(join(dataDir, "restore-pending.sqlite.partial"), "half");
    const plain = await start();
    expect(plain.lastRestore).toBeNull();
    expect(pending()).toEqual([]);
    expect(setting(plain.db, "backups.restoredAt")).toBeUndefined(); // a plain start closes the chain (M2)
    plain.db.close();
  });
});

describe("restart (ADR 89 point 6.2)", () => {
  it("the launcher is started before the shutdown", () => {
    const order: string[] = [];
    restartSequence(() => order.push("launcher"), () => order.push("shutdown"));
    expect(order).toEqual(["launcher", "shutdown"]);
  });

  it("--after-restart waits until the instance lock is free, and gives up after the deadline", async () => {
    let held = 3;
    expect(await waitForLockRelease(async () => held-- > 0, 2000, 5)).toBe(true);
    expect(held).toBeLessThan(0);
    expect(await waitForLockRelease(async () => true, 30, 5)).toBe(false);
  });
});
