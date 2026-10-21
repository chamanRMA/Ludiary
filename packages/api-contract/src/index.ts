// Wire contract of the local API (ADR 68, 72). TypeBox schemas are the source; DTO types derive from them.
// The web imports this package with `import type` only, so TypeBox never reaches the browser bundle.
import { Type, type Static } from "typebox";

/** Arrays become readonly arrays, recursively (the web treats every DTO as read-only data). */
type RO<T> = T extends (infer U)[] ? readonly RO<U>[] : T extends object ? { [K in keyof T]: RO<T[K]> } : T;

/** ADR 40 store ids, redeclared: no internal imports. */
export const StoreIdSchema = Type.Union([
  Type.Literal("steam"),
  Type.Literal("gog"),
  Type.Literal("epic"),
  Type.Literal("ubisoft"),
  Type.Literal("ea"),
]);
export type StoreId = Static<typeof StoreIdSchema>;
export type ServiceId = "igdb" | "rawg" | "itad";
export type I18nKey = string;
export type I18nParams = Readonly<Record<string, string | number>>;
/** Milliseconds UTC (ADR 47). */
export type Epoch = number;

const strict = { additionalProperties: false } as const;
const Id = Type.String({ minLength: 1, maxLength: 64 });
const EpochSchema = Type.Integer({ minimum: 0 });

// ---- Errors (ADR 72, point 5)
export const TranslatedErrorSchema = Type.Object(
  {
    code: Type.String(),
    key: Type.String(),
    params: Type.Optional(Type.Record(Type.String(), Type.Union([Type.String(), Type.Number()]))),
  },
  strict,
);
export type TranslatedErrorDto = Static<typeof TranslatedErrorSchema>;

export const ApiErrorSchema = Type.Object(
  { error: Type.String(), detail: Type.Optional(TranslatedErrorSchema) },
  strict,
);
export type ApiErrorDto = Static<typeof ApiErrorSchema>;

// ---- Detection, sync, stores
export const DetectionModeSchema = Type.Union([
  Type.Literal("auto-and-manual"),
  Type.Literal("manual-only"),
  Type.Literal("later"),
]); // ADR 42
export type DetectionMode = Static<typeof DetectionModeSchema>;

export const SyncOperationSchema = Type.Union([Type.Literal("library"), Type.Literal("scan")]);

export const SyncStatusSchema = Type.Object(
  {
    operation: SyncOperationSchema,
    state: Type.Union([Type.Literal("idle"), Type.Literal("running"), Type.Literal("error")]),
    lastSuccessAt: Type.Optional(EpochSchema),
    nextAllowedAt: Type.Optional(EpochSchema),
    progress: Type.Optional(
      Type.Object({ done: Type.Integer({ minimum: 0 }), total: Type.Optional(Type.Integer({ minimum: 0 })) }, strict),
    ),
    error: Type.Optional(TranslatedErrorSchema),
  },
  strict,
);
export type SyncStatusDto = RO<Static<typeof SyncStatusSchema>>;

export const StoreStatusSchema = Type.Object(
  {
    store: StoreIdSchema,
    access: Type.Union([Type.Literal("official-api"), Type.Literal("unofficial-api"), Type.Literal("local-only")]),
    /** 'not-applicable': Ubisoft and EA, no account. */
    connection: Type.Union([
      Type.Literal("connected"),
      Type.Literal("expired"),
      Type.Literal("disconnected"),
      Type.Literal("not-applicable"),
    ]),
    /** 'installed-only': Steam without key (ADR 43), and Ubisoft and EA. */
    mode: Type.Union([Type.Literal("library"), Type.Literal("installed-only")]),
    accountLabel: Type.Optional(Type.String()),
    sync: Type.Array(SyncStatusSchema),
  },
  strict,
);
export type StoreStatusDto = RO<Static<typeof StoreStatusSchema>>;

export interface ServiceStatusDto {
  service: ServiceId;
  purpose: "metadata" | "prices";
  configured: boolean;
  /** false while the feature that uses it does not exist (IsThereAnyDeal until phase 3). */
  available: boolean;
}

// ---- Wizard (no server route in this slice: plain types, ADR 72 point 7)
export type WizardTarget = { kind: "store"; store: StoreId } | { kind: "service"; service: ServiceId };

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

// ---- Onboarding, settings, scan roots
export const OnboardingSchema = Type.Object(
  { completedAt: Type.Union([EpochSchema, Type.Null()]), detection: Type.Union([DetectionModeSchema, Type.Null()]) },
  strict,
);
export type OnboardingDto = Static<typeof OnboardingSchema>;

export const OnboardingCompleteSchema = Type.Object({ detection: Type.Union([DetectionModeSchema, Type.Null()]) }, strict);
export type OnboardingCompleteDto = Static<typeof OnboardingCompleteSchema>;

