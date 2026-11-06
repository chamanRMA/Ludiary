import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, truncateSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MIGRATIONS, createBackupStore, openDatabase, userBackupName } from "../src";
import { makeLudiaryDb, tempDir } from "./backup-fixtures";

let dir = "";
let userDir = "";
let dataDir = "";
let live: Database.Database;
const INSTALL = "0a1b2c3d";
const OTHER = "ffffffff";
const NOW = Date.UTC(2026, 10, 4, 12, 30, 15, 123);

beforeEach(async () => {
  dir = tempDir();
  userDir = join(dir, "Copias");
  dataDir = join(dir, "data");
  mkdirSync(dataDir, { recursive: true });
  await makeLudiaryDb(join(dataDir, "ludiary.db"), { installId: INSTALL, marker: "live" });
  live = openDatabase(join(dataDir, "ludiary.db"), undefined);
});
afterEach(() => {
  live.close();
  rmSync(dir, { recursive: true, force: true });
});

const store = (extra: Partial<Parameters<typeof createBackupStore>[0]> = {}) =>
  createBackupStore({ db: live, dataDir, internalDir: join(dataDir, "backups"), addon: undefined, ...extra });
const leftovers = () => readdirSync(dataDir).filter((f) => f.startsWith("restore-pending"));

/** A valid copy of the live database in the user folder, named for `kind`. */
async function seedCopy(kind: "auto" | "manual" = "manual", installId = INSTALL, now = NOW): Promise<string> {
  mkdirSync(userDir, { recursive: true });
  const name = userBackupName(now, installId, kind);
  await live.backup(join(userDir, name));
  return name;
}

