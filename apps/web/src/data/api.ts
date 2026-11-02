import type {
  DetectionMode,
  Epoch,
  GameDetailDto,
  GameSummaryDto,
  LaunchResponseDto,
  OnboardingDto,
  ScanRootDto,
  ServiceStatusDto,
  SettingsDto,
  StoreId,
  StoreStatusDto,
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
export type SettingsUpdate = Partial<Pick<GeneralSettings, "locale" | "backups" | "autoUpdate" | "autostart" | "syncOnStart">> & { detection?: DetectionMode };

export type SyncTrigger = "open" | "manual";

export type LaunchActionDto = "play" | "install";

/** Not in the draft contract either: collections, and the state behind backup/scan/log buttons. */
export interface CollectionDto {
  id: string;
  name: string;
  gameIds: readonly string[];
}
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
  getCollections(): Promise<readonly CollectionDto[]>;
  getMaintenance(): Promise<MaintenanceDto>;
  /** Asks for a synchronization of everything; it runs in the background (poll `getStores`). */
  syncAll(trigger?: SyncTrigger): Promise<void>;
  /** Manual folder scan. */
  scan(): Promise<void>;
  /** Launches a stored game by id (ADR 72, invariant 3). `propertyId` picks one of its properties; `action` defaults to play (ADR 74). */
  launchGame(id: string, propertyId?: string, action?: LaunchActionDto): Promise<LaunchResponseDto>;
  /** Revokes every browser session, this one included (ADR 54). The next request answers 401. */
  revokeSessions(): Promise<void>;
  createBackup(): Promise<void>;
  exportLogs(): Promise<void>;
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
