// Restoration at startup (ADR 89 point 6.3 and 6.4): a state machine driven by restore-pending.json. Every phase change
// is written with a temporary file and a rename, and every step can be repeated without harm. `server-role.ts` calls
// the pieces in order; none of them decides what to do next.
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type Database from "better-sqlite3";
import { openDatabase, type SqliteAddon } from "./database";
import { parseBackupName, PENDING_JSON, PENDING_SQLITE, removePending } from "./backup-store";

export type RestorePhase = "prepared" | "swapped" | "adjusted" | "rolling-back";

/** What is carried over from the database being replaced (point 6.3 A). Absent value: the restored copy's one is removed. */
export interface KeptValues {
  periodic?: boolean;
  folder?: string;
  installId?: string;
  nextAllowedAt: { store: string; operation: string; at: number }[];
  /** pathKey of the user scan folders that are enabled in the database being replaced (point 16, H1). */
  activeUserRoots: string[];
}

export interface PendingRestore {
  phase: RestorePhase;
  id: string;
  requestedAt: number;
  /** File name (or `-raw` folder) in the internal folder of the copy made in step A. null: there was no database. */
  preRestore?: string | null;
  kept?: KeptValues;
  disabledRoots?: number;
}

/** Step B failed after the `swapped` phase was written: the caller needs that state to roll back. */
export class SwapError extends Error {
  constructor(
    readonly state: PendingRestore,
    cause: unknown,
  ) {
    super("restoration swap failed", { cause });
  }
}

export type PendingRead = { kind: "none" } | { kind: "dropped"; id: string } | { kind: "pending"; state: PendingRestore };

const DB_FILE = "ludiary.db";
const PHASES: readonly string[] = ["prepared", "swapped", "adjusted", "rolling-back"];
const K = { periodic: "backups.periodic", folder: "backups.folder", installId: "backups.installId", restoredAt: "backups.restoredAt" } as const;

export const preRestoreName = (now: number, origin: boolean): string => `pre-restore-${String(now).padStart(15, "0")}${origin ? "-origin" : ""}.sqlite`;

function writeState(dataDir: string, state: PendingRestore): void {
  const tmp = join(dataDir, `${PENDING_JSON}.tmp`);
  writeFileSync(tmp, JSON.stringify(state));
  renameSync(tmp, join(dataDir, PENDING_JSON));
}

/** BK2: a virus scanner may hold the file for a moment. */
function renameWithRetries(from: string, to: string): void {
  for (let attempt = 0; ; attempt++) {
    try {
      renameSync(from, to);
      return;
    } catch (e) {
      if (attempt >= 2) throw e;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 200);
    }
  }
}

/**
 * The `.json` decides. Leftovers without it are deleted; a `prepared` without its `.sqlite` is dropped (`dropped`);
 * an unreadable `.json` counts as absent (it is only ever replaced by a rename, so this is not a half-written file).
 */
export function readPendingRestore(dataDir: string): PendingRead {
  const jsonPath = join(dataDir, PENDING_JSON);
  let state: PendingRestore | null = null;
  try {
    const parsed = JSON.parse(readFileSync(jsonPath, "utf8")) as Partial<PendingRestore>;
    if (typeof parsed.id === "string" && typeof parsed.requestedAt === "number" && typeof parsed.phase === "string" && PHASES.includes(parsed.phase)) state = parsed as PendingRestore;
  } catch {
    // absent or unreadable
  }
  if (!state) {
    removePending(dataDir);
    return { kind: "none" };
  }
  if (state.phase === "prepared" && !existsSync(join(dataDir, PENDING_SQLITE))) {
    removePending(dataDir);
    return { kind: "dropped", id: state.id };
  }
  return { kind: "pending", state };
}

const readSetting = (db: Database.Database, key: string): unknown => {
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value: string | null } | undefined;
  try {
    return row?.value == null ? undefined : JSON.parse(row.value);
  } catch {
    return undefined;
  }
};

