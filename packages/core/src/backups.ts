// Backups (ADR 89, 57): periodic and manual copies, retention and the request to restore. The core has no timers
// (ADR 38): `backupTick` is called by the runtime. Paths stay opaque; the BackupStore owns every file.
import type { Env } from "./env";
import { backupError, CoreError } from "./errors";
import type { BackupInfo, BackupStore } from "./ports";

const DAY_MS = 86_400_000;
const WEEK_MS = 7 * DAY_MS;
const DAILY_KEPT = 7;
const WEEKS_KEPT = 4;
/** The server answers with the newest 500 (ADR 89 point 16, B4). */
export const MAX_LISTED_BACKUPS = 500;

const K_PERIODIC = "backups.periodic";
const K_FOLDER = "backups.folder";
const K_INSTALL_ID = "backups.installId";
const INSTALL_ID = /^[0-9a-f]{8}$/;

export interface LastRestore {
  id: string;
  at: number;
  outcome: "ok" | "rolled-back";
  disabledRoots: number;
}

export interface BackupsState {
  periodic: boolean;
  folder: string | null;
  folderIsDefault: boolean;
  lastBackupAt: number | null;
  lastError: { key: string } | null;
  lastRestore: LastRestore | null;
  copies: readonly BackupInfo[];
}

/** ISO week index in UTC: weeks start on Monday and 1970-01-01 was a Thursday. */
const weekOf = (t: number): number => Math.floor((t + 3 * DAY_MS) / WEEK_MS);

/**
 * ADR 89 point 4. Ids to delete: only own `auto` copies not newer than `now`. Kept: the 7 newest, plus the newest of each
 * of the 4 ISO weeks before the current one. `manual`, internal, foreign and future-dated copies are never returned.
 */
export function planBackupPrune(copies: readonly BackupInfo[], now: number): string[] {
  const own = copies.filter((c) => c.kind === "auto" && !c.foreign && c.createdAt <= now).sort((a, b) => b.createdAt - a.createdAt);
  const keep = new Set(own.slice(0, DAILY_KEPT).map((c) => c.id));
  const current = weekOf(now);
  for (let w = current - WEEKS_KEPT; w < current; w++) {
    const newest = own.find((c) => weekOf(c.createdAt) === w);
    if (newest) keep.add(newest.id);
  }
  return own.filter((c) => !keep.has(c.id)).map((c) => c.id);
}

export interface BackupService {
  state(): Promise<BackupsState>;
  setPeriodic(periodic: boolean): Promise<void>;
  readPeriodic(): Promise<boolean>;
  createManual(): Promise<BackupInfo>;
  /** Stores a folder the caller already validated (it came from the native dialog). */
  setFolder(path: string): Promise<void>;
  tick(): Promise<void>;
  /** Point 6.1. Resolves when the copy is prepared; the lock then stays until the process exits. */
  restore(id: string): Promise<void>;
  whenIdle(): Promise<void>;
}

