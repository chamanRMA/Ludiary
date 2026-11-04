import type {
  BackupsDto,
  CollectionDto,
  DetectionMode,
  Epoch,
  GameDetailDto,
  GamePatchDto,
  GamePricesDto,
  GameSummaryDto,
  LaunchResponseDto,
  OnboardingDto,
  PriceBoardDto,
  PriceRefreshDto,
  PriceSearchResultDto,
  ScanRootDto,
  ServiceStatusDto,
  SettingsDto,
  SettingsPatchDto,
  StoreId,
  StoreStatusDto,
  WatchItemDto,
  WizardInputDto,
  WizardResponseDto,
  WizardTarget,
} from "@ludiary/api-contract";
import { createHttp } from "./http";
import { createMockApi } from "./mock";
import { createRealApi } from "./real";

/**
 * What the Settings screens show. The server owns locale, detection and scan roots; the rest
 * (`backups`, `autoUpdate` are optional in SettingsDto, `autostart` and `syncOnStart` are not in it)
 * come from the simulator when the server does not have them (ADR 72 point B).
 */
export interface GeneralSettings extends Omit<SettingsDto, "backups" | "autoUpdate"> {
  backups: { periodic: boolean; folder: string | null };
  autoUpdate: boolean;
  autostart: boolean;
  syncOnStart: boolean;
}

/** Settings that can be changed through `updateSettings`. Scan roots have their own methods. */
export type SettingsUpdate = Partial<Pick<GeneralSettings, "locale" | "autoUpdate" | "autostart" | "syncOnStart">> & {
  /** ADR 89. The folder only changes through `pickBackupFolder`. */
  backups?: { periodic: boolean };
  detection?: DetectionMode;
  /** ADR 88. Per store with collections: the mirror switch and the unverified-favorites switch. */
  storeCollections?: SettingsPatchDto["storeCollections"];
  /** ADR 86. Country (two capital letters) and which shops to compare. */
  prices?: SettingsPatchDto["prices"];
};

export type SyncTrigger = "open" | "manual";

export type LaunchActionDto = "play" | "install";

export type { CollectionDto };

/** Not in the draft contract: the state behind backup/scan/log buttons. */
export interface MaintenanceDto {
  lastBackupAt: Epoch | null;
  lastScanAt: Epoch | null;
  lastSyncAt: Epoch | null;
}

/** Shape of the future HTTP contract (ADR 68). Screens only know this interface. */
export interface LudiaryApi {
  getStores(): Promise<readonly StoreStatusDto[]>;
  getServices(): Promise<readonly ServiceStatusDto[]>;
  startWizard(target: WizardTarget): Promise<WizardResponseDto>;
  submitWizard(target: WizardTarget, input: WizardInputDto): Promise<WizardResponseDto>;
  cancelWizard(target: WizardTarget): Promise<void>;
  disconnect(target: WizardTarget): Promise<void>;
  /** OpenID return (ADR 74). Sends the stored wizard the `openid.*` parameters. `null`: no wizard is stored (expired or never started). */
  wizardCallback(store: StoreId, query: Readonly<Record<string, string>>): Promise<WizardResponseDto | null>;
  getOnboarding(): Promise<OnboardingDto>;
  completeOnboarding(detection: DetectionMode | null): Promise<void>;
  /** Settings > General "repeat the wizard". */
  resetOnboarding(): Promise<void>;
  getSettings(): Promise<GeneralSettings>;
  updateSettings(patch: SettingsUpdate): Promise<GeneralSettings>;
  /** Opens the native folder picker on the server. `null` when the user cancels. */
  addScanRoot(): Promise<ScanRootDto | null>;
  setScanRootEnabled(id: string, enabled: boolean): Promise<void>;
  removeScanRoot(id: string): Promise<void>;
  getLibrary(): Promise<readonly GameSummaryDto[]>;
  getGame(id: string): Promise<GameDetailDto | null>;
  /** ADR 85. Replaces favorite, tags and/or collections of a game and returns the game. Errors carry translatable keys (ApiError). */
  updateGame(id: string, patch: GamePatchDto): Promise<GameDetailDto>;
  getCollections(): Promise<readonly CollectionDto[]>;
  createCollection(name: string): Promise<CollectionDto>;
  renameCollection(id: string, name: string): Promise<CollectionDto>;
  deleteCollection(id: string): Promise<void>;
  getMaintenance(): Promise<MaintenanceDto>;
  /** Asks for a synchronization of everything; it runs in the background (poll `getStores`). */
  syncAll(trigger?: SyncTrigger): Promise<void>;
  /** Manual folder scan. */
  scan(): Promise<void>;
  /** Launches a stored game by id (ADR 72, invariant 3). `propertyId` picks one of its properties; `action` defaults to play (ADR 74). */
  launchGame(id: string, propertyId?: string, action?: LaunchActionDto): Promise<LaunchResponseDto>;
  /** Revokes every browser session, this one included (ADR 54). The next request answers 401. */
  revokeSessions(): Promise<void>;
  /** ADR 89. Makes a manual copy in the backup folder. */
  createBackup(): Promise<void>;
  getBackups(): Promise<BackupsDto>;
  /** Opens the native folder dialog on the server. `null` when the user cancels. */
  pickBackupFolder(): Promise<BackupsDto | null>;
  /** The server prepares the restoration and restarts: after this resolves the page must stop using the API. */
  restoreBackup(id: string): Promise<void>;
  exportLogs(): Promise<void>;
  // ---- ADR 86. The GET-like ones read the server cache; only `refreshPrices` and `searchPrices` reach IsThereAnyDeal.
  getGamePrices(id: string): Promise<GamePricesDto>;
  getPriceBoard(): Promise<PriceBoardDto>;
  /** Resolves when the server finished (it answers 204); read again afterwards. */
  refreshPrices(req: PriceRefreshDto): Promise<void>;
  /** "Not this game" (true) and its undo, "Search again" (false). */
  setPriceExclusion(id: string, excluded: boolean): Promise<void>;
  searchPrices(title: string): Promise<readonly PriceSearchResultDto[]>;
  watchPrice(resultId: string): Promise<WatchItemDto>;
  unwatchPrice(id: string): Promise<void>;
  /** Simulator only: lets the Epic "expired session" screens be reached. Goes away with the real API. */
  simulateExpiredSession(store: StoreId): Promise<void>;
}

/**
 * Build-time switch (ADR 72): true only for `vite dev` and `vite preview` (see vite.config.ts and the
 * package scripts). The production build is false and uses the real client, which still delegates to the
 * simulator the parts the server does not have yet (point B).
 */
export const isSimulated: boolean = import.meta.env.VITE_LUDIARY_SIMULATOR === "1";

export const api: LudiaryApi = isSimulated ? createMockApi() : createRealApi(createHttp(), createMockApi());
