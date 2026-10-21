import type {
  DetectionMode,
  GameDetailDto,
  GameSummaryDto,
  OnboardingDto,
  ScanRootDto,
  SettingsDto,
  SettingsPatchDto,
  StoreStatusDto,
} from "@ludiary/api-contract";

/**
 * What the HTTP layer needs from the core (ADR 72, point 4). Structural: `api` does not import `core`.
 * Failures are thrown as errors that carry `code`, `key` and optional `params` (see isCoreError).
 */
export interface LudiaryCoreFacade {
  listLibrary(): Promise<readonly GameSummaryDto[]>;
  getGame(canonicalId: string): Promise<GameDetailDto | null>;
  launch(canonicalId: string, propertyId?: string): Promise<{ status: "started" | "already-starting" }>;
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
  if (code === "busy") return 409;
  return 422;
}
