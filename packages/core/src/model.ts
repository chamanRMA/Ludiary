// Domain types of the core (ADR 72, 74). Plain data; no I/O. The API layer maps them to DTOs.
import type { Label } from "./labels";
import type { ConnectorErrorCode, EntryMedia, ExternalIds, GameAction, I18nKey, I18nParams, StoreId } from "@ludiary/contracts";

export type DetectionMode = "auto-and-manual" | "manual-only" | "later";
export type SyncOperation = "library" | "scan";
export type SyncStatus = "idle" | "running" | "error";

export type CoreErrorCode =
  | "not-found"
  | "not-installed"
  | "action-unavailable"
  | "launch.rejected"
  | "launch.denied"
  | "launch.launcher-missing"
  | "busy"
  | "invalid-input"
  | "name-taken"
  | "collection-managed"
  | "limit-reached"
  | "picker-unavailable"
  | "backup.busy"
  | "backup.no-folder"
  | "backup.folder-unavailable"
  | "backup.write-failed"
  | "backup.not-found"
  | "backup.too-large"
  | "backup.corrupt"
  | "backup.not-ludiary"
  | "backup.too-new";

export interface CoreErrorInfo {
  code: ConnectorErrorCode | CoreErrorCode;
  key: I18nKey;
  params?: I18nParams;
}

export interface SyncStateRecord {
  store: StoreId;
  operation: SyncOperation;
  lastAttemptAt: number | null;
  lastSuccessAt: number | null;
  status: SyncStatus;
  error: CoreErrorInfo | null;
  nextAllowedAt: number | null;
}

export interface ScanRootRecord {
  id: string;
  origin: "user" | "discovered";
  path: string;
  /** LocalFiles.compareKey(path). */
  pathKey: string;
  declarationId: string | null;
  store: StoreId | null;
  tag: string | null;
  enabled: boolean;
}

export interface StoreCollectionsSettings {
  enabled: boolean;
  unverifiedFavorites: boolean;
}
export interface Settings {
  locale: "system" | "es" | "en";
  detection: DetectionMode | null;
  /** ADR 88. Only the stores that have the operation. */
  storeCollections: Partial<Record<StoreId, StoreCollectionsSettings>>;
  /** ADR 89. */
  backups: { periodic: boolean };
}
export interface SettingsPatch {
  locale?: Settings["locale"];
  detection?: DetectionMode | null;
  storeCollections?: Partial<Record<StoreId, Partial<StoreCollectionsSettings>>>;
  /** ADR 89. The folder never travels here. */
  backups?: { periodic?: boolean };
}

export interface Onboarding {
  completedAt: number | null;
  detection: DetectionMode | null;
}

export interface GameSummary {
  id: string;
  title: string;
  coverUrl?: string;
  coverFallbackUrl?: string;
  stores: readonly StoreId[];
  installed: boolean;
  favorite: boolean;
  playtimeMinutes: number;
  lastPlayedAt?: number;
  tags: readonly string[];
  /** ADR 74. Computed on read by the core; the repository may leave it undefined. */
  mainAction?: "play" | "install" | null;
  unsynced?: boolean;
}

export interface GamePropertyDetail {
  id: string;
  store: StoreId | "manual";
  installed: boolean;
  /** ADR 74. The user owns it (library snapshot), installed or not. */
  owned?: boolean;
  installPath?: string;
  actions: readonly GameAction[];
}

export interface GameDetail extends GameSummary {
  properties: readonly GamePropertyDetail[];
  /** ADR 83. `installed`: a row in `installations` on this device. */
  dlc: readonly { id: string; title: string; store: StoreId; installed: boolean }[];
  collections: readonly { id: string; name: string; source: StoreId | null }[];
}

/** ADR 85. `gameIds`: only the games that are shown, in the order they were added. */
export interface CollectionRecord {
  id: string;
  name: string;
  /** ADR 88. null = the user's own; a store id = read-only mirror of that store. */
  source: StoreId | null;
  gameIds: readonly string[];
}

/** ADR 85. Each field replaces the whole set; names arrive normalized by the core. */
export interface GameDataPatch {
  favorite?: boolean;
  tags?: readonly Label[];
  collectionIds?: readonly string[];
}

/** ADR 88. Closed list of the counters the connector's snapshot and the pass add up; they go to the log as `skipped_*`. */
export const MIRROR_SKIPPED_KEYS = [
  "dynamic", "deleted", "hidden", "invalid", "invalidName", "nameTruncated", "empty",
  "limitCollections", "limitGames", "limitSnapshot", "limitIds",
] as const;
export type MirrorSkippedKey = (typeof MIRROR_SKIPPED_KEYS)[number];

