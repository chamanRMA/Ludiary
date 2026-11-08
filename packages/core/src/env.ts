// Public facade types of the core (ADR 72, point 4) and the shared environment of its use-case modules.
import type { Clock, ConnectorLogger, EmbeddedLogin, FilePicker, FolderPicker, HttpClient, LocalFiles, LocationResolver, PriceService, PriceServiceId, ProcessLauncher, ProcessWatcher, SecretCipher, SecretVault, StoreConnector, StoreId, UserFolders, WizardDone, WizardInput, WizardStep } from "@ludiary/contracts";
import type {
  CoreErrorInfo,
  CoreLogger,
  DetectionMode,
  GameDetail,
  CollectionRecord,
  GameDataPatch,
  GameSummary,
  GamePrices,
  Onboarding,
  PriceBoard,
  PriceSearchResult,
  ServiceStatus,
  WatchItem,
  WishlistImportResult,
  ScanRootRecord,
  Settings,
  SettingsPatch,
  StoreStatus,
  SyncOperation,
} from "./model";
import type { BackupInfo } from "./ports";
import type { BackupsState, LastRestore } from "./backups";
import type {
  BackupStore,
  ConnectionRepository,
  IdentityRepository,
  LibraryRepository,
  PriceRepository,
  ScanRootRepository,
  SecretRepository,
  SettingsRepository,
  SyncStateRepository,
  UserDataRepository,
} from "./ports";

export const SCAN_WAIT_MS = 60_000;
export const CONNECTOR_TIMEOUT_MS = 60_000;
/** ADR 73: media step of a scan. */
export const MEDIA_BATCH = 50;
export const MEDIA_MAX_BATCHES = 20;
export const MEDIA_TIMEOUT_MS = 15_000;
/** Longest wait a store-provided Retry-After can impose on the media step (ADR 73, audit). */
export const MAX_MEDIA_RETRY_MS = 24 * 3_600_000;
export const MEDIA_MAX_AGE_MS = 30 * 24 * 3_600_000;
export const DOUBLE_LAUNCH_MS = 5_000;
/** ADR 74: library sync. */
export const LIBRARY_TIMEOUT_MS = 60_000;
export const HOUR_MS = 3_600_000;
/** ADR 50: automatic sync when the web opens, if the last successful one is older than this (stores not listed: 12 h). */
export const AUTO_SYNC_MS: Readonly<Partial<Record<StoreId, number>>> = { steam: 6 * HOUR_MS, gog: 12 * HOUR_MS, epic: 12 * HOUR_MS, ubisoft: 12 * HOUR_MS };
export const AUTO_SYNC_DEFAULT_MS = 12 * HOUR_MS;
/** ADR 50: after an error the automatic attempt waits this many floors, up to a day. */
export const ERROR_BACKOFF_FACTOR = 2;
export const MAX_BACKOFF_MS = 24 * HOUR_MS;
/** ADR 74 point 5: wizard sessions. */
export const WIZARD_TTL_MS = 15 * 60_000;
export const WIZARD_CALL_MS = 30_000;
export const MAX_WIZARDS = 4;
/** ADR 80: longest wait for the embedded login window; it is aborted after this. */
export const EMBEDDED_LOGIN_MS = 10 * 60_000;
/** ADR 86 point 7 and 15: prices. */
export const PRICE_TTL_MS = 6 * HOUR_MS;
export const PRICE_CALL_MS = 15_000;
/** Own budget: a fifth of the service's default limit, per user, in memory. Searches count. */
export const PRICE_BUDGET = 200;
export const PRICE_BUDGET_WINDOW_MS = 5 * 60_000;
/** A game that was not found is looked up again after this long (a changed title or property looks it up at once). */
export const PRICE_NOT_FOUND_RETRY_MS = 30 * 24 * HOUR_MS;
export const PRICE_LOOKUP_BATCH = 200;
export const PRICE_BATCH = 200;
export const PRICE_BATCH_ALL = 50;
export const SEARCH_TTL_MS = 15 * 60_000;
export const SEARCH_MAX_RESULTS = 20;
export const SEARCH_KEEP = 200;
export const WATCH_MAX = 500;
/** ADR 91 point 13 (M3): own floor of the wishlist import, per store, in memory; apart from MANUAL_SYNC_FLOOR_MS. */
export const WISHLIST_IMPORT_FLOOR_MS = 10 * 60_000;
/** ADR 91: ids a store may return (the rest is cut and the list counts as partial). */
export const WISHLIST_MAX_ENTRIES = 5000;
/** Fixed order to pick the property to launch when none is given (ADR 72). */
export const LAUNCH_ORDER: readonly StoreId[] = ["steam", "gog", "epic", "ubisoft", "ea"];