function readKept(db: Database.Database): { kept: KeptValues; chained: boolean } {
  const periodic = readSetting(db, K.periodic);
  const folder = readSetting(db, K.folder);
  const installId = readSetting(db, K.installId);
  const rows = db.prepare("SELECT store, operation, next_allowed_at AS at FROM sync_state WHERE next_allowed_at IS NOT NULL").all() as KeptValues["nextAllowedAt"];
  const roots = db.prepare("SELECT path_key AS k FROM scan_roots WHERE origin = 'user' AND enabled = 1").all() as { k: string }[];
  return {
    kept: {
      ...(typeof periodic === "boolean" ? { periodic } : {}),
      ...(typeof folder === "string" ? { folder } : {}),
      ...(typeof installId === "string" ? { installId } : {}),
      nextAllowedAt: rows,
      activeUserRoots: roots.map((r) => r.k),
    },
    chained: readSetting(db, K.restoredAt) !== undefined,
  };
}

/** Step B, repeatable: wal/shm out of the way, then the restored file over the database. */
function swapFiles(dataDir: string): void {
  for (const f of [`${DB_FILE}-wal`, `${DB_FILE}-shm`, `${PENDING_SQLITE}-wal`, `${PENDING_SQLITE}-shm`]) rmSync(join(dataDir, f), { force: true });
  if (existsSync(join(dataDir, PENDING_SQLITE))) renameWithRetries(join(dataDir, PENDING_SQLITE), join(dataDir, DB_FILE));
}

/**
 * Steps A and B (phases `prepared` and `swapped`). Returns the `swapped` state, or `null` when no copy of the current
 * data could be made at all (the restoration is dropped and the current database stays untouched).
 */
export async function applyPendingRestoreSwap(
  dataDir: string,
  addon: SqliteAddon | undefined,
  state: PendingRestore,
  now: number,
  log: (msg: string) => void = () => {},
): Promise<PendingRestore | null> {
  if (state.phase !== "prepared") {
    if (state.phase === "swapped") swapFiles(dataDir);
    return state;
  }
  const backupDir = join(dataDir, "backups");
  const dbFile = join(dataDir, DB_FILE);
  let kept: KeptValues = { nextAllowedAt: [], activeUserRoots: [] };
  let preRestore: string | null = null;
  if (existsSync(dbFile)) {
    let db: Database.Database | null = null;
    try {
      db = openDatabase(dbFile, addon);
      const read = readKept(db);
      const name = preRestoreName(now, !read.chained);
      mkdirSync(backupDir, { recursive: true });
      await db.backup(join(backupDir, `${name}.partial`));
      renameSync(join(backupDir, `${name}.partial`), join(backupDir, name));
      kept = read.kept;
      preRestore = name;
      db.close(); // SQLite folds the WAL into the file
      db = null;
    } catch {
      // M3: the current database is unreadable. Move it without opening it and go on with default values.
      try {
        db?.close();
      } catch {
        // already unusable
      }
      const raw = `pre-restore-${String(now).padStart(15, "0")}-raw`;
      try {
        mkdirSync(join(backupDir, raw), { recursive: true });
        for (const f of [DB_FILE, `${DB_FILE}-wal`, `${DB_FILE}-shm`]) if (existsSync(join(dataDir, f))) renameSync(join(dataDir, f), join(backupDir, raw, f));
        kept = { nextAllowedAt: [], activeUserRoots: [] };
        preRestore = raw;
        log("current database unreadable; moved aside");
      } catch {
        removePending(dataDir);
        return null;
      }
    }
  }
  const swapped: PendingRestore = { phase: "swapped", id: state.id, requestedAt: state.requestedAt, preRestore, kept };
  writeState(dataDir, swapped);
  try {
    swapFiles(dataDir);
  } catch (e) {
    throw new SwapError(swapped, e);
  }
  return swapped;
}

