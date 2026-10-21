// Draft v0 (ADR 68). Types only; schemas come with the first real route.
export type StoreId = "steam" | "gog" | "epic" | "ubisoft" | "ea"; // same values as contracts (ADR 40), redeclared: no internal imports
export type ServiceId = "igdb" | "rawg" | "itad";
export type I18nKey = string;
export type I18nParams = Readonly<Record<string, string | number>>;
/** Milliseconds UTC (ADR 47). */
export type Epoch = number;

export interface ApiErrorDto {
  error: string;
} // current server format
export interface TranslatedErrorDto {
  code: string;
  key: I18nKey;
  params?: I18nParams;
}

export type DetectionMode = "auto-and-manual" | "manual-only" | "later"; // ADR 42

export interface SyncStatusDto {
  operation: "library" | "scan";
  state: "idle" | "running" | "error";
  lastSuccessAt?: Epoch;
  nextAllowedAt?: Epoch;
  progress?: { done: number; total?: number };
  error?: TranslatedErrorDto;
}

export interface StoreStatusDto {
  store: StoreId;
  access: "official-api" | "unofficial-api" | "local-only";
  /** 'not-applicable': Ubisoft and EA, no account. */
  connection: "connected" | "expired" | "disconnected" | "not-applicable";
  /** 'installed-only': Steam without key (ADR 43), and Ubisoft and EA. */
  mode: "library" | "installed-only";
  accountLabel?: string;
  sync: readonly SyncStatusDto[];
}

export interface ServiceStatusDto {
  service: ServiceId;
  purpose: "metadata" | "prices";
  configured: boolean;
  /** false while the feature that uses it does not exist (IsThereAnyDeal until phase 3). */
  available: boolean;
}

export type WizardTarget =
  | { kind: "store"; store: StoreId }
  | { kind: "service"; service: ServiceId };

/** Wire form of WizardStep (ADR 40, 43). */
export type WizardStepDto =
  | { kind: "info"; id: string; titleKey: I18nKey; bodyKey: I18nKey; params?: I18nParams }
  | {
      kind: "open-external";
      id: string;
      titleKey: I18nKey;
      bodyKey: I18nKey;
      url: string;
      awaits: "callback" | "input";
      /** Deviation from the ADR 68 draft v0 (reported to the architect): link and fields share one screen. */
      fields?: readonly WizardFieldDto[];
    }
  | { kind: "input"; id: string; titleKey: I18nKey; bodyKey: I18nKey; fields: readonly WizardFieldDto[] };

export interface WizardFieldDto {
  name: string;
  labelKey: I18nKey;
  secret: boolean;
  pattern?: string;
  maxLength: number;
  paste?: boolean;
  extract?: `json-field:${string}` | `url-query:${string}`;
}

export type WizardInputDto =
  | { kind: "continue" }
  | { kind: "fields"; values: Readonly<Record<string, string>> }
  | { kind: "callback"; query: Readonly<Record<string, string>> };

export type WizardResponseDto =
  | WizardStepDto
  | { kind: "done"; accountLabel?: string }
  | { kind: "rejected"; stepId: string; error: TranslatedErrorDto }; // same step again, with the error shown

export interface OnboardingDto {
  completedAt: Epoch | null;
  detection: DetectionMode | null;
}

export interface ScanRootDto {
  id: string;
  origin: "user" | "discovered";
  path: string;
  store?: StoreId;
  enabled: boolean;
}

export interface SettingsDto {
  locale: "system" | "es" | "en";
  detection: DetectionMode | null;
  scanRoots: readonly ScanRootDto[];
  backups: { periodic: boolean; folder: string | null }; // ADR 57
  autoUpdate: boolean; // ADR 32
}

/** Draft until the library API exists. */
export interface GameSummaryDto {
  id: string;
  title: string;
  coverUrl?: string;
  /** Landscape image tried when coverUrl fails (ADR 71). */
  coverFallbackUrl?: string;
  stores: readonly StoreId[];
  installed: boolean;
  favorite: boolean;
  playtimeMinutes: number;
  lastPlayedAt?: Epoch;
  tags: readonly string[];
}
export interface GameDetailDto extends GameSummaryDto {
  properties: readonly {
    id: string;
    store: StoreId | "manual";
    installed: boolean;
    installPath?: string;
    actions: readonly ("play" | "open-store-page" | "install")[];
  }[];
  dlc: readonly { id: string; title: string; store: StoreId }[];
  collections: readonly { id: string; name: string }[];
}
