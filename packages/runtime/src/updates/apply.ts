// What the inner launcher (the Node side) does around an update (ADR 90 point 7.2, point 8 and point 18): decide to apply and
// take the copy of the database, and put that copy back on a rollback. Nothing here installs or touches `Programs`.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { applyPendingRestoreSwap, createBackupStore, createSqliteInstanceLock, createUpdateCopy, finishRestore, findUpdateCopy, MIGRATIONS, openDatabase, readPendingRestore } from "@ludiary/db";
import { EXIT, type RuntimeDeps } from "../deps";
import { createFileLogger, type Logger } from "../files";
import { readState, readVersionsFile, updateFolder, writeState } from "./state";
import { compareVersions, isVersion } from "./version";

/**
 * No server of ours is running and the state says `ready`. Takes the instance lock (62), copies the database, writes
 * `applying` and lets go. true: the caller exits with `EXIT.applyUpdate`. false: start normally (also when the copy failed).
 */
export async function maybeApplyUpdate(deps: RuntimeDeps, log: Logger): Promise<boolean> {
  const root = deps.updates?.platform.installRoot;
  if (!root || !isVersion(deps.version)) return false;
  const dataDir = deps.platform.dataDir;
  const st = readState(dataDir);
  if (st.state !== "ready" || !st.version || compareVersions(st.version, deps.version) <= 0) return false;
  const versions = readVersionsFile(root);
  if (versions?.badVersions.includes(st.version) && st.retryBad !== st.version) return false;
  const folder = updateFolder(dataDir, st.version);
  for (const f of [`Ludiary-Setup-${st.version}.exe`, "ludiary-update.json", "ludiary-update.json.sig"]) if (!existsSync(join(folder, f))) return false;

  const release = await createSqliteInstanceLock(join(dataDir, "instance.lock"), deps.sqliteAddon).acquire();
  if (!release) return false; // a server is starting right now
  try {
    await createUpdateCopy({ dataDir, addon: deps.sqliteAddon, from: deps.version, to: st.version, now: Date.now(), reuse: versions?.applyingTo === st.version });
    writeState(dataDir, { state: "applying", from: deps.version, to: st.version, ...(st.retryBad ? { retryBad: st.retryBad } : {}) });
    log("info", `update ${st.version} ready to apply; the database was copied`);
    return true;
  } catch (e) {
    log("error", `pre-update copy failed (${(e as Error).name}); starting normally this time`);
    return false;
  } finally {
    release();
  }
}

/**
 * `--rollback-update` (point 18, A2): the old version, the one that made the copy, puts the database back. Holds the
 * instance lock for the whole restoration and restores with the machinery of ADR 89 (validated copy, current database
 * saved first, WAL files out of the way). Idempotent. 0 = done or nothing to restore.
 */
export async function runRollbackUpdate(deps: RuntimeDeps, code: number, pair: { from: string; to: string } | null): Promise<number> {
  const dataDir = deps.platform.dataDir;
  const log = createFileLogger(dataDir, "launcher");
  const release = await createSqliteInstanceLock(join(dataDir, "instance.lock"), deps.sqliteAddon).acquire();
  if (!release) {
    log("error", "rollback: the instance lock is held; nothing was touched");
    return EXIT.error;
  }
  try {
    // The pair comes from the stable launcher, already validated; state.json is not trusted (the new server may have rewritten it).
    if (!pair || pair.from !== deps.version || !isVersion(pair.to)) {
      log("error", "rollback: missing or inconsistent versions");
      return EXIT.error;
    }
    const st = readState(dataDir);
    if (st.state === "rolled-back" && st.to === pair.to) {
      log("info", "rollback: already done");
      return EXIT.ok;
    }
    const backups = join(dataDir, "backups");
    const st2 = { to: pair.to };
    const name = findUpdateCopy(backups, deps.version, st2.to);
    if (name) await restoreDatabase(deps, dataDir, backups, name, log);
    else log("warn", "rollback: no copy of the database for this update; it stays as it is");
    writeState(dataDir, { state: "rolled-back", from: deps.version, to: pair.to, code: String(code) });
    log("info", `rolled back from ${pair.to} (exit ${code})`);
    return EXIT.ok;
  } catch (e) {
    log("error", `rollback failed (${(e as Error).name}: ${(e as Error).message})`);
    return EXIT.error;
  } finally {
    release();
  }
}

async function restoreDatabase(deps: RuntimeDeps, dataDir: string, backups: string, name: string, log: Logger): Promise<void> {
  const addon = deps.sqliteAddon;
  const dbFile = join(dataDir, "ludiary.db");
  if (existsSync(dbFile)) {
    try {
      const live = openDatabase(dbFile, addon);
      try {
        live.pragma("wal_checkpoint(TRUNCATE)");
        const known = new Set(MIGRATIONS.map((m) => m.id));
        const unknown = (live.prepare("SELECT id FROM schema_migrations").all() as { id: string }[]).filter((r) => !known.has(r.id)).length;
        if (unknown > 0) log("warn", `rollback: the current database has ${unknown} migration(s) this version does not know; the copy is restored anyway`);
      } finally {
        live.close();
      }
    } catch (e) {
      log("warn", `rollback: the current database could not be read (${(e as Error).name}); it is moved aside`);
    }
  }
  const scratch = openDatabase(":memory:", addon);
  try {
    await createBackupStore({ db: scratch, dataDir, internalDir: backups, addon }).prepareRestore(backups, name, Date.now());
  } finally {
    scratch.close();
  }
  const pending = readPendingRestore(dataDir);
  if (pending.kind !== "pending") throw new Error("the restoration was not prepared");
  if (!(await applyPendingRestoreSwap(dataDir, addon, pending.state, Date.now(), (m) => log("warn", m)))) throw new Error("the current database could not be saved first");
  finishRestore(dataDir);
}
