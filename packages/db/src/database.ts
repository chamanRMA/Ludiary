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
  try {
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
    db.pragma("trusted_schema = OFF"); // ADR 89 point 16, H2: a view or trigger of a restored file never runs code of its own
  } catch (e) {
    db.close(); // a file that is not a database must not stay open (Windows would refuse to move it)
    throw e;
  }
  return db;
}
