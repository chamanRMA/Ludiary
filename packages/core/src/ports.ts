// Persistence ports (ADR 38, 72, 74). Implemented by packages/db. Async in the signature even if the
// driver is synchronous, so the core is not tied to it. Repositories are scoped to the only user and
// the local device, which IdentityRepository.ensure creates and returns once at startup.
import type { EntryMedia, PriceServiceId, StoreId } from "@ludiary/contracts";
import type {
  GameDetail,
  GameSummary,
  InstallationRecord,
  LibraryPlan,
  SecretRecord,
  StoreConnectionRecord,
  LaunchTarget,
  PropertyRecord,
  ScanPlan,
  ScanRootRecord,
  SyncOperation,
  SyncStateRecord,
  CollectionRecord,
  GameDataPatch,
  CollectionMirrorCounts,
  CollectionMirrorInput,
  PriceLinkRecord,
  PriceShops,
  PriceSnapshotRecord,
  PriceWatchRecord,
} from "./model";
import type { Label } from "./labels";

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
  /** ADR 84. storeGameId of non-retired DLC of the store without a resolved title, or resolved before `olderThan`. */
  listTitlePending(store: StoreId, olderThan: number, limit: number): Promise<readonly string[]>;
  /** ADR 84. Marks every id of `requested` as resolved at `at`; a title in `titles` replaces the stored one, a missing one keeps the previous. */
  setResolvedTitles(store: StoreId, titles: ReadonlyMap<string, string>, requested: readonly string[], at: number): Promise<void>;
  /**
   * ADR 87. One read: storeGameId -> canonical id for the store's `game` properties whose canonical game is shown, and the
   * storeGameIds of its non-retired `dlc` properties.
   */
  findVisibleCanonicals(store: StoreId): Promise<{ games: ReadonlyMap<string, string>; dlc: ReadonlySet<string> }>;
  /** Applies the whole plan in one transaction; rolls everything back if it fails midway. */
  applyScanPlan(plan: ScanPlan): Promise<void>;
  /** ADR 74. Applies a library snapshot plan in ONE transaction (owned, playtime, last played, media, retirements). */
  applyLibraryPlan(plan: LibraryPlan): Promise<void>;
  /** ADR 74. Number of properties of the store with owned = 1 and not retired (guard against an empty snapshot). */
  countOwned(store: StoreId): Promise<number>;
}

/** ADR 46, 74. Rows hold ciphertext only; the core encrypts and decrypts. Unique by (scope, name) for the only user. */
export interface SecretRepository {
  get(scope: string, name: string): Promise<SecretRecord | null>;
  /** Upsert. */
  put(record: SecretRecord): Promise<void>;
  delete(scope: string, name: string): Promise<void>;
  /** Deletes every row of the scope, compartments included. Returns how many. */
  deleteScope(scope: string): Promise<number>;
}

/** ADR 74. No row means disconnected. */
export interface ConnectionRepository {
  get(store: StoreId): Promise<StoreConnectionRecord | null>;
  list(): Promise<readonly StoreConnectionRecord[]>;
  /** Upsert (connect or reconnect). */
  put(record: StoreConnectionRecord): Promise<void>;
  setStatus(store: StoreId, status: "connected" | "expired"): Promise<void>;
  delete(store: StoreId): Promise<void>;
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
  /** ADR 74. Disconnect: deletes the row so a reconnection syncs at once. */
  delete(store: StoreId, operation: SyncOperation): Promise<void>;
  /** At startup: every 'running' becomes 'idle' (killed process). Returns how many were reset. */
  resetRunning(): Promise<number>;
}

export interface SettingsRepository {
  /** User-scope settings (ADR 69): onboarding.completedAt, detection.mode, ui.locale. */
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<void>;
}

/**
 * ADR 85. Favorites, tags and collections of the only user. Every write is one transaction that checks again what the
 * core checked (limits, the game being shown, the collections existing) and throws `not-found`, `name-taken` or `limit-reached`.
 */