export function createBackupService(env: Env, lastRestore: () => LastRestore | null): BackupService {
  const { deps } = env;
  let busy: Promise<unknown> | null = null;
  let held = false; // true after a restore was prepared: no copy or restore until the process restarts
  let lastError: { key: string } | null = null;
  let documents: string | null = null;

  const store = (): BackupStore => {
    if (!deps.backups) throw new CoreError("action-unavailable", "This mode has no backups");
    return deps.backups;
  };

  async function folder(): Promise<{ path: string | null; isDefault: boolean }> {
    const chosen = await deps.settings.get(K_FOLDER);
    if (typeof chosen === "string" && chosen !== "") return { path: chosen, isDefault: false };
    documents ??= (await deps.userFolders?.documents()) ?? null; // asked once: on Windows it starts the helper
    const docs = documents;
    return { path: docs === null ? null : store().defaultFolder(docs), isDefault: true };
  }

  async function installId(): Promise<string> {
    const saved = await deps.settings.get(K_INSTALL_ID);
    if (typeof saved === "string" && INSTALL_ID.test(saved)) return saved;
    const fresh = deps.newId().replace(/[^0-9a-f]/g, "").padEnd(8, "0").slice(0, 8);
    await deps.settings.set(K_INSTALL_ID, fresh);
    return fresh;
  }

  /** One copy or restoration at a time (ADR 89 point 3). */
  async function exclusive<T>(fn: () => Promise<T>): Promise<T> {
    if (busy || held) throw backupError("backup.busy");
    const run = fn();
    busy = run.catch(() => undefined);
    try {
      return await run;
    } finally {
      busy = null;
    }
  }

  const record = (e: unknown): void => {
    lastError = { key: e instanceof CoreError && e.code === "backup.folder-unavailable" ? e.key : backupError("backup.write-failed").key };
  };
  const ownCopies = (list: readonly BackupInfo[], now: number) => list.filter((c) => (c.kind === "auto" || c.kind === "manual") && !c.foreign && c.createdAt <= now);

  async function createIn(kind: "auto" | "manual"): Promise<BackupInfo> {
    const where = (await folder()).path;
    if (where === null) throw backupError("backup.no-folder");
    const id = await installId();
    const now = deps.clock.now();
    let made: BackupInfo;
    try {
      made = await store().create(where, kind, id, now);
    } catch (e) {
      record(e);
      throw e instanceof CoreError ? e : backupError("backup.write-failed");
    }
    lastError = null;
    if (kind === "auto") {
      // Prune after the copy, never before. A failed prune is not a failed backup.
      try {
        for (const name of planBackupPrune(await store().list(where, id), now)) await store().delete(where, name, id);
      } catch {
        deps.log.warn("Could not prune old backups");
      }
    }
    return made;
  }

  const service: BackupService = {
    async readPeriodic() {
      return (await deps.settings.get(K_PERIODIC)) === true;
    },
    async setPeriodic(periodic) {
      if (typeof periodic !== "boolean") throw new CoreError("invalid-input", "periodic must be a boolean");
      if (periodic) {
        store();
        if ((await folder()).path === null) throw backupError("backup.no-folder"); // nothing is saved
      }
      await deps.settings.set(K_PERIODIC, periodic);
      if (periodic) void service.tick(); // the first copy is not awaited; a failure stays in lastError
    },
    async state() {
      const { path, isDefault } = await folder();
      const id = await installId();
      let copies: BackupInfo[] = [];
      try {
        copies = (await store().list(path, id)).slice(0, MAX_LISTED_BACKUPS);
      } catch {
        deps.log.warn("Could not list backups");
      }
      const own = ownCopies(copies, deps.clock.now());
      return {
        periodic: await service.readPeriodic(),
        folder: path,
        folderIsDefault: isDefault,
        lastBackupAt: own.length > 0 ? Math.max(...own.map((c) => c.createdAt)) : null,
        lastError,
        lastRestore: lastRestore(),
        copies,
      };
    },
    createManual: () => exclusive(() => createIn("manual")),
    async setFolder(path) {
      await deps.settings.set(K_FOLDER, path);
    },
    async tick() {
      if (!deps.backups || busy || held || !(await service.readPeriodic())) return;
      try {
        await exclusive(async () => {
          const where = (await folder()).path;
          if (where === null) return;
          const now = deps.clock.now();
          const own = ownCopies(await store().list(where, await installId()), now);
          const newest = own.reduce((m, c) => Math.max(m, c.createdAt), 0);
          if (own.length === 0 || now - newest >= DAY_MS) await createIn("auto");
        });
      } catch (e) {
        // createIn recorded its own failures; anything else (e.g. the listing) is the same kind of problem.
        if (!(e instanceof CoreError && e.code.startsWith("backup."))) record(e);
        deps.log.warn("Periodic backup failed", { code: e instanceof CoreError ? e.code : "unknown" });
      }
    },
    async restore(id) {
      if (typeof id !== "string") throw new CoreError("invalid-input", "id must be text");
      if (busy || held) throw backupError("backup.busy");
      const run = (async () => store().prepareRestore((await folder()).path, id, deps.clock.now()))();
      busy = run.catch(() => undefined);
      try {
        await run;
        held = true; // never released: the server restarts right after (ADR 89 point 6.2)
      } finally {
        busy = null;
      }
    },
    async whenIdle() {
      await busy;
    },
  };
  return service;
}
