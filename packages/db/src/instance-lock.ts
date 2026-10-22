import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import Database from "better-sqlite3";
import type { InstanceLock } from "@ludiary/contracts";
import type { SqliteAddon } from "./database";

const isBusy = (e: unknown) => (e as { code?: string }).code === "SQLITE_BUSY";

/**
 * InstanceLock on top of SQLite (ADR 62): an EXCLUSIVE transaction that is never committed. The lock is an OS file lock,
 * so Windows releases it when the process dies, and the file lives in the user's own data folder (unlike a named pipe,
 * whose namespace is shared by every user of the machine).
 */
export function createSqliteInstanceLock(file: string, addon: SqliteAddon | undefined): InstanceLock {
  mkdirSync(dirname(file), { recursive: true });
  const open = (timeout: number) =>
    new Database(file, { timeout, ...(addon ? { nativeBinding: addon } : {}) } as unknown as Database.Options);

  return {
    async acquire() {
      const db = open(2000); // waits out a concurrent isHeld() probe
      try {
        db.exec("BEGIN EXCLUSIVE");
      } catch (e) {
        db.close();
        if (isBusy(e)) return null;
        throw e;
      }
      return () => {
        try {
          db.exec("ROLLBACK");
        } finally {
          db.close();
        }
      };
    },

    async isHeld() {
      let db: Database.Database | null = null;
      try {
        db = open(0);
        db.exec("BEGIN EXCLUSIVE");
        db.exec("ROLLBACK");
        return false;
      } catch (e) {
        if (isBusy(e)) return true;
        throw e;
      } finally {
        db?.close();
      }
    },
  };
}