export interface CoreDeps {
  connectors: readonly StoreConnector[];
  library: LibraryRepository;
  userData: UserDataRepository;
  scanRoots: ScanRootRepository;
  syncState: SyncStateRepository;
  settings: SettingsRepository;
  identity: IdentityRepository;
  /** ADR 86. Absent together with `priceServices`: the mode has no price comparison. */
  prices?: PriceRepository;
  /** ADR 86. Registered price services (IsThereAnyDeal). Empty or absent: Settings > Services and the comparator stay hidden. */
  priceServices?: readonly PriceService[];
  files: LocalFiles;
  /** Absent: the mode cannot resolve locations, so it cannot auto-detect (ADR 22, 38). */
  locations?: LocationResolver;
  /** Absent: the mode cannot launch games. */
  launcher?: ProcessLauncher;
  /** ADR 92. Absent (Docker, tests): there is never a game running. */
  processes?: ProcessWatcher;
  /** Absent: the mode cannot open a native folder dialog. */
  folderPicker?: FolderPicker;
  /** ADR 93. Absent (Docker, tests): the manual-game pick routes answer `picker-unavailable`. */
  filePicker?: FilePicker;
  /** ADR 93 (A4). Ludiary's install and data folders, already resolved; a manual executable inside them is refused. */
  ownFolders?: readonly string[];
  /** ADR 73, 74. Factory of the HttpClient of one connector (its apiHosts). maxBytes: the core passes 16 MiB for listLibrary, 2 MiB otherwise. Absent: no network, no media step. */
  http?: (hosts: readonly string[], signal: AbortSignal, log: ConnectorLogger, opts?: { maxBytes?: number }) => HttpClient;
  /** ADR 80. Absent (Docker, Linux, tests): the embedded-login step is rejected as unavailable. */
  embeddedLogin?: EmbeddedLogin;
  /** ADR 89. Absent: the mode has no backups. */
  backups?: BackupStore;
  /** ADR 89. Absent or null Documents: activating backups asks for a folder. */
  userFolders?: UserFolders;
  /** ADR 89. Result of a restoration applied at startup; lives in the memory of this process. */
  lastRestore?: () => LastRestore | null;
  /** ADR 46, 74. */
  cipher: SecretCipher;
  secrets: SecretRepository;
  connections: ConnectionRepository;
  clock: Clock;
  newId: () => string;
  log: CoreLogger;
  /** Translates a key to the current language (only used for the folder dialog title). */
  t: (key: string) => string;
  /** BCP 47 locale of the OS, given to connectors when the setting is 'system'. Defaults to 'en'. */
  systemLocale?: string;
}

export interface CoreCapabilities {
  canScan: boolean;
  canLaunch: boolean;
  canPickFolder: boolean;
  /** ADR 89. */
  canBackup: boolean;
}

export interface SyncRequest {
  trigger: "open" | "manual";
  operations?: readonly SyncOperation[];
}

/** ADR 74. */
export type WizardResponse = WizardStep | WizardDone | { kind: "rejected"; stepId: string; error: CoreErrorInfo };