export const ScanRootSchema = Type.Object(
  {
    id: Id,
    origin: Type.Union([Type.Literal("user"), Type.Literal("discovered")]),
    path: Type.String(),
    store: Type.Optional(StoreIdSchema),
    enabled: Type.Boolean(),
    /** ADR 72: location declaration of the connector that discovered it, and its tag (e.g. 'library'). */
    declarationId: Type.Optional(Type.String()),
    tag: Type.Optional(Type.String()),
    /** Translation key to show instead of the raw path label, when the connector provides one. */
    labelKey: Type.Optional(Type.String()),
  },
  strict,
);
export type ScanRootDto = Static<typeof ScanRootSchema>;

export const ScanRootPatchSchema = Type.Object({ enabled: Type.Boolean() }, strict);
export type ScanRootPatchDto = Static<typeof ScanRootPatchSchema>;

export const LocaleSchema = Type.Union([Type.Literal("system"), Type.Literal("es"), Type.Literal("en")]);

export const SettingsSchema = Type.Object(
  {
    locale: LocaleSchema,
    detection: Type.Union([DetectionModeSchema, Type.Null()]),
    scanRoots: Type.Array(ScanRootSchema),
    /** Absent: the feature is not available (ADR 72). */
    backups: Type.Optional(Type.Object({ periodic: Type.Boolean(), folder: Type.Union([Type.String(), Type.Null()]) }, strict)), // ADR 57
    autoUpdate: Type.Optional(Type.Boolean()), // ADR 32
  },
  strict,
);
export type SettingsDto = RO<Static<typeof SettingsSchema>>;

export const SettingsPatchSchema = Type.Object(
  { locale: Type.Optional(LocaleSchema), detection: Type.Optional(DetectionModeSchema) },
  strict,
);
export type SettingsPatchDto = Static<typeof SettingsPatchSchema>;

// ---- Library (ADR 71)
export const GameSummarySchema = Type.Object(
  {
    id: Id,
    title: Type.String(),
    coverUrl: Type.Optional(Type.String()),
    /** Landscape image tried when coverUrl fails (ADR 71). */
    coverFallbackUrl: Type.Optional(Type.String()),
    stores: Type.Array(StoreIdSchema),
    installed: Type.Boolean(),
    favorite: Type.Boolean(),
    playtimeMinutes: Type.Integer({ minimum: 0 }),
    lastPlayedAt: Type.Optional(EpochSchema),
    tags: Type.Array(Type.String()),
  },
  strict,
);
export type GameSummaryDto = RO<Static<typeof GameSummarySchema>>;

export const GamePropertySchema = Type.Object(
  {
    id: Id,
    store: Type.Union([StoreIdSchema, Type.Literal("manual")]),
    installed: Type.Boolean(),
    installPath: Type.Optional(Type.String()),
    actions: Type.Array(Type.Union([Type.Literal("play"), Type.Literal("open-store-page"), Type.Literal("install")])),
  },
  strict,
);

export const GameDetailSchema = Type.Object(
  {
    ...GameSummarySchema.properties,
    properties: Type.Array(GamePropertySchema),
    dlc: Type.Array(Type.Object({ id: Id, title: Type.String(), store: StoreIdSchema }, strict)),
    collections: Type.Array(Type.Object({ id: Id, name: Type.String() }, strict)),
  },
  strict,
);
export type GameDetailDto = RO<Static<typeof GameDetailSchema>>;

// ---- Launch and sync
export const LaunchRequestSchema = Type.Object({ propertyId: Type.Optional(Id) }, strict);
export type LaunchRequestDto = Static<typeof LaunchRequestSchema>;

export const LaunchResponseSchema = Type.Object(
  { status: Type.Union([Type.Literal("started"), Type.Literal("already-starting")]) },
  strict,
);
export type LaunchResponseDto = Static<typeof LaunchResponseSchema>;

export const SyncRequestSchema = Type.Object(
  {
    trigger: Type.Union([Type.Literal("open"), Type.Literal("manual")]),
    operations: Type.Optional(Type.Array(SyncOperationSchema, { maxItems: 2, uniqueItems: true })),
  },
  strict,
);
export type SyncRequestDto = RO<Static<typeof SyncRequestSchema>>;

// ---- Route helpers
export const IdParamsSchema = Type.Object({ id: Id }, strict);
export type IdParams = Static<typeof IdParamsSchema>;
export const EmptyObjectSchema = Type.Object({}, strict);
export const PickCancelledSchema = Type.Object({ cancelled: Type.Literal(true) }, strict);
export type PickCancelledDto = Static<typeof PickCancelledSchema>;
