export { openDatabase, type SqliteAddon } from "./database";
export { createSqliteInstanceLock } from "./instance-lock";
export {
  migrate,
  hashMigration,
  DatabaseTooNewError,
  MigrationMismatchError,
  ForeignKeyViolationError,
  BACKUP_PREFIX,
  type MigrateOptions,
  type MigrateResult,
} from "./migrator";
export { createUpdateCopy, findUpdateCopy } from "./update-copy";
export { MIGRATIONS, type EmbeddedMigration } from "./migrations.generated";
export { createRepositories, type Repositories } from "./repositories";
export { createBackupStore, parseBackupName, userBackupName, MAX_RESTORE_BYTES, type BackupStoreOptions } from "./backup-store";
export {
  readPendingRestore,
  applyPendingRestoreSwap,
  applyRestoreAdjustments,
  markAdjusted,
  finishRestore,
  rollBackRestore,
  SwapError,
  preRestoreName,
  type KeptValues,
  type PendingRead,
  type PendingRestore,
  type RestorePhase,
} from "./restore";