/** ADR 88. Input of `UserDataRepository.applyCollectionMirror`: names normalized, ids already translated to canonical games. */
export interface CollectionMirrorInput {
  /** Unique by `sourceId`; `gameIds` are canonical ids without repeats, in store order. */
  collections: readonly { sourceId: string; name: string; key: string; gameIds: readonly string[] }[];
  /** Mirrors with these source ids are never deleted this pass (their name was invalid and they were skipped). */
  protectedSourceIds: readonly string[];
  /** Every favorite the store has now: its store id and the canonical game, or null if it is not (yet) in the library. */
  favorites: readonly { storeGameId: string; canonicalId: string | null }[];
  /** false: the account is not verified and the user did not ask for these favorites. Nothing is marked, nothing is remembered. */
  favoritesAllowed: boolean;
  accountSource: "connected" | "single-folder";
  /** ADR 88 point 15: a partial snapshot or no visible game. Mirrors are created and updated, never deleted. */
  blockDeletes: boolean;
  /** The store reported no collection at all (and none deleted): counted if there are mirrors that stay. */
  emptySnapshot: boolean;
}

/** ADR 88. What the pass did. Numbers only. `off`: the setting was found off inside the transaction and nothing was written. */
export interface CollectionMirrorCounts {
  off: boolean;
  collectionsCreated: number;
  collectionsRenamed: number;
  collectionsDeleted: number;
  gamesAdded: number;
  gamesRemoved: number;
  favoritesAdded: number;
  /** Store favorites not applied yet because the account is not verified. */
  favoritesPending: number;
  emptySnapshotKept: number;
  /** Games that stopped being shown between the lookup and the write. */
  gone: number;
  empty: number;
  limitCollections: number;
  limitGames: number;
}

/** ADR 88. In memory. */
export type CollectionsStepStatus = "idle" | "error" | "off" | "needs-detection" | "store-missing" | "unavailable" | "ambiguous";
export interface StoreCollectionsStatus {
  status: CollectionsStepStatus;
  lastSuccessAt: number | null;
  accountVerified: boolean | null;
  favoritesPending: number;
  error: CoreErrorInfo | null;
}

export interface StoreStatus {
  store: StoreId;
  access: "official-api" | "unofficial-api" | "local-only";
  connection: "connected" | "expired" | "disconnected" | "not-applicable";
  mode: "library" | "installed-only";
  accountLabel?: string;
  /** ADR 88. The connector can mirror the store's collections (and this mode can look for its files). Absent: the store has no such operation. */
  collections?: StoreCollectionsStatus;
  sync: readonly SyncStateRecord[];
}

/** A property as the scan plan and the launch use case see it. */
export interface PropertyRecord {
  id: string;
  canonicalGameId: string | null;
  store: StoreId | "manual";
  storeGameId: string | null;
  kind: "game" | "dlc";
  /** ADR 83. Store id of the base game of a `dlc` property; null if unknown. */
  baseStoreGameId: string | null;
  /** ADR 83 M2. The DLC link was deduced from the title; an installation seen as a game outweighs it. */
  dlcInferred?: boolean;
  title: string;
  normalizedTitle: string;
  owned: boolean;
  removedAt: number | null;
  /** ADR 74. Minutes reported by the store (Steam); null if unknown. */
  storePlaytimeMinutes: number | null;
  storeLastPlayedAt: number | null;
}

export interface InstallationRecord {
  id: string;
  propertyId: string;
  deviceId: string;
  installPath: string;
  launchData: Readonly<Record<string, string>> | null;
}

/** One validated entry reported by a scan, ready to be planned. */
export interface ScannedEntry {
  storeGameId: string;
  kind: "game" | "dlc";
  /** ADR 83. Only for `dlc`. */
  baseStoreGameId?: string | null;
  title: string;
  normalizedTitle: string;
  installPath: string;
  launchData: Readonly<Record<string, string>> | null;
  externalIds?: ExternalIds;
  media?: EntryMedia;
}

/**
 * Scan plan computed by the core and applied by db in ONE transaction (ADR 72, point 4).
 * Ids for new rows are generated by the core (CoreDeps.newId), so the plan is deterministic.
 */
