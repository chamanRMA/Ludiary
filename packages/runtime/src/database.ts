import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import Database from "better-sqlite3";

/** Native addon object loaded by the composition root (process.dlopen), see better-sqlite3 13 `nativeBinding`. */
export type SqliteAddon = object;

export function openDatabase(file: string, addon: SqliteAddon | undefined): Database.Database {
  mkdirSync(dirname(file), { recursive: true });
  // The @types package predates the `nativeBinding: object` form of v13.
  const options = addon ? ({ nativeBinding: addon } as unknown as Database.Options) : undefined;
  const db = new Database(file, options);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  return db;
}

/** Read-only status for the real database: no prototype tables in the user's file. */
export function readDatabaseStatus(db: Database.Database): { sqliteVersion: string; journalMode: string } {
  return {
    sqliteVersion: (db.prepare("SELECT sqlite_version() AS v").get() as { v: string }).v,
    journalMode: String(db.pragma("journal_mode", { simple: true })),
  };
}

export interface SqliteProbeResult {
  sqliteVersion: string;
  journalMode: string;
  foreignKeys: boolean;
  startCount: number;
}

/** Writes and reads one row; proves the packaged executable can use the database. Only for --selftest's throw-away file. */
export function probeDatabase(db: Database.Database): SqliteProbeResult {
  db.exec("CREATE TABLE IF NOT EXISTS prototype_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
  const bump = db.transaction(() => {
    const row = db.prepare("SELECT value FROM prototype_meta WHERE key = 'start_count'").get() as
      | { value: string }
      | undefined;
    const next = (row ? Number(row.value) : 0) + 1;
    db.prepare("INSERT INTO prototype_meta (key, value) VALUES ('start_count', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(
      String(next),
    );
    return next;
  });
  const startCount = bump();
  return {
    sqliteVersion: (db.prepare("SELECT sqlite_version() AS v").get() as { v: string }).v,
    journalMode: String(db.pragma("journal_mode", { simple: true })),
    foreignKeys: db.pragma("foreign_keys", { simple: true }) === 1,
    startCount,
  };
}