export interface UserDataRepository {
  /** Replaces the given fields. `not-found` if the game is not shown or a collection does not exist. */
  updateGame(canonicalId: string, patch: GameDataPatch, at: number): Promise<void>;
  /** In order of creation, with the games that are shown. */
  listCollections(): Promise<readonly CollectionRecord[]>;
  createCollection(label: Label, at: number): Promise<CollectionRecord>;
  /** `not-found`; `collection-managed` on a mirror; `name-taken` if another OWN collection has the key. */
  renameCollection(id: string, label: Label, at: number): Promise<CollectionRecord>;
  /** Also when it does not exist. Deletes the collection and its rows only, never games or tags. `collection-managed` on a mirror. */
  deleteCollection(id: string): Promise<void>;
  /**
   * ADR 88. In ONE transaction: re-reads `collections.<store>.enabled` (off: writes nothing), reads the store's mirrors, decides with
   * `planCollectionMirror` and writes it, plus `favoritesSeen` and `mirrorAccountSource`. Writes nothing when nothing changes.
   */
  applyCollectionMirror(store: StoreId, input: CollectionMirrorInput, at: number): Promise<CollectionMirrorCounts>;
  /** ADR 88. Deletes every mirror of the store (and `mirrorAccountSource`) in one transaction. Returns how many. Own collections are never touched. */
  deleteCollectionMirrors(store: StoreId): Promise<number>;
  /** Copies the user data of `from` onto `to` (favorite, tags, collections; lower position wins). `from` is left for the caller to delete. */
  mergeUserData(from: string, to: string, at: number): Promise<void>;
}

/**
 * ADR 86, point 8. Links, price cache and follow list of the only user. Every write is scoped to the service; `clearService`
 * is one transaction. Epoch checks (point 15, M3) are the core's job: it calls these only while its epoch is current.
 */
export interface PriceRepository {
  /** Links of the given canonical games; a game with no row is absent from the map. */
  getLinks(service: PriceServiceId, canonicalIds: readonly string[]): Promise<ReadonlyMap<string, PriceLinkRecord>>;
  /** Upsert by (canonical game, service). `not-found` if the canonical game does not exist. */
  putLink(record: PriceLinkRecord): Promise<void>;
  /** Also when it does not exist ("Search again", point 15, B4). */
  deleteLink(service: PriceServiceId, canonicalId: string): Promise<void>;
  /** "Ya lo tienes": service game id -> canonical id, for the 'found' links of ids shown (one per id; the oldest lookup wins). */
  findOwned(service: PriceServiceId, serviceGameIds: readonly string[]): Promise<ReadonlyMap<string, string>>;
  /** Snapshots for one country and shops value; a missing one is absent from the map (keyed by serviceGameId). */
  getSnapshots(service: PriceServiceId, serviceGameIds: readonly string[], country: string, shops: PriceShops): Promise<ReadonlyMap<string, PriceSnapshotRecord>>;
  /** Upsert by the full key. */
  putSnapshots(records: readonly PriceSnapshotRecord[]): Promise<void>;
  /** In order of addition. */
  listWatch(service: PriceServiceId): Promise<readonly PriceWatchRecord[]>;
  getWatch(id: string): Promise<PriceWatchRecord | null>;
  /**
   * Inserts, or returns the existing entry for the same (service, serviceGameId) with `created: false`.
   * `limit-reached` past `max` entries (500).
   */
  addWatch(record: PriceWatchRecord, max: number): Promise<{ record: PriceWatchRecord; created: boolean }>;
  /** Also when it does not exist. */
  deleteWatch(id: string): Promise<void>;
  /** Disconnect: in ONE transaction deletes the service's snapshots and its links that are not 'excluded'. The follow list stays. */
  clearService(service: PriceServiceId): Promise<void>;
}
