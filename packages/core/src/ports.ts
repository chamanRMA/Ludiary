// Persistence ports (ADR 38, 72). Implemented by packages/db. Async in the signature even if the
// driver is synchronous, so the core is not tied to it. Repositories are scoped to the only user and
// the local device, which IdentityRepository.ensure creates and returns once at startup.
import type { EntryMedia, StoreId } from "@ludiary/contracts";
import type {
  GameDetail,
  GameSummary,
  InstallationRecord,
  LaunchTarget,
  PropertyRecord,
  ScanPlan,
  ScanRootRecord,
  SyncOperation,
  SyncStateRecord,
} from "./model";

export interface IdentityRepository {
  /** Creates the only user and the 'local' device if missing (ADR 47). Idempotent. */
  ensure(newId: () => string, now: number): Promise<{ userId: string; deviceId: string }>;
}

export interface LibraryRepository {
  /** Canonical games with at least one non-retired property, with install state for this device. */
  listLibrary(): Promise<readonly GameSummary[]>;
  getGame(canonicalId: string): Promise<GameDetail | null>;
  /** Properties of the canonical game with their installation on this device. Empty if the game does not exist. */
  getLaunchTargets(canonicalId: string): Promise<readonly LaunchTarget[]>;
  /** Stored properties of one store, in any state, to compute a scan plan. */
  listProperties(store: StoreId): Promise<readonly PropertyRecord[]>;
  /** Installations of this device for one store. */
  listInstallations(store: StoreId): Promise<readonly InstallationRecord[]>;
  /** ADR 73. storeGameId of non-retired games of the store without media resolved, or resolved before `olderThan`. */
  listMediaPending(store: StoreId, olderThan: number, limit: number): Promise<readonly string[]>;
  /** ADR 73. Marks every id of `requested` as resolved at `at`; those missing from `media` get empty media. */
  setResolvedMedia(store: StoreId, media: ReadonlyMap<string, EntryMedia>, requested: readonly string[], at: number): Promise<void>;
  /** Applies the whole plan in one transaction; rolls everything back if it fails midway. */
  applyScanPlan(plan: ScanPlan): Promise<void>;
}

export interface ScanRootRepository {
  list(): Promise<readonly ScanRootRecord[]>;
  get(id: string): Promise<ScanRootRecord | null>;
  /** Adds a root of origin 'user'. Returns null, storing nothing, if (origin, pathKey) already exists. */
  addUser(root: ScanRootRecord): Promise<ScanRootRecord | null>;
  setEnabled(id: string, enabled: boolean): Promise<void>;
  /** Removes only roots of origin 'user'. Returns false if none was removed. */
  remove(id: string): Promise<boolean>;
}

export interface SyncStateRepository {
  get(store: StoreId, operation: SyncOperation): Promise<SyncStateRecord | null>;
  list(): Promise<readonly SyncStateRecord[]>;
  put(state: SyncStateRecord): Promise<void>;
  /** At startup: every 'running' becomes 'idle' (killed process). Returns how many were reset. */
  resetRunning(): Promise<number>;
}

export interface SettingsRepository {
  /** User-scope settings (ADR 69): onboarding.completedAt, detection.mode, ui.locale. */
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<void>;
}