export interface LudiaryCore {
  readonly capabilities: CoreCapabilities;
  listLibrary(): Promise<readonly GameSummary[]>;
  getGame(canonicalId: string): Promise<GameDetail | null>;
  /** ADR 85. Replaces favorite, tags and/or collections of a shown game and returns it. `tags` are raw names: the core normalizes them. */
  updateGame(canonicalId: string, patch: { favorite?: boolean; tags?: readonly string[]; collectionIds?: readonly string[]; title?: string }): Promise<GameDetail>;
  /** ADR 93. Native .exe dialog; null if cancelled. `created: false` if that executable was already added. */
  addManualGame(): Promise<{ game: GameDetail; created: boolean } | null>;
  /** ADR 93. Same dialog and checks; replaces the executable of this device. null if cancelled. Only manual-only games. */
  pickManualExecutable(canonicalId: string): Promise<GameDetail | null>;
  /** ADR 93. Only manual-only games; files on disk are never touched. */
  removeGame(canonicalId: string): Promise<void>;
  listCollections(): Promise<readonly CollectionRecord[]>;
  createCollection(name: string): Promise<CollectionRecord>;
  renameCollection(id: string, name: string): Promise<CollectionRecord>;
  deleteCollection(id: string): Promise<void>;
  /** Never returns the launch specification (ADR 40 rule 5). */
  launch(
    canonicalId: string,
    propertyId?: string,
    action?: "play" | "install",
  ): Promise<{ status: "started" | "already-starting" }>;
  /**
   * Resolves once the scans that will run have been accepted and marked 'running' in sync_state (the API answers 202
   * right after). Their end is reported by storeStatus(); `whenIdle` waits for it (tests, shutdown).
   */
  requestSync(req: SyncRequest): Promise<void>;
  whenIdle(): Promise<void>;
  storeStatus(): Promise<readonly StoreStatus[]>;
  getSettings(): Promise<Settings>;
  updateSettings(patch: SettingsPatch): Promise<Settings>;
  getOnboarding(): Promise<Onboarding>;
  completeOnboarding(mode: DetectionMode | null): Promise<void>;
  resetOnboarding(): Promise<void>;
  listScanRoots(): Promise<readonly ScanRootRecord[]>;
  setScanRootEnabled(id: string, enabled: boolean): Promise<ScanRootRecord>;
  /** null when the user cancelled the dialog. Only one dialog at a time ('busy'). */
  pickScanRoot(): Promise<ScanRootRecord | null>;
  removeScanRoot(id: string): Promise<void>;
  /** ADR 74. returnBase: "http://<validated Host>", no path. 404 not-found if the store has no `connection`. */
  startWizard(store: StoreId, returnBase: string): Promise<{ wizardId: string; response: WizardResponse }>;
  /** input.kind is never 'callback' here. Unknown or expired wizard: not-found. */
  submitWizard(wizardId: string, stepId: string, input: WizardInput): Promise<WizardResponse>;
  wizardCallback(wizardId: string, query: Readonly<Record<string, string>>): Promise<{ store: StoreId; response: WizardResponse }>;
  /** Idempotent. */
  cancelWizard(wizardId: string): Promise<void>;
  disconnect(store: StoreId): Promise<void>;
  /** ADR 89. */
  getBackups(): Promise<BackupsState>;
  createBackup(): Promise<BackupInfo>;
  /** null when the user cancelled the dialog. */
  pickBackupFolder(): Promise<BackupsState | null>;
  /** Prepares the restoration (point 6.1); the caller then restarts the server. */
  restoreBackup(id: string): Promise<void>;
  /** ADR 92. True if a process runs from the install folder of a stored game. Never throws; only a boolean leaves. */
  isGameRunning(): Promise<boolean>;
  /** Called by the runtime after startup and every hour. Never throws. */
  backupTick(): Promise<void>;
  /** ADR 86. Registered price services with their state, derived without network. */
  listServices(): Promise<readonly ServiceStatus[]>;
  /** ADR 86. Same engine as startWizard; the key is stored by the core when the wizard ends. */
  startServiceWizard(service: PriceServiceId, returnBase: string): Promise<{ wizardId: string; response: WizardResponse }>;
  /** ADR 86 point 8: key, state, cache and links (not the excluded ones) go; the follow list stays. */
  disconnectService(service: PriceServiceId): Promise<void>;
  /** ADR 86. Cache only, never the network. `not-found` if the game is not shown. */
  getGamePrices(canonicalId: string): Promise<GamePrices>;
  getPriceBoard(): Promise<PriceBoard>;
  /** ADR 86. Queries what is missing or older than the TTL (everything if `manual`, which has a floor of a minute). */
  refreshPrices(req: { canonicalIds?: readonly string[]; watchIds?: readonly string[]; manual?: boolean }): Promise<void>;
  /** "Not this game" and its undo ("Search again"). Idempotent. */
  setPriceExclusion(canonicalId: string, excluded: boolean): Promise<void>;
  searchPrices(title: string): Promise<readonly PriceSearchResult[]>;
  /** Only a `resultId` from a recent search. `created: false` if it was already followed. */
  watchPrice(resultId: string): Promise<{ item: WatchItem; created: boolean }>;
  unwatchPrice(id: string): Promise<void>;
  /**
   * ADR 91. Reads the store's wishlist and follows it (see `PriceFeature.importWishlist`). `invalid-input` for a store without
   * wishlist import. Counters only.
   */
  importWishlist(store: StoreId): Promise<WishlistImportResult>;
  /** ADR 80. Server shutdown: aborts the open login windows. */
  shutdown(): void;
}

/** Shared by the use-case modules. */
export interface Env {
  deps: CoreDeps;
  connectors: ReadonlyMap<StoreId, StoreConnector>;
  userId: string;
  deviceId: string;
  /** ADR 74. The vault of scope `store:<id>`. */
  vaultFor(store: StoreId): SecretVault;
  /** ADR 86. Registered price services. */
  services: ReadonlyMap<PriceServiceId, PriceService>;
  /** ADR 86. The vault of scope `service:<id>`. */
  serviceVaultFor(service: PriceServiceId): SecretVault;
}