describe("create and list (ADR 89 points 3 and 4)", () => {
  it("openDatabase sets trusted_schema to 0 (H2)", () => {
    expect(live.pragma("trusted_schema", { simple: true })).toBe(0);
  });

  it("copies the live database to a named file, creating the folder, with no .partial left", async () => {
    const info = await store().create(userDir, "manual", INSTALL, NOW);
    expect(info).toMatchObject({ id: "ludiary-20261104T123015123Z-0a1b2c3d-manual.sqlite", kind: "manual", createdAt: NOW, foreign: false });
    expect(info.sizeBytes).toBeGreaterThan(0);
    expect(readdirSync(userDir)).toEqual([info.id]);
    const copy = new Database(join(userDir, info.id), { readonly: true });
    expect(copy.pragma("integrity_check", { simple: true })).toBe("ok");
    expect(copy.prepare("SELECT value FROM settings WHERE key = 'test.marker'").get()).toEqual({ value: '"live"' });
    copy.close();
  });

  it("a copy made while the same connection keeps writing opens and has a consistent state", async () => {
    live.exec("CREATE TABLE IF NOT EXISTS junk (n INTEGER)");
    for (let i = 0; i < 3000; i++) live.prepare("INSERT INTO junk VALUES (?)").run(i);
    const pending = store().create(userDir, "auto", INSTALL, NOW);
    for (let i = 3000; i < 3300; i++) {
      live.prepare("INSERT INTO junk VALUES (?)").run(i);
      if (i % 50 === 0) await new Promise((r) => setImmediate(r));
    }
    const info = await pending;
    const copy = new Database(join(userDir, info.id), { readonly: true });
    expect(copy.pragma("integrity_check", { simple: true })).toBe("ok");
    const n = (copy.prepare("SELECT count(*) AS n FROM junk").get() as { n: number }).n;
    expect(n).toBeGreaterThanOrEqual(3000);
    expect(n).toBeLessThanOrEqual(3300);
    copy.close();
  });

  it("an unreachable folder is backup.folder-unavailable", async () => {
    writeFileSync(join(dir, "afile"), "x");
    await expect(store().create(join(dir, "afile", "sub"), "manual", INSTALL, NOW)).rejects.toMatchObject({ code: "backup.folder-unavailable" });
  });

  it("deletes only its own .partial leftovers (M5): not another install's, not a stranger's", async () => {
    mkdirSync(userDir, { recursive: true });
    const own = `${userBackupName(NOW - 5000, INSTALL, "auto")}.partial`;
    const foreign = `${userBackupName(NOW - 5000, OTHER, "auto")}.partial`;
    for (const f of [own, foreign, "holiday-photos.partial", "ludiary-notes.partial"]) writeFileSync(join(userDir, f), "x");
    await store().create(userDir, "manual", INSTALL, NOW);
    const after = readdirSync(userDir);
    expect(after).not.toContain(own);
    expect(after).toEqual(expect.arrayContaining([foreign, "holiday-photos.partial", "ludiary-notes.partial"]));
    // Partials are never listed.
    expect((await store().list(userDir, INSTALL)).map((c) => c.id).some((id) => id.endsWith(".partial"))).toBe(false);
  });

  it("lists valid names only, newest first, marks other installs, ignores links and directories", async () => {
    mkdirSync(userDir, { recursive: true });
    const a = await seedCopy("auto", INSTALL, NOW - 3000);
    const b = await seedCopy("manual", OTHER, NOW - 1000);
    const c = await seedCopy("manual", INSTALL, NOW - 2000);
    writeFileSync(join(userDir, "notes.sqlite"), "x");
    writeFileSync(join(userDir, "ludiary-20261104T123008123Z-0A1B2C3D-auto.sqlite"), "x"); // upper case: not our format
    mkdirSync(join(userDir, userBackupName(NOW, INSTALL, "auto"))); // a directory with a valid name
    try {
      symlinkSync(join(userDir, a), join(userDir, userBackupName(NOW + 1, INSTALL, "auto")), "file");
    } catch {
      // creating links needs a privilege on Windows; the directory above covers the "not a regular file" rule
    }
    mkdirSync(join(dataDir, "backups"));
    writeFileSync(join(dataDir, "backups", "pre-restore-001793795415123.sqlite"), "x");
    writeFileSync(join(dataDir, "backups", "pre-restore-001793795415123-raw.sqlite"), "x"); // not in the list of point 4
    const list = await store().list(userDir, INSTALL);
    expect(list.map((x) => [x.id, x.foreign])).toEqual([
      ["pre-restore-001793795415123.sqlite", false],
      [b, true],
      [c, false],
      [a, false],
    ]);
    expect(list[0]?.kind).toBe("pre-restore");
  });

  it("a missing folder lists only the internal ones; at most 500 are returned", async () => {
    mkdirSync(join(dataDir, "backups"));
    writeFileSync(join(dataDir, "backups", "pre-migration-001793795415123-0006_collection_source.sqlite"), "x");
    expect((await store().list(join(dir, "nowhere"), INSTALL)).map((c) => c.kind)).toEqual(["pre-migration"]);
    mkdirSync(userDir);
    for (let i = 0; i < 600; i++) writeFileSync(join(userDir, userBackupName(NOW - i * 1000, INSTALL, "auto")), "x");
    const list = await store().list(userDir, INSTALL);
    expect(list).toHaveLength(500);
    expect(list[0]?.createdAt).toBe(NOW);
  });

  it("delete only accepts an own auto copy that is in the listing (M5)", async () => {
    const auto = await seedCopy("auto", INSTALL, NOW - 5000);
    const manual = await seedCopy("manual", INSTALL, NOW - 4000);
    const foreign = await seedCopy("auto", OTHER, NOW - 3000);
    for (const id of [manual, foreign, "..\\x.sqlite", "ludiary-20250101T000000000Z-0a1b2c3d-auto.sqlite", "pre-restore-001793795415123.sqlite"]) {
      await expect(store().delete(userDir, id, INSTALL), id).rejects.toMatchObject({ code: "backup.not-found" });
    }
    expect(existsSync(join(userDir, manual))).toBe(true);
    expect(existsSync(join(userDir, foreign))).toBe(true);
    await store().delete(userDir, auto, INSTALL);
    expect(existsSync(join(userDir, auto))).toBe(false);
  });
});

