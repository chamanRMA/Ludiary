// Public facade types of the core (ADR 72, point 4) and the shared environment of its use-case modules.
import type { Clock, ConnectorLogger, EmbeddedLogin, FolderPicker, HttpClient, LocalFiles, LocationResolver, ProcessLauncher, SecretCipher, SecretVault, StoreConnector, StoreId, WizardDone, WizardInput, WizardStep } from "@ludiary/contracts";
import type {
  CoreErrorInfo,
  CoreLogger,
  DetectionMode,
  GameDetail,
  CollectionRecord,
  GameDataPatch,
  GameSummary,
  Onboarding,
  ScanRootRecord,
  Settings,
  SettingsPatch,
  StoreStatus,
  SyncOperation,
} from "./model";
import type {
  ConnectionRepository,
  IdentityRepository,
  LibraryRepository,
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
  files: LocalFiles;
  /** Absent: the mode cannot resolve locations, so it cannot auto-detect (ADR 22, 38). */
  locations?: LocationResolver;
  /** Absent: the mode cannot launch games. */
  launcher?: ProcessLauncher;
  /** Absent: the mode cannot open a native folder dialog. */
  folderPicker?: FolderPicker;
  /** ADR 73, 74. Factory of the HttpClient of one connector (its apiHosts). maxBytes: the core passes 16 MiB for listLibrary, 2 MiB otherwise. Absent: no network, no media step. */
  http?: (hosts: readonly string[], signal: AbortSignal, log: ConnectorLogger, opts?: { maxBytes?: number }) => HttpClient;
  /** ADR 80. Absent (Docker, Linux, tests): the embedded-login step is rejected as unavailable. */
  embeddedLogin?: EmbeddedLogin;
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
  updateGame(canonicalId: string, patch: { favorite?: boolean; tags?: readonly string[]; collectionIds?: readonly string[] }): Promise<GameDetail>;
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
}
