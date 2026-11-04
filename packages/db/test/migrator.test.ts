import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DatabaseTooNewError, ForeignKeyViolationError, MIGRATIONS, MigrationMismatchError, migrate, openDatabase, type EmbeddedMigration } from "../src";

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
    expect(res).toEqual({ applied: ["0001_library_scan", "0002_store_account", "0003_recheck_steam_media", "0004_dlc", "0005_user_data", "0006_collection_source", "0007_prices", "0008_watch_media"], backupFile: null });
    expect(existsSync(backupDir())).toBe(false);
    expect(tables()).toEqual(["canonical_games", "collection_games", "collections", "devices", "game_properties", "game_tags", "installations", "price_links", "price_snapshots", "price_watch", "scan_roots", "schema_migrations", "secrets", "settings", "store_connections", "sync_state", "tags", "user_game_data", "users"]);
    expect(db.prepare("SELECT id, hash FROM schema_migrations").all()).toEqual([
      { id: "0001_library_scan", hash: expect.stringMatching(/^[0-9a-f]{64}$/) },
      { id: "0002_store_account", hash: expect.stringMatching(/^[0-9a-f]{64}$/) },
      { id: "0003_recheck_steam_media", hash: expect.stringMatching(/^[0-9a-f]{64}$/) },
      { id: "0004_dlc", hash: expect.stringMatching(/^[0-9a-f]{64}$/) },
      { id: "0005_user_data", hash: expect.stringMatching(/^[0-9a-f]{64}$/) },
      { id: "0006_collection_source", hash: expect.stringMatching(/^[0-9a-f]{64}$/) },
      { id: "0007_prices", hash: expect.stringMatching(/^[0-9a-f]{64}$/) },
      { id: "0008_watch_media", hash: expect.stringMatching(/^[0-9a-f]{64}$/) },
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

  // ADR 85 point 12: with foreign_keys ON, rebuilding canonical_games (DROP TABLE) would cascade over game_tags.
  const REBUILD: EmbeddedMigration = {
    id: "0099_rebuild_canonical",
    statements: [
      "CREATE TABLE __new_canonical_games (id text PRIMARY KEY NOT NULL, user_id text NOT NULL, title text NOT NULL, normalized_title text NOT NULL, media text, metadata_source text, created_at integer NOT NULL, updated_at integer NOT NULL, extra text, FOREIGN KEY (user_id) REFERENCES users(id))",
      "INSERT INTO __new_canonical_games (id, user_id, title, normalized_title, media, metadata_source, created_at, updated_at) SELECT id, user_id, title, normalized_title, media, metadata_source, created_at, updated_at FROM canonical_games",
      "DROP TABLE canonical_games",
      "ALTER TABLE __new_canonical_games RENAME TO canonical_games",
    ],
  };
  const seedUserData = async () => {
    await migrate(db, { backupDir: backupDir() });
    db.exec("INSERT INTO users (id, created_at) VALUES ('u', 1)");
    db.exec("INSERT INTO canonical_games (id, user_id, title, normalized_title, created_at, updated_at) VALUES ('c', 'u', 'T', 't', 1, 1)");
    db.exec("INSERT INTO tags (id, user_id, name, name_key, created_at) VALUES ('t', 'u', 'x', 'x', 1)");
    db.exec("INSERT INTO game_tags (canonical_game_id, tag_id, user_id) VALUES ('c', 't', 'u')");
  };

  it("a migration that rebuilds canonical_games keeps the rows that reference it, and foreign keys are back on", async () => {
    await seedUserData();
    const res = await migrate(db, { backupDir: backupDir(), migrations: [...MIGRATIONS, REBUILD] });
    expect(res.applied).toEqual(["0099_rebuild_canonical"]);
    expect(db.prepare("SELECT canonical_game_id AS c FROM game_tags").all()).toEqual([{ c: "c" }]);
    expect(db.pragma("foreign_keys", { simple: true })).toBe(1);
  });

  it("rolls back a migration that leaves a broken foreign key, fails visibly and turns foreign keys back on", async () => {
    await seedUserData();
    const bad: EmbeddedMigration = { id: "0099_bad", statements: ["DELETE FROM canonical_games"] };
    await expect(migrate(db, { backupDir: backupDir(), migrations: [...MIGRATIONS, bad] })).rejects.toBeInstanceOf(ForeignKeyViolationError);
    expect(db.prepare("SELECT id FROM canonical_games").all()).toEqual([{ id: "c" }]);
    expect(db.prepare("SELECT id FROM schema_migrations WHERE id = '0099_bad'").all()).toEqual([]);
    expect(db.pragma("foreign_keys", { simple: true })).toBe(1);
  });
});
