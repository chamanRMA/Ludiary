import type {
  DetectionMode,
  Epoch,
  GameDetailDto,
  GameSummaryDto,
  OnboardingDto,
  ServiceStatusDto,
  SettingsDto,
  StoreId,
  StoreStatusDto,
  WizardInputDto,
  WizardResponseDto,
  WizardTarget,
} from "@ludiary/api-contract";
import { createMockApi } from "./mock";

/** Settings the draft contract does not cover yet (reported to the architect). */
export interface GeneralSettings extends SettingsDto {
  autostart: boolean;
  syncOnStart: boolean;
}

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
  getOnboarding(): Promise<OnboardingDto>;
  completeOnboarding(detection: DetectionMode | null): Promise<void>;
  /** Settings > General "repeat the wizard". */
  resetOnboarding(): Promise<void>;
  getSettings(): Promise<GeneralSettings>;
  updateSettings(patch: Partial<GeneralSettings>): Promise<GeneralSettings>;
  getLibrary(): Promise<readonly GameSummaryDto[]>;
  getGame(id: string): Promise<GameDetailDto | null>;
  getCollections(): Promise<readonly CollectionDto[]>;
  getMaintenance(): Promise<MaintenanceDto>;
  syncAll(): Promise<void>;
  scan(): Promise<void>;
  createBackup(): Promise<void>;
  exportLogs(): Promise<void>;
  /** Simulator only: lets the Epic "expired session" screens be reached. Goes away with the real API. */
  simulateExpiredSession(store: StoreId): Promise<void>;
}

/** True while the data comes from the simulator; screens say so to the user. */
export const isSimulated = true;

export const api: LudiaryApi = createMockApi();
