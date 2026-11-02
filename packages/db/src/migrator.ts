// Own migrator (ADR 72): applies the SQL embedded in the bundle, one transaction per migration, with a safety
// copy first when the database already has migrations applied (ADR 57).
import { createHash } from "node:crypto";
import { mkdirSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import type Database from "better-sqlite3";
import { MIGRATIONS, type EmbeddedMigration } from "./migrations.generated";

/** The database has migrations this version does not know (ADR 72, 64): runtime exits with code 12. */
export class DatabaseTooNewError extends Error {
  readonly code = "db-too-new";
  constructor(readonly unknownMigrations: readonly string[]) {
    super(`Database has migrations unknown to this version: ${unknownMigrations.join(", ")}`);
    this.name = "DatabaseTooNewError";
  }
}

/** An applied migration no longer matches the embedded SQL. */
export class MigrationMismatchError extends Error {
  readonly code = "migration-mismatch";
  constructor(readonly migrationId: string) {
    super(`Applied migration ${migrationId} differs from the embedded one`);
    this.name = "MigrationMismatchError";
  }
}

/** ADR 85 point 12: a migration left rows pointing nowhere (e.g. a table rebuild dropped what they referenced). It is rolled back. */
export class ForeignKeyViolationError extends Error {
  readonly code = "foreign-key-violation";
  constructor(
    readonly migrationId: string,
    readonly violations: number,
  ) {
    super(`Migration ${migrationId} left ${violations} rows with a broken foreign key; it was rolled back`);
    this.name = "ForeignKeyViolationError";
  }
}

export interface MigrateOptions {
  /** Folder for the pre-migration copy (ADR 57: %LOCALAPPDATA%\Ludiary\backups). Received, not computed. */
  backupDir: string;
  /** Migrations to apply; defaults to the embedded ones. */
  migrations?: readonly EmbeddedMigration[];
  now?: () => number;
  /** Copies kept (ADR 57: 3). */
  keepBackups?: number;
}

export interface MigrateResult {
  applied: readonly string[];
  backupFile: string | null;
}

export const BACKUP_PREFIX = "pre-migration-";

export function hashMigration(m: EmbeddedMigration): string {
  return createHash("sha256").update(m.statements.join("\n--> statement-breakpoint\n")).digest("hex");
}

export async function migrate(db: Database.Database, opts: MigrateOptions): Promise<MigrateResult> {
  const migrations = opts.migrations ?? MIGRATIONS;
  const now = opts.now ?? Date.now;
  db.exec("CREATE TABLE IF NOT EXISTS schema_migrations (id TEXT PRIMARY KEY NOT NULL, hash TEXT NOT NULL, applied_at INTEGER NOT NULL)");
  const appliedRows = db.prepare("SELECT id, hash FROM schema_migrations ORDER BY id").all() as { id: string; hash: string }[];
  const known = new Map(migrations.map((m) => [m.id, m]));

  const unknown = appliedRows.filter((r) => !known.has(r.id)).map((r) => r.id);
  if (unknown.length > 0) throw new DatabaseTooNewError(unknown);
  for (const r of appliedRows) {
    const m = known.get(r.id);
    if (m && hashMigration(m) !== r.hash) throw new MigrationMismatchError(r.id);
  }

  const appliedIds = new Set(appliedRows.map((r) => r.id));
  const pending = migrations.filter((m) => !appliedIds.has(m.id));
  if (pending.length === 0) return { applied: [], backupFile: null };

  let backupFile: string | null = null;
  if (appliedRows.length > 0) {
    mkdirSync(opts.backupDir, { recursive: true });
    const last = appliedRows[appliedRows.length - 1]?.id ?? "none";
    backupFile = join(opts.backupDir, `${BACKUP_PREFIX}${String(now()).padStart(15, "0")}-${last}.sqlite`);
    await db.backup(backupFile);
    pruneBackups(opts.backupDir, opts.keepBackups ?? 3);
  }

  const insert = db.prepare("INSERT INTO schema_migrations (id, hash, applied_at) VALUES (?, ?, ?)");
  // ADR 85 point 12: PRAGMA foreign_keys does nothing inside a transaction, and with it ON the DROP TABLE of a table
  // rebuild would cascade over the user's data. So: OFF outside, foreign_key_check before each COMMIT, ON again always.
  db.pragma("foreign_keys = OFF");
  try {
    for (const m of pending) {
      db.transaction(() => {
        for (const statement of m.statements) db.exec(statement);
        const broken = db.pragma("foreign_key_check") as unknown[];
        if (broken.length > 0) throw new ForeignKeyViolationError(m.id, broken.length);
        insert.run(m.id, hashMigration(m), now());
      })();
    }
  } finally {
    db.pragma("foreign_keys = ON");
  }
  return { applied: pending.map((m) => m.id), backupFile };
}

function pruneBackups(dir: string, keep: number): void {
  const files = readdirSync(dir)
    .filter((f) => f.startsWith(BACKUP_PREFIX) && f.endsWith(".sqlite"))
    .sort(); // the zero-padded timestamp makes the name order the age order
  for (const f of files.slice(0, Math.max(0, files.length - keep))) rmSync(join(dir, f), { force: true });
}