describe("prepareRestore (ADR 89 point 6.1, 16 H2 M5 M6)", () => {
  it("accepts a good copy, leaves the original alone and writes the pending files", async () => {
    const id = await seedCopy();
    const before = readFileSync(join(userDir, id));
    await store().prepareRestore(userDir, id, NOW);
    expect(readFileSync(join(userDir, id)).equals(before)).toBe(true);
    expect(leftovers().sort()).toEqual(["restore-pending.json", "restore-pending.sqlite"]);
    expect(JSON.parse(readFileSync(join(dataDir, "restore-pending.json"), "utf8"))).toEqual({ phase: "prepared", id, requestedAt: NOW });
    expect(readdirSync(userDir)).toEqual([id]); // no -wal/-shm created next to the original
  });

  it("accepts a copy of every migration level from 0001", async () => {
    mkdirSync(userDir, { recursive: true });
    for (let levels = 1; levels <= MIGRATIONS.length; levels++) {
      const name = userBackupName(NOW + levels, INSTALL, "manual");
      await makeLudiaryDb(join(userDir, name), { levels });
      await expect(store().prepareRestore(userDir, name, NOW), `level ${levels}`).resolves.toBeUndefined();
    }
  });

  async function reject(make: (file: string) => void | Promise<void>, code: string) {
    mkdirSync(userDir, { recursive: true });
    const name = userBackupName(NOW, INSTALL, "manual");
    rmSync(join(userDir, name), { force: true });
    await make(join(userDir, name));
    await expect(store().prepareRestore(userDir, name, NOW)).rejects.toMatchObject({ code });
    expect(leftovers()).toEqual([]); // nothing half-prepared stays behind
  }
  const edit = (fn: (db: Database.Database) => void) => async (file: string) => {
    await makeLudiaryDb(file, {});
    const db = new Database(file);
    try {
      db.pragma("journal_mode = DELETE");
      fn(db);
    } finally {
      db.close();
    }
  };

  it("rejects a file that is not SQLite", () => reject((f) => writeFileSync(f, "this is not a database at all, just text".repeat(10)), "backup.corrupt"));
  it("rejects a truncated copy", () =>
    reject(async (f) => {
      await makeLudiaryDb(f, {});
      const db = new Database(f);
      db.pragma("journal_mode = DELETE");
      db.exec("CREATE TABLE big (x TEXT)");
      for (let i = 0; i < 200; i++) db.prepare("INSERT INTO big VALUES (?)").run("x".repeat(2000));
      db.close();
      truncateSync(f, Math.floor(statSync(f).size / 2));
    }, "backup.corrupt"));
  it("rejects a SQLite file with no schema_migrations", () => reject((f) => void new Database(f).exec("CREATE TABLE t (a); PRAGMA journal_mode = DELETE").close(), "backup.not-ludiary"));
  it("rejects migrations this version does not know", () => reject(edit((db) => db.exec("INSERT INTO schema_migrations VALUES ('9999_future', 'x', 1)")), "backup.too-new"));
  it("rejects a changed hash", () => reject(edit((db) => db.exec("UPDATE schema_migrations SET hash = 'abc' WHERE id = '0002_store_account'")), "backup.not-ludiary"));
  it("rejects a schema_migrations table that is not exactly ours", () =>
    reject(edit((db) => db.exec("DROP TABLE schema_migrations; CREATE TABLE schema_migrations (id TEXT PRIMARY KEY NOT NULL, hash TEXT NOT NULL, applied_at INTEGER NOT NULL, extra TEXT)")), "backup.not-ludiary"));
  it("rejects a valid SQLite file that fails the integrity check", () =>
    reject(async (f) => {
      await makeLudiaryDb(f, {});
      const db = new Database(f);
      db.pragma("journal_mode = DELETE");
      // One transaction: 400 separate commits take over 5 s on the CI disks.
      db.transaction(() => {
        for (let i = 0; i < 400; i++) db.prepare("INSERT INTO settings (user_id, key, value) VALUES (NULL, ?, ?)").run(`k${i}`, "x".repeat(1500));
      })();
      db.close();
      // Zero a page in the middle of the file: the first page (the schema) stays readable.
      const bytes = readFileSync(f);
      bytes.fill(0, Math.floor(bytes.length / 2 / 4096) * 4096, Math.floor(bytes.length / 2 / 4096) * 4096 + 4096);
      writeFileSync(f, bytes);
    }, "backup.corrupt"));
  it("rejects a valid SQLite file with a broken foreign key", () =>
    reject(edit((db) => {
      db.pragma("foreign_keys = OFF");
      db.exec("INSERT INTO devices (id, user_id, name, kind) VALUES ('d9', 'nobody', 'x', 'local')");
    }), "backup.corrupt"));
  it("rejects a gap in the applied migrations", () => reject(edit((db) => db.exec("DELETE FROM schema_migrations WHERE id = '0002_store_account'")), "backup.not-ludiary"));
  it("rejects an extra trigger, view or index (also with names that a LIKE pattern would hide)", async () => {
    const extras = [
      "CREATE TRIGGER evil AFTER INSERT ON users BEGIN SELECT 1; END",
      "CREATE TRIGGER sqliteX AFTER INSERT ON users BEGIN SELECT 1; END",
      "CREATE VIEW sqliteAevil AS SELECT 1",
      "CREATE INDEX extra_idx ON users (created_at)",
    ];
    for (const sql of extras) await reject(edit((db) => db.exec(sql)), "backup.not-ludiary");
    // sqlite_x and SQLITE_x are reserved to SQLite: only reachable by editing sqlite_master directly.
    for (const name of ["sqlite_x", "SQLITE_x", "sqlite_stat9"]) {
      await reject(
        edit((db) => {
          db.unsafeMode(true);
          db.pragma("writable_schema = ON");
          db.prepare("INSERT INTO sqlite_master (type, name, tbl_name, rootpage, sql) VALUES ('trigger', ?, 'users', 0, ?)").run(name, `CREATE TRIGGER ${name} AFTER INSERT ON users BEGIN SELECT 1; END`);
        }),
        "backup.not-ludiary",
      );
    }
  });
  it("accepts the tables sqlite_stat1 to sqlite_stat4 that PRAGMA optimize may create", async () => {
    mkdirSync(userDir, { recursive: true });
    const name = userBackupName(NOW, INSTALL, "manual");
    await makeLudiaryDb(join(userDir, name), {});
    const db = new Database(join(userDir, name));
    db.pragma("journal_mode = DELETE");
    db.exec("ANALYZE");
    expect(db.prepare("SELECT count(*) AS n FROM sqlite_master WHERE name = 'sqlite_stat1'").get()).toEqual({ n: 1 });
    db.close();
    await expect(store().prepareRestore(userDir, name, NOW)).resolves.toBeUndefined();
  });

  it("rejects a file over the limit (simulated) and a valid name that is not there; a link is not opened", async () => {
    const id = await seedCopy();
    await expect(store({ maxRestoreBytes: 1024 }).prepareRestore(userDir, id, NOW)).rejects.toMatchObject({ code: "backup.too-large" });
    expect(leftovers()).toEqual([]);
    await expect(store().prepareRestore(userDir, userBackupName(NOW + 9, INSTALL, "manual"), NOW)).rejects.toMatchObject({ code: "backup.not-found" });
    await expect(store().prepareRestore(userDir, "..\\..\\evil.sqlite", NOW)).rejects.toMatchObject({ code: "backup.not-found" });
    const link = userBackupName(NOW + 1, INSTALL, "manual");
    try {
      symlinkSync(join(userDir, id), join(userDir, link), "file");
      await expect(store().prepareRestore(userDir, link, NOW)).rejects.toMatchObject({ code: "backup.not-found" });
    } catch (e) {
      if ((e as { code?: string }).code !== "EPERM") throw e; // no privilege to create links here
    }
  });

  it("cleans the leftovers of an earlier attempt before starting", async () => {
    const id = await seedCopy();
    for (const f of ["restore-pending.sqlite", "restore-pending.sqlite.partial", "restore-pending.sqlite-wal", "restore-pending.sqlite-shm", "restore-pending.json"]) writeFileSync(join(dataDir, f), "old");
    await store().prepareRestore(userDir, id, NOW);
    expect(leftovers().sort()).toEqual(["restore-pending.json", "restore-pending.sqlite"]);
    expect(readFileSync(join(dataDir, "restore-pending.sqlite")).subarray(0, 15).toString()).toBe("SQLite format 3");
  });

  it("an internal pre-restore copy can be restored too", async () => {
    mkdirSync(join(dataDir, "backups"));
    copyFileSync(join(dataDir, "ludiary.db"), join(dataDir, "backups", "pre-restore-001793795415123.sqlite"));
    live.pragma("wal_checkpoint(TRUNCATE)");
    await expect(store().prepareRestore(userDir, "pre-restore-001793795415123.sqlite", NOW)).resolves.toBeUndefined();
  });
});