/** Step C. One idempotent transaction on the migrated, restored database. Returns how many user folders it switched off. */
export function applyRestoreAdjustments(db: Database.Database, kept: KeptValues, now: number): number {
  return db.transaction(() => {
    db.prepare("DELETE FROM installations").run();
    db.prepare("DELETE FROM scan_roots WHERE origin = 'discovered'").run();
    // H1 (hardened): a user folder stays on only if the same path is on in the database being replaced.
    const active = new Set(kept.activeUserRoots);
    let disabled = 0;
    for (const r of db.prepare("SELECT id, path_key AS k FROM scan_roots WHERE origin = 'user' AND enabled = 1").all() as { id: string; k: string }[]) {
      if (active.has(r.k)) continue;
      db.prepare("UPDATE scan_roots SET enabled = 0 WHERE id = ?").run(r.id);
      disabled++;
    }
    db.prepare("UPDATE sync_state SET next_allowed_at = NULL").run();
    for (const k of kept.nextAllowedAt) db.prepare("UPDATE sync_state SET next_allowed_at = ? WHERE store = ? AND operation = ?").run(k.at, k.store, k.operation);
    const user = (db.prepare("SELECT id FROM users LIMIT 1").get() as { id: string } | undefined)?.id;
    if (user !== undefined) {
      const put = (key: string, value: unknown) => {
        if (value === undefined) db.prepare("DELETE FROM settings WHERE user_id = ? AND key = ?").run(user, key);
        else db.prepare("INSERT INTO settings (user_id, key, value) VALUES (?, ?, ?) ON CONFLICT (user_id, key) DO UPDATE SET value = excluded.value").run(user, key, JSON.stringify(value));
      };
      put(K.periodic, kept.periodic);
      put(K.folder, kept.folder);
      put(K.installId, kept.installId);
      put(K.restoredAt, now);
    }
    return disabled;
  })();
}

/** Writes the `adjusted` phase. */
export function markAdjusted(dataDir: string, state: PendingRestore, disabledRoots: number): PendingRestore {
  const next: PendingRestore = { ...state, phase: "adjusted", disabledRoots };
  writeState(dataDir, next);
  return next;
}

/** Closes the chain: the copies of point 6.3 "Final" are pruned and the `.json` goes. */
export function finishRestore(dataDir: string): void {
  const dir = join(dataDir, "backups");
  const all = (existsSync(dir) ? readdirSync(dir) : []).filter((f) => /^pre-restore-\d{15}(-origin)?\.sqlite$/.test(f)).sort();
  const origin = all.filter((f) => f.endsWith("-origin.sqlite")).pop();
  const keep = new Set([...all.filter((f) => !f.endsWith("-origin.sqlite")).slice(-3), ...(origin ? [origin] : [])]);
  for (const f of all) if (!keep.has(f) && parseBackupName(f)) rmSync(join(dir, f), { force: true });
  rmSync(join(dataDir, PENDING_JSON), { force: true });
}

/** Step D. Throws if it cannot put the previous data back; the phase stays `rolling-back` for the next start. */
export function rollBackRestore(dataDir: string, state: PendingRestore): void {
  if (state.preRestore === undefined) {
    // Step A never finished: the current database was not replaced, only the pending files go.
    removePending(dataDir);
    return;
  }
  writeState(dataDir, { ...state, phase: "rolling-back" });
  for (const f of [`${DB_FILE}-wal`, `${DB_FILE}-shm`]) rmSync(join(dataDir, f), { force: true });
  if (state.preRestore) {
    const from = join(dataDir, "backups", state.preRestore);
    if (state.preRestore.endsWith("-raw")) {
      rmSync(join(dataDir, DB_FILE), { force: true });
      for (const f of readdirSync(from)) renameWithRetries(join(from, f), join(dataDir, f));
    } else {
      // The copy stays in place; the database is rebuilt from a private copy of it.
      const partial = join(dataDir, `${DB_FILE}.partial`);
      writeFileSync(partial, readFileSync(from));
      renameWithRetries(partial, join(dataDir, DB_FILE));
    }
  } else {
    rmSync(join(dataDir, DB_FILE), { force: true }); // there was no database before
  }
  removePending(dataDir);
  rmSync(join(dataDir, PENDING_JSON), { force: true });
}
