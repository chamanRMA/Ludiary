// Public facade types of the core (ADR 72, point 4) and the shared environment of its use-case modules.
import type { Clock, ConnectorLogger, FolderPicker, HttpClient, LocalFiles, LocationResolver, ProcessLauncher, StoreConnector, StoreId } from "@ludiary/contracts";
import type {
  CoreLogger,
  DetectionMode,
  GameDetail,
  GameSummary,
  Onboarding,
  ScanRootRecord,
  Settings,
  SettingsPatch,
  StoreStatus,
  SyncOperation,
} from "./model";
import type {
  IdentityRepository,
  LibraryRepository,
  ScanRootRepository,
  SettingsRepository,
  SyncStateRepository,
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
/** Fixed order to pick the property to launch when none is given (ADR 72). */
export const LAUNCH_ORDER: readonly StoreId[] = ["steam", "gog", "epic", "ubisoft", "ea"];

export interface CoreDeps {
  connectors: readonly StoreConnector[];
  library: LibraryRepository;
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
  /** ADR 73. Factory of the HttpClient of one connector (its apiHosts). Absent: no network, no media step. */
  http?: (hosts: readonly string[], signal: AbortSignal, log: ConnectorLogger) => HttpClient;
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

export interface LudiaryCore {
  readonly capabilities: CoreCapabilities;
  listLibrary(): Promise<readonly GameSummary[]>;
  getGame(canonicalId: string): Promise<GameDetail | null>;
  /** Never returns the launch specification (ADR 40 rule 5). */
  launch(canonicalId: string, propertyId?: string): Promise<{ status: "started" | "already-starting" }>;
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
}

/** Shared by the use-case modules. */
export interface Env {
  deps: CoreDeps;
  connectors: ReadonlyMap<StoreId, StoreConnector>;
  userId: string;
  deviceId: string;
}
