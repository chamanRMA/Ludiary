// The copy taken before an update is applied (ADR 90 point 7.2 and point 18, A1/M7). It is named like a pre-migration copy
// (`pre-migration-<timestamp>-update_<from>_to_<to>.sqlite`), so the list of copies (ADR 89), the restore check and the single
// prune of three (ADR 57) cover it with no new kind. Flagged for the architect: the ADR text proposes `pre-update-` names.
import { existsSync, mkdirSync, readdirSync, renameSync, rmSync } from "node:fs";
import { join } from "node:path";
import { openDatabase, type SqliteAddon } from "./database";
import { BACKUP_PREFIX, pruneBackups } from "./migrator";

const VERSION = /^\d+\.\d+\.\d+$/;
const idOf = (from: string, to: string) => `update_${from.replaceAll(".", "_")}_to_${to.replaceAll(".", "_")}`;

/** Newest copy for the pair, or null. */
export function findUpdateCopy(backupDir: string, from: string, to: string): string | null {
  if (!VERSION.test(from) || !VERSION.test(to) || !existsSync(backupDir)) return null;
  const suffix = `-${idOf(from, to)}.sqlite`;
  const found = readdirSync(backupDir)
    .filter((f) => f.startsWith(BACKUP_PREFIX) && f.endsWith(suffix) && /^\d{15}$/.test(f.slice(BACKUP_PREFIX.length, BACKUP_PREFIX.length + 15)))
    .sort();
  return found.at(-1) ?? null;
}

/**
 * Online copy of the database with db.backup(). `reuse` (an installation of this very pair was started and never confirmed)
 * keeps an existing copy instead of taking a newer one: the newer one would already hold migrated data (A1).
 * Returns the file name; null when there is no database yet (nothing to protect). Throws if the copy cannot be made.
 */
export async function createUpdateCopy(o: { dataDir: string; addon: SqliteAddon | undefined; from: string; to: string; now: number; reuse: boolean }): Promise<string | null> {
  const backupDir = join(o.dataDir, "backups");
  const dbFile = join(o.dataDir, "ludiary.db");
  if (!VERSION.test(o.from) || !VERSION.test(o.to)) throw new Error("invalid version");
  if (o.reuse) {
    const existing = findUpdateCopy(backupDir, o.from, o.to);
    if (existing) return existing;
  }
  if (!existsSync(dbFile)) return null;
  const name = `${BACKUP_PREFIX}${String(o.now).padStart(15, "0")}-${idOf(o.from, o.to)}.sqlite`;
  if (!/^pre-migration-\d{15}-[0-9a-z_]{1,64}\.sqlite$/.test(name)) throw new Error("copy name out of range");
  mkdirSync(backupDir, { recursive: true });
  const db = openDatabase(dbFile, o.addon);
  try {
    await db.backup(join(backupDir, `${name}.partial`));
    renameSync(join(backupDir, `${name}.partial`), join(backupDir, name));
  } catch (e) {
    rmSync(join(backupDir, `${name}.partial`), { force: true });
    throw e;
  } finally {
    db.close();
  }
  pruneBackups(backupDir, 3);
  return name;
}