export interface ScanPlan {
  store: StoreId;
  at: number;
  /**
   * New property. `canonicalId`: for a game, the new canonical game to create; for a DLC (ADR 83), the existing canonical
   * of its base game or null. A DLC never creates a canonical game.
   */
  create: readonly { canonicalId: string | null; propertyId: string; installationId: string; entry: ScannedEntry }[];
  /** Existing property: update title and media, and upsert the installation of this device. */
  update: readonly { propertyId: string; installationId: string; entry: ScannedEntry }[];
  /** Installation rows to delete. */
  removeInstallations: readonly string[];
  /** Scan-only properties (owned = 0) left without installations: set removed_at. */
  retireProperties: readonly string[];
  /** Properties found again: removed_at back to null. */
  reviveProperties: readonly string[];
  /** ADR 83 (A3). Applied before the canonical follows the store title. `canonicalId`: new canonical for a game, link for a DLC. */
  kindChanges: readonly KindChange[];
  /** ADR 83. DLC whose canonical game changes (only the ones that change). */
  dlcLinks: readonly DlcLink[];
  /** Informational (logged, not applied): rows whose kind was kept because of ADR 83 A1. */
  kindConflicts?: number;
  /** Discovered roots: upsert (new ones enabled) ... */
  upsertDiscoveredRoots: readonly ScanRootRecord[];
  /** ... and delete those the connector stopped returning. */
  deleteRoots: readonly string[];
  sync: SyncStateRecord;
}

export interface KindChange {
  propertyId: string;
  kind: "game" | "dlc";
  canonicalId: string | null;
}
export interface DlcLink {
  propertyId: string;
  canonicalId: string | null;
}

/** One validated entry of a library snapshot, ready to be planned (ADR 74). */
export interface LibraryEntry {
  storeGameId: string;
  kind: "game" | "dlc";
  /** ADR 83. Only for `dlc`. */
  baseStoreGameId?: string | null;
  /** ADR 83 M2. The base was deduced from the title. */
  dlcInferred?: true;
  title: string;
  normalizedTitle: string;
  externalIds?: ExternalIds;
  media?: EntryMedia;
  storePlaytimeMinutes: number | null;
  storeLastPlayedAt: number | null;
}

/**
 * Library plan computed by the core and applied by db in ONE transaction (ADR 74, point 7).
 * Same storeGameId = same property (unique index user, store, store_game_id).
 */
export interface LibraryPlan {
  store: StoreId;
  at: number;
  /** New property. `canonicalId` as in `ScanPlan.create` (ADR 83). */
  create: readonly { canonicalId: string | null; propertyId: string; entry: LibraryEntry }[];
  /** Existing property: owned = 1, removed_at = null, update title, playtime, last played and media (keeps resolvedMedia, ADR 73). */
  update: readonly { propertyId: string; entry: LibraryEntry }[];
  /** owned = 0 for these (complete snapshots only). */
  disown: readonly string[];
  /** Subset of the disowned ones without installation: set removed_at. */
  retire: readonly string[];
  /** ADR 83 (A3) and links, as in `ScanPlan`. */
  kindChanges: readonly KindChange[];
  dlcLinks: readonly DlcLink[];
  /** Informational (logged, not applied): entries whose kind was kept because of ADR 83 A1. */
  kindConflicts?: number;
  sync: SyncStateRecord;
}

/** ADR 46, 74. Encrypted secret row of the only user. */
export interface SecretRecord {
  /** `store:<id>` or `service:<id>`. */
  scope: string;
  name: string;
  /** `v1.<keyId>.<nonce>.<ciphertext+tag>` from SecretCipher. */
  ciphertext: string;
  keyId: number;
  updatedAt: number;
}

/** ADR 74. Absent row = disconnected. accountLabel is the non-secret personaname; never logged. */
export interface StoreConnectionRecord {
  store: StoreId;
  status: "connected" | "expired";
  accountLabel: string | null;
  connectedAt: number;
}

export interface LaunchTarget {
  canonicalGameId: string;
  property: PropertyRecord;
  /** null when the property is not installed on this device. */
  installation: InstallationRecord | null;
}

/** Redacted structured log; messages in English, never paths, names or secrets (ADR 59). */
export interface CoreLogger {
  debug(msg: string, fields?: Readonly<Record<string, string | number | boolean>>): void;
  info(msg: string, fields?: Readonly<Record<string, string | number | boolean>>): void;
  warn(msg: string, fields?: Readonly<Record<string, string | number | boolean>>): void;
  error(msg: string, fields?: Readonly<Record<string, string | number | boolean>>): void;
}
