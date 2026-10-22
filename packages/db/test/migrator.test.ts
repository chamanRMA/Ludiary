import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DatabaseTooNewError, MIGRATIONS, MigrationMismatchError, migrate, openDatabase, type EmbeddedMigration } from "../src";

let dir = "";
let db: Database.Database;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "ludiary-db-"));
  db = openDatabase(join(dir, "ludiary.sqlite"), undefined);
});
afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

const backupDir = () => join(dir, "backups");
const tables = () => (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all() as { name: string }[]).map((r) => r.name);
const m = (n: number, sql = `CREATE TABLE t${n} (id INTEGER)`): EmbeddedMigration => ({ id: `${String(n).padStart(4, "0")}_t${n}`, statements: [sql] });

describe("embedded migrations", () => {
  it("match the SQL that drizzle-kit generated (run scripts/embed-migrations.mjs after generating)", () => {
    const root = join(import.meta.dirname, "..");
    const journal = JSON.parse(readFileSync(join(root, "drizzle/meta/_journal.json"), "utf8")) as { entries: { idx: number; tag: string }[] };
    expect(journal.entries.length).toBe(MIGRATIONS.length);
    journal.entries.forEach((e, i) => {
      const sql = readFileSync(join(root, "drizzle", `${e.tag}.sql`), "utf8").replace(/\r\n/g, "\n");
      const statements = sql.split("--> statement-breakpoint").map((s) => s.trim()).filter(Boolean);
      expect(MIGRATIONS[i]!.statements).toEqual(statements);
      expect(MIGRATIONS[i]!.id).toBe(`${String(e.idx + 1).padStart(4, "0")}${e.tag.slice(4)}`);
    });
    expect(MIGRATIONS[0]!.id).toBe("0001_library_scan");
  });
});

