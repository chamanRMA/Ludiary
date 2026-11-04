// Startup order of ADR 89 point 6.3: pending restoration -> database -> migrations -> adjustment -> composeCore.
// The state machine lives in `@ludiary/db`; this function only decides which piece comes next and when to roll back.
import { join } from "node:path";
import type { LastRestore } from "@ludiary/core";
import {
  applyPendingRestoreSwap,
  applyRestoreAdjustments,
  finishRestore,
  markAdjusted,
  openDatabase,
  readPendingRestore,
  rollBackRestore,
  SwapError,
  type PendingRestore,
  type SqliteAddon,
} from "@ludiary/db";
import { FatalError } from "./compose";
import { EXIT } from "./deps";
import type { Logger } from "./files";

/** Test seam: thrown by `cut` to simulate the process dying at that point. Never triggers a roll back. */
type Db = ReturnType<typeof openDatabase>;

export class SimulatedCut extends Error {}

export type CutPoint = "after-swap" | "after-migrate" | "after-adjust" | "after-compose";

export interface StartDatabaseOptions<T> {
  dataDir: string;
  addon: SqliteAddon | undefined;
  log: Logger;
  now: () => number;
  /** migrateDatabase of compose.ts: FatalError on failure. */
  migrate: (db: Db, skipBackup: boolean) => Promise<void>;
  compose: (db: Db) => Promise<T>;
  cut?: (point: CutPoint) => void;
}

export async function startDatabase<T>(o: StartDatabaseOptions<T>): Promise<{ db: Db; composed: T; lastRestore: LastRestore | null }> {
  const { dataDir, log } = o;
  const open = () => openDatabase(join(dataDir, "ludiary.db"), o.addon);

  /** The normal path; `skipBackup` false: a pre-migration copy as before. */
  const plain = async (lastRestore: LastRestore | null) => {
    const db = open();
    try {
      await o.migrate(db, false);
      db.prepare("DELETE FROM settings WHERE key = 'backups.restoredAt'").run(); // closes the chain of restorations (M2)
      return { db, composed: await o.compose(db), lastRestore };
    } catch (e) {
      db.close();
      throw e;
    }
  };
  const rolledBack = (id: string): LastRestore => ({ id, at: o.now(), outcome: "rolled-back", disabledRoots: 0 });

  const pending = readPendingRestore(dataDir);
  if (pending.kind === "none") return plain(null);
  if (pending.kind === "dropped") return plain(rolledBack(pending.id));

  let state: PendingRestore = pending.state;
  if (state.phase === "rolling-back") {
    try {
      rollBackRestore(dataDir, state);
    } catch (e) {
      throw new FatalError(EXIT.database, `restoration roll back failed: ${(e as Error).message}`);
    }
    return plain(rolledBack(state.id));
  }

  let db: Db | null = null;
  try {
    const swapped = await applyPendingRestoreSwap(dataDir, o.addon, state, o.now(), (m) => log("warn", m));
    if (!swapped) return plain(rolledBack(state.id)); // no copy of the current data was possible: nothing was touched
    state = swapped;
    o.cut?.("after-swap");
    db = open();
    await o.migrate(db, true);
    o.cut?.("after-migrate");
    const disabled = applyRestoreAdjustments(db, state.kept ?? { nextAllowedAt: [], activeUserRoots: [] }, o.now());
    if (state.phase !== "adjusted") state = markAdjusted(dataDir, state, disabled); // a repeat keeps the count of the first run
    o.cut?.("after-adjust");
    const composed = await o.compose(db);
    o.cut?.("after-compose");
    finishRestore(dataDir);
    log("info", `restoration applied; ${state.disabledRoots ?? 0} scan folders switched off`);
    return { db, composed, lastRestore: { id: state.id, at: o.now(), outcome: "ok", disabledRoots: state.disabledRoots ?? 0 } };
  } catch (e) {
    if (e instanceof SimulatedCut) {
      db?.close(); // a real crash closes the handle for us
      throw e;
    }
    if (e instanceof SwapError) state = e.state;
    log("error", `restoration failed (${(e as Error).name}); rolling back`);
    try {
      db?.close();
    } catch {
      // already closed
    }
    try {
      rollBackRestore(dataDir, state);
    } catch (e2) {
      throw new FatalError(EXIT.database, `restoration roll back failed: ${(e2 as Error).message}`);
    }
    return plain(rolledBack(state.id));
  }
}
