import type {
  BackupDto,
  BackupsDto,
  DetectionMode,
  CollectionDto,
  GameDetailDto,
  GamePatchDto,
  GamePricesDto,
  GameSummaryDto,
  OnboardingDto,
  PriceBoardDto,
  PriceRefreshDto,
  PriceSearchResultDto,
  ServiceParams,
  ServiceStatusDto,
  WatchItemDto,
  ScanRootDto,
  SettingsDto,
  SettingsPatchDto,
  UpdateSettingsDto,
  UpdateStatusDto,
  StoreId,
  StoreStatusDto,
  WizardCallbackResponseDto,
  WizardResponseDto,
  WizardStartDto,
  WizardSubmitDto,
} from "@ludiary/api-contract";

/**
 * What the HTTP layer needs from the core (ADR 72, point 4). Structural: `api` does not import `core`.
 * Failures are thrown as errors that carry `code`, `key` and optional `params` (see isCoreError).
 */
export interface LudiaryCoreFacade {
  listLibrary(): Promise<readonly GameSummaryDto[]>;
  getGame(canonicalId: string): Promise<GameDetailDto | null>;
  /** ADR 85. */
  updateGame(canonicalId: string, patch: GamePatchDto): Promise<GameDetailDto>;
  listCollections(): Promise<readonly CollectionDto[]>;
  createCollection(name: string): Promise<CollectionDto>;
  renameCollection(id: string, name: string): Promise<CollectionDto>;
  deleteCollection(id: string): Promise<void>;
  launch(canonicalId: string, propertyId?: string, action?: "play" | "install"): Promise<{ status: "started" | "already-starting" }>;
  requestSync(req: { trigger: "open" | "manual"; operations?: readonly ("library" | "scan")[] }): Promise<void>;
  storeStatus(): Promise<readonly StoreStatusDto[]>;
  getSettings(): Promise<SettingsDto>;
  updateSettings(patch: SettingsPatchDto): Promise<SettingsDto>;
  getOnboarding(): Promise<OnboardingDto>;
  completeOnboarding(mode: DetectionMode | null): Promise<void>;
  resetOnboarding(): Promise<void>;
  setScanRootEnabled(id: string, enabled: boolean): Promise<void>;
  pickScanRoot(): Promise<ScanRootDto | null>;
  removeScanRoot(id: string): Promise<void>;
  /** ADR 74. returnBase is "http://<validated Host>", built by the API, never taken from the request body. */
  startWizard(store: StoreId, returnBase: string): Promise<WizardStartDto>;
  submitWizard(wizardId: string, stepId: string, input: WizardSubmitDto["input"]): Promise<WizardResponseDto>;
  wizardCallback(wizardId: string, query: Readonly<Record<string, string>>): Promise<WizardCallbackResponseDto>;
  cancelWizard(wizardId: string): Promise<void>;
  disconnect(store: StoreId): Promise<void>;
  /** ADR 89. */
  getBackups(): Promise<BackupsDto>;
  createBackup(): Promise<BackupDto>;
  /** null when the user cancelled the dialog. */
  pickBackupFolder(): Promise<BackupsDto | null>;
  /** Prepares the restoration; the caller restarts the server after answering. */
  restoreBackup(id: string): Promise<void>;
  // ADR 86, point 15 A2. Only the services that are registered; the GET-like ones read the cache and never the network.
  listServices(): Promise<readonly ServiceStatusDto[]>;
  startServiceWizard(service: ServiceParams["service"], returnBase: string): Promise<WizardStartDto>;
  disconnectService(service: ServiceParams["service"]): Promise<void>;
  getGamePrices(canonicalId: string): Promise<GamePricesDto>;
  getPriceBoard(): Promise<PriceBoardDto>;
  refreshPrices(req: PriceRefreshDto): Promise<void>;
  setPriceExclusion(canonicalId: string, excluded: boolean): Promise<void>;
  searchPrices(title: string): Promise<readonly PriceSearchResultDto[]>;
  /** `created: false` when the game was already followed (the route answers 200 instead of 201). */
  watchPrice(resultId: string): Promise<{ item: WatchItemDto; created: boolean }>;
  unwatchPrice(id: string): Promise<void>;
}

/** ADR 90 point 10. Lives in the runtime (it is not part of the core); the HTTP layer only needs this shape. */
export interface UpdatesFacade {
  status(): Promise<UpdateStatusDto>;
  /** Sets the mode, marks the one-time card seen, or acknowledges the notices of the last update. */
  setSettings(patch: UpdateSettingsDto): Promise<UpdateStatusDto>;
  checkNow(): Promise<void>;
  download(retryBad: boolean): Promise<void>;
  restart(): Promise<void>;
}

export interface FacadeError {
  code: string;
  key: string;
  params?: Readonly<Record<string, string | number>>;
}

export function isCoreError(e: unknown): e is Error & FacadeError {
  return e instanceof Error && typeof (e as { code?: unknown }).code === "string" && typeof (e as { key?: unknown }).key === "string";
}

/** ADR 72 point 5: not-found 404, invalid-input 400, busy 409, any other domain error 422. */
export function statusForCoreError(code: string): number {
  if (code === "not-found") return 404;
  if (code === "invalid-input") return 400;
  if (code === "busy" || code === "backup.busy") return 409;
  if (code === "backup.not-found") return 404;
  if (code === "update.too-soon") return 429;
  if (code === "update.no-space") return 507;
  if (code.startsWith("update.")) return ["update.unsupported", "update.nothing-new", "update.bad-version", "update.not-writable", "update.not-ready"].includes(code) ? 409 : 502;
  if (code === "backup.folder-unavailable") return 503;
  if (code === "backup.write-failed") return 500;
  if (code === "internal") return 500;
  return 422;
}