describe("migrate", () => {
  it("builds the schema from an empty database without a safety copy", async () => {
    const res = await migrate(db, { backupDir: backupDir() });
    expect(res).toEqual({ applied: ["0001_library_scan", "0002_store_account", "0003_recheck_steam_media"], backupFile: null });
    expect(existsSync(backupDir())).toBe(false);
    expect(tables()).toEqual(["canonical_games", "devices", "game_properties", "installations", "scan_roots", "schema_migrations", "secrets", "settings", "store_connections", "sync_state", "users"]);
    expect(db.prepare("SELECT id, hash FROM schema_migrations").all()).toEqual([
      { id: "0001_library_scan", hash: expect.stringMatching(/^[0-9a-f]{64}$/) },
      { id: "0002_store_account", hash: expect.stringMatching(/^[0-9a-f]{64}$/) },
      { id: "0003_recheck_steam_media", hash: expect.stringMatching(/^[0-9a-f]{64}$/) },
    ]);
  });

  it("does nothing when repeated", async () => {
    await migrate(db, { backupDir: backupDir() });
    const again = await migrate(db, { backupDir: backupDir() });
    expect(again).toEqual({ applied: [], backupFile: null });
    expect(existsSync(backupDir())).toBe(false);
  });

  it("every data table has user_id, with foreign keys and the unique indexes of ADR 72", async () => {
    await migrate(db, { backupDir: backupDir() });
    for (const t of tables().filter((n) => !["users", "schema_migrations"].includes(n))) {
      const cols = (db.prepare(`PRAGMA table_info(${t})`).all() as { name: string }[]).map((c) => c.name);
      expect(cols, t).toContain("user_id");
    }
    const fk = (t: string) => (db.prepare(`PRAGMA foreign_key_list(${t})`).all() as { table: string }[]).map((r) => r.table).sort();
    expect(fk("installations")).toEqual(["devices", "game_properties", "users"]);
    expect(fk("game_properties")).toEqual(["canonical_games", "users"]);
    const unique = (t: string) =>
      (db.prepare(`PRAGMA index_list(${t})`).all() as { name: string; unique: number }[])
        .filter((i) => i.unique && i.name.startsWith(t) )
        .map((i) => (db.prepare(`PRAGMA index_info(${i.name})`).all() as { name: string }[]).map((c) => c.name));
    expect(unique("game_properties")).toContainEqual(["user_id", "store", "store_game_id"]);
    expect(unique("installations")).toContainEqual(["property_id", "device_id"]);
    expect(unique("scan_roots")).toContainEqual(["user_id", "device_id", "origin", "path_key"]);
    const idx = db.prepare("PRAGMA index_list(canonical_games)").all() as { name: string }[];
    expect(idx.map((i) => (db.prepare(`PRAGMA index_info(${i.name})`).all() as { name: string }[]).map((c) => c.name))).toContainEqual(["user_id", "normalized_title"]);
  });

  it("copies the database first when migrations are already applied and a new one is pending", async () => {
    await migrate(db, { backupDir: backupDir(), migrations: [m(1)] });
    db.exec("INSERT INTO t1 (id) VALUES (42)");
    const res = await migrate(db, { backupDir: backupDir(), migrations: [m(1), m(2)], now: () => 1000 });
    expect(res.applied).toEqual(["0002_t2"]);
    expect(res.backupFile).not.toBeNull();
    const copy = new Database(res.backupFile!, { readonly: true });
    expect(copy.prepare("SELECT id FROM t1").all()).toEqual([{ id: 42 }]);
    expect(copy.prepare("SELECT name FROM sqlite_master WHERE name = 't2'").all()).toEqual([]); // taken before the change
    copy.close();
  });

  it("keeps the 3 most recent copies", async () => {
    const all: EmbeddedMigration[] = [];
    let t = 0;
    for (let n = 1; n <= 6; n++) {
      all.push(m(n));
      t = n * 1000;
      await migrate(db, { backupDir: backupDir(), migrations: [...all], now: () => t });
    }
    const files = readdirSync(backupDir()).sort();
    expect(files).toHaveLength(3);
    // Copies were taken before migrations 2..6, at 2000..6000: the oldest two are gone.
    expect(files[0]).toContain("000000000004000");
    expect(files[2]).toContain("000000000006000");
  });

  it("rejects a database with migrations this version does not know, touching nothing", async () => {
    await migrate(db, { backupDir: backupDir(), migrations: [m(1), m(2)] });
    await expect(migrate(db, { backupDir: backupDir(), migrations: [m(1)] })).rejects.toMatchObject({
      name: "DatabaseTooNewError",
      code: "db-too-new",
      unknownMigrations: ["0002_t2"],
    });
    await expect(migrate(db, { backupDir: backupDir(), migrations: [m(1)] })).rejects.toBeInstanceOf(DatabaseTooNewError);
    expect(existsSync(backupDir())).toBe(false);
  });

  it("rejects an applied migration whose SQL changed", async () => {
    await migrate(db, { backupDir: backupDir(), migrations: [m(1)] });
    await expect(migrate(db, { backupDir: backupDir(), migrations: [m(1, "CREATE TABLE t1 (id TEXT)")] })).rejects.toBeInstanceOf(MigrationMismatchError);
  });

  it("rolls back a migration that fails halfway and does not record it", async () => {
    await migrate(db, { backupDir: backupDir(), migrations: [m(1)] });
    const broken: EmbeddedMigration = { id: "0002_broken", statements: ["CREATE TABLE half (id INTEGER)", "THIS IS NOT SQL"] };
    await expect(migrate(db, { backupDir: backupDir(), migrations: [m(1), broken] })).rejects.toThrow();
    expect(tables()).not.toContain("half");
    expect(db.prepare("SELECT id FROM schema_migrations").all()).toEqual([{ id: "0001_t1" }]);
    expect(readdirSync(backupDir())).toHaveLength(1); // the safety copy was made before trying
  });
});
