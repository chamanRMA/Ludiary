// BackupStore (ADR 89): online copies of the live database and the validated preparation of a restoration.
// Paths never come from the API: ids are file names that must validate AND appear in the folder listing.
import { closeSync, createReadStream, createWriteStream, lstatSync, mkdirSync, openSync, readdirSync, readSync, renameSync, rmSync, writeSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import Database from "better-sqlite3";
import { backupError, CoreError, type BackupInfo, type BackupKind, type BackupStore } from "@ludiary/core";
import type { SqliteAddon } from "./database";
import { MIGRATIONS, type EmbeddedMigration } from "./migrations.generated";
import { hashMigration, SCHEMA_MIGRATIONS_DDL } from "./migrator";

export const MAX_RESTORE_BYTES = 512 * 1024 * 1024;
const MAX_LISTED = 500;
export const PENDING_SQLITE = "restore-pending.sqlite";
export const PENDING_JSON = "restore-pending.json";
const SQLITE_MAGIC = Buffer.from("SQLite format 3\0", "latin1");

const USER_NAME = /^ludiary-(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(\d{3})Z-([0-9a-f]{8})-(auto|manual)\.sqlite$/;
const MIGRATION_NAME = /^pre-migration-(\d{15})-[0-9a-z_]{1,64}\.sqlite$/;
const RESTORE_NAME = /^pre-restore-(\d{15})(-origin)?\.sqlite$/;

interface ParsedName {
  kind: BackupKind;
  createdAt: number;
  installId: string | null;
}

/** null if the name is not one of the three formats of ADR 89 point 4. */
export function parseBackupName(name: string): ParsedName | null {
  let m = USER_NAME.exec(name);
  if (m) {
    const [y, mo, d, h, mi, s, ms] = m.slice(1, 8).map(Number) as [number, number, number, number, number, number, number];
    return { kind: m[9] as "auto" | "manual", createdAt: Date.UTC(y, mo - 1, d, h, mi, s, ms), installId: m[8]! };
  }
  m = MIGRATION_NAME.exec(name);
  if (m) return { kind: "pre-migration", createdAt: Number(m[1]), installId: null };
  m = RESTORE_NAME.exec(name);
  if (m) return { kind: "pre-restore", createdAt: Number(m[1]), installId: null };
  return null;
}

export const userBackupName = (now: number, installId: string, kind: "auto" | "manual"): string =>
  `ludiary-${new Date(now).toISOString().replace(/[-:.]/g, "")}-${installId}-${kind}.sqlite`;

/** A regular file, not a link or junction (lstat does not follow them). */
function regularSize(path: string): number | null {
  try {
    const st = lstatSync(path);
    return st.isFile() && !st.isSymbolicLink() ? st.size : null;
  } catch {
    return null;
  }
}

function names(dir: string | null): string[] {
  if (dir === null) return [];
  try {
    return readdirSync(dir);
  } catch {
    return [];
  }
}

export interface BackupStoreOptions {
  /** The live connection of the server: `db.backup()` runs on it (ADR 89 point 3). */
  db: Database.Database;
  /** %LOCALAPPDATA%\Ludiary: restore-pending.* live here. */
  dataDir: string;
  /** %LOCALAPPDATA%\Ludiary\backups. */
  internalDir: string;
  addon: SqliteAddon | undefined;
  /** Test seams. */
  migrations?: readonly EmbeddedMigration[];
  maxRestoreBytes?: number;
}

/** Opens a database file for reading only, hardened (ADR 89 point 6.1, step 3). */
function openReadonly(file: string, addon: SqliteAddon | undefined): Database.Database {
  const options = { readonly: true, fileMustExist: true, ...(addon ? { nativeBinding: addon } : {}) } as unknown as Database.Options;
  const db = new Database(file, options);
  db.pragma("trusted_schema = OFF");
  db.pragma("cell_size_check = ON");
  db.pragma("mmap_size = 0");
  return db;
}

type SchemaRow = { type: string; name: string; tbl_name: string; sql: string | null };
const STAT_TABLE = /^sqlite_stat[1-4]$/;
const rowKey = (r: SchemaRow) => JSON.stringify([r.type, r.name, r.tbl_name, r.sql]);

/**
 * Schema first, before reading any user data (ADR 89 point 6.1, step 4). Exact comparison of `sqlite_master` with a
 * reference built in memory from the embedded migrations; no pattern excludes anything, only the exact names sqlite_stat1..4.
 */
function checkSchema(db: Database.Database, addon: SqliteAddon | undefined, migrations: readonly EmbeddedMigration[]): void {
  const rows = db.prepare("SELECT type, name, tbl_name, sql FROM sqlite_master").all() as SchemaRow[];
  const control = rows.find((r) => r.type === "table" && r.name === "schema_migrations");
  if (!control) throw backupError("backup.not-ludiary");
  let applied: { id: string; hash: string }[];
  try {
    applied = db.prepare("SELECT id, hash FROM schema_migrations ORDER BY id").all() as { id: string; hash: string }[];
  } catch {
    throw backupError("backup.not-ludiary");
  }
  const known = new Map(migrations.map((m) => [m.id, m]));
  if (applied.some((a) => !known.has(a.id))) throw backupError("backup.too-new");
  const prefix = migrations.slice(0, applied.length);
  if (applied.length === 0 || applied.some((a, i) => a.id !== prefix[i]!.id || a.hash !== hashMigration(prefix[i]!))) throw backupError("backup.not-ludiary");

  const options = addon ? ({ nativeBinding: addon } as unknown as Database.Options) : undefined;
  const reference = new Database(":memory:", options);
  try {
    reference.pragma("foreign_keys = OFF");
    reference.exec(SCHEMA_MIGRATIONS_DDL);
    for (const m of prefix) for (const s of m.statements) reference.exec(s);
    const expected = (reference.prepare("SELECT type, name, tbl_name, sql FROM sqlite_master").all() as SchemaRow[]).map(rowKey).sort();
    const actual = rows.filter((r) => !(r.type === "table" && STAT_TABLE.test(r.name))).map(rowKey).sort();
    if (expected.length !== actual.length || expected.some((k, i) => k !== actual[i])) throw backupError("backup.not-ludiary");
  } finally {
    reference.close();
  }
}

/** Copies `source` to `target`, cutting when it passes `max` bytes. */
async function limitedCopy(source: string, target: string, max: number): Promise<void> {
  let seen = 0;
  const limit = new Transform({
    transform(chunk: Buffer, _enc, cb) {
      seen += chunk.length;
      cb(seen > max ? backupError("backup.too-large") : null, chunk);
    },
  });
  await pipeline(createReadStream(source), limit, createWriteStream(target));
}

export const removePending = (dataDir: string): void => {
  for (const f of names(dataDir)) if (f.startsWith("restore-pending.")) rmSync(join(dataDir, f), { force: true, recursive: false });
};

export function createBackupStore(opts: BackupStoreOptions): BackupStore {
  const migrations = opts.migrations ?? MIGRATIONS;
  const maxRestore = opts.maxRestoreBytes ?? MAX_RESTORE_BYTES;

  const list = (folder: string | null, installId: string): BackupInfo[] => {
    const out: BackupInfo[] = [];
    const scan = (dir: string | null, internal: boolean) => {
      for (const name of names(dir)) {
        const p = parseBackupName(name);
        if (!p || (p.installId === null) !== internal) continue;
        const size = regularSize(join(dir!, name));
        if (size !== null) out.push({ id: name, kind: p.kind, createdAt: p.createdAt, sizeBytes: size, foreign: !internal && p.installId !== installId });
      }
    };
    scan(folder, false);
    scan(opts.internalDir, true);
    return out.sort((a, b) => b.createdAt - a.createdAt || (a.id < b.id ? 1 : -1)).slice(0, MAX_LISTED);
  };

  return {
    defaultFolder: (documents) => join(documents, "Ludiary", "Copias"),

    async create(folder, kind, installId, now) {
      if (!/^[0-9a-f]{8}$/.test(installId)) throw backupError("backup.write-failed");
      try {
        mkdirSync(folder, { recursive: true });
      } catch {
        throw backupError("backup.folder-unavailable");
      }
      // Only our own leftovers (our install id, our pattern); another computer may be writing to the same folder right now.
      for (const f of names(folder)) {
        if (f.endsWith(".partial") && parseBackupName(f.slice(0, -".partial".length))?.installId === installId && regularSize(join(folder, f)) !== null) {
          rmSync(join(folder, f), { force: true });
        }
      }
      const name = userBackupName(now, installId, kind);
      const final = join(folder, name);
      try {
        await opts.db.backup(`${final}.partial`);
        renameSync(`${final}.partial`, final);
      } catch {
        rmSync(`${final}.partial`, { force: true });
        throw backupError("backup.write-failed");
      }
      return { id: name, kind, createdAt: parseBackupName(name)!.createdAt, sizeBytes: regularSize(final) ?? 0, foreign: false };
    },

    async list(folder, installId) {
      return list(folder, installId);
    },

    async delete(folder, id, installId) {
      const p = parseBackupName(id);
      if (!p || p.kind !== "auto" || p.installId !== installId || !list(folder, installId).some((c) => c.id === id)) throw backupError("backup.not-found");
      rmSync(join(folder, id), { force: true });
    },

    async prepareRestore(folder, id, now) {
      const p = parseBackupName(id);
      const dir = p === null ? null : p.installId === null ? opts.internalDir : folder;
      if (!p || dir === null || !names(dir).includes(id)) throw backupError("backup.not-found");
      const source = join(dir, id);
      const size = regularSize(source);
      if (size === null) throw backupError("backup.not-found");
      if (size > maxRestore) throw backupError("backup.too-large");

      const partial = join(opts.dataDir, `${PENDING_SQLITE}.partial`);
      removePending(opts.dataDir);
      try {
        try {
          await limitedCopy(source, partial, maxRestore);
        } catch (e) {
          if (e instanceof CoreError) throw e;
          throw backupError("backup.write-failed");
        }
        // Everything below runs on the private copy, not on the original (it may be on a USB or change under us).
        if ((regularSize(partial) ?? Infinity) > maxRestore) throw backupError("backup.too-large");
        const head = Buffer.alloc(100);
        const fd = openSync(partial, "r+");
        try {
          if (readSync(fd, head, 0, 100, 0) < 100 || !head.subarray(0, 16).equals(SQLITE_MAGIC)) throw backupError("backup.corrupt");
          // A copy of a WAL database says WAL in its header (BK6). Saying "rollback journal" makes the read-only open
          // need no -wal/-shm files; the copy is self-contained, and openDatabase turns WAL on again later.
          if (head[18] === 2 || head[19] === 2) writeSync(fd, Buffer.from([1, 1]), 0, 2, 18);
        } finally {
          closeSync(fd);
        }
        let db: Database.Database;
        try {
          db = openReadonly(partial, opts.addon);
        } catch {
          throw backupError("backup.corrupt");
        }
        try {
          try {
            db.prepare("SELECT count(*) FROM sqlite_master").get();
          } catch {
            throw backupError("backup.corrupt");
          }
          checkSchema(db, opts.addon, migrations);
          if (db.pragma("integrity_check", { simple: true }) !== "ok" || (db.pragma("foreign_key_check") as unknown[]).length > 0) throw backupError("backup.corrupt");
        } catch (e) {
          if (e instanceof CoreError) throw e;
          throw backupError("backup.corrupt");
        } finally {
          db.close();
        }
        for (const ext of ["-wal", "-shm"]) rmSync(`${partial}${ext}`, { force: true });
        renameSync(partial, join(opts.dataDir, PENDING_SQLITE));
        const json = join(opts.dataDir, `${PENDING_JSON}.tmp`);
        writeFileSync(json, JSON.stringify({ phase: "prepared", id, requestedAt: now }));
        renameSync(json, join(opts.dataDir, PENDING_JSON));
      } catch (e) {
        removePending(opts.dataDir);
        throw e instanceof CoreError ? e : backupError("backup.write-failed");
      }
    },
  };
}
