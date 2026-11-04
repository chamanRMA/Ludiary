// Wire contract of the local API (ADR 68, 72, 74). TypeBox schemas are the source; DTO types derive from them.
// The web imports this package with `import type` only, so TypeBox never reaches the browser bundle.
import { Type, type Static, type TSchema } from "typebox";

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
    lastAttemptAt: Type.Optional(EpochSchema),
    nextAllowedAt: Type.Optional(EpochSchema),
    progress: Type.Optional(
      Type.Object({ done: Type.Integer({ minimum: 0 }), total: Type.Optional(Type.Integer({ minimum: 0 })) }, strict),
    ),
    error: Type.Optional(TranslatedErrorSchema),
  },
  strict,
);
export type SyncStatusDto = RO<Static<typeof SyncStatusSchema>>;

export const StoreCollectionsStatusSchema = Type.Object(
  {
    status: Type.Union([
      Type.Literal("idle"), Type.Literal("error"), Type.Literal("off"), Type.Literal("needs-detection"),
      Type.Literal("store-missing"), Type.Literal("unavailable"), Type.Literal("ambiguous"),
    ]),
    lastSuccessAt: Type.Union([EpochSchema, Type.Null()]),
    /** null: no pass has succeeded yet. */
    accountVerified: Type.Union([Type.Boolean(), Type.Null()]),
    favoritesPending: Type.Integer({ minimum: 0 }),
    error: Type.Optional(TranslatedErrorSchema),
  },
  strict,
);
export type StoreCollectionsStatusDto = RO<Static<typeof StoreCollectionsStatusSchema>>;

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
    /** ADR 88. Only stores that mirror collections; the web shows the status line when some store has it (no store name in the code). */
    collections: Type.Optional(StoreCollectionsStatusSchema),
    sync: Type.Array(SyncStatusSchema),
  },
  strict,
);
export type StoreStatusDto = RO<Static<typeof StoreStatusSchema>>;

// ---- Services (ADR 86, point 15, A2)
export const ServiceIdSchema = Type.Union([Type.Literal("igdb"), Type.Literal("rawg"), Type.Literal("itad")]);
export const ServiceStatusSchema = Type.Object(
  {
    service: ServiceIdSchema,
    purpose: Type.Union([Type.Literal("metadata"), Type.Literal("prices")]),
    /** false while the feature that uses it is not implemented (RAWG and IGDB hide in real mode). */
    available: Type.Boolean(),
    /** status !== 'disconnected'. */
    configured: Type.Boolean(),
    status: Type.Union([Type.Literal("disconnected"), Type.Literal("connected"), Type.Literal("invalid"), Type.Literal("expired")]),
  },
  strict,
);
export type ServiceStatusDto = RO<Static<typeof ServiceStatusSchema>>;
/** Only the implemented services have routes. */
export const ServiceParamsSchema = Type.Object({ service: Type.Literal("itad") }, strict);
export type ServiceParams = Static<typeof ServiceParamsSchema>;

// ---- Prices (ADR 86, point 15, A2). Shown as received: no rounding, no currency conversion (ITAD9).
const Minor = Type.Integer({ minimum: 0, maximum: 1_000_000_000 });
const Currency = Type.String({ pattern: "^[A-Z]{3}$" });
const Country = Type.String({ pattern: "^[A-Z]{2}$" });
const Text300 = Type.String({ maxLength: 300 });
const Url2048 = Type.String({ maxLength: 2048 });
const PriceKind = Type.Union([Type.Literal("game"), Type.Literal("dlc"), Type.Literal("package"), Type.Null()]);

export const DealSchema = Type.Object(
  {
    shop: Type.Object({ storeId: Type.Union([StoreIdSchema, Type.Null()]), name: Text300 }, strict),
    amountMinor: Minor,
    regularMinor: Minor,
    currency: Currency,
    cut: Type.Integer({ minimum: 0, maximum: 100 }),
    voucher: Type.Union([Text300, Type.Null()]),
    /** Absent when the host is not in the service's linkHosts (point 15, M1). */
    url: Type.Optional(Type.String({ maxLength: 2048 })),
    expiresAt: Type.Optional(EpochSchema),
  },
  strict,
);
export type DealDto = RO<Static<typeof DealSchema>>;

export const PricesSchema = Type.Object(
  {
    country: Country,
    fetchedAt: EpochSchema,
    stale: Type.Boolean(),
    deals: Type.Array(DealSchema, { maxItems: 100 }),
    historyLow: Type.Union([Type.Object({ amountMinor: Minor, currency: Currency }, strict), Type.Null()]),
  },
  strict,
);
export type PricesDto = RO<Static<typeof PricesSchema>>;

const BoardState = {
  service: ServiceStatusSchema.properties.status,
  needsCountry: Type.Boolean(),
  limitedUntil: Type.Optional(EpochSchema),
};
export const GamePricesSchema = Type.Object(
  {
    ...BoardState,
    link: Type.Union([Type.Literal("pending"), Type.Literal("found"), Type.Literal("not-found"), Type.Literal("conflict"), Type.Literal("excluded")]),
    prices: Type.Union([PricesSchema, Type.Null()]),
  },
  strict,
);
export type GamePricesDto = RO<Static<typeof GamePricesSchema>>;

/** ADR 91: how a follow-list item got there. */
export const WatchOriginSchema = Type.Union([Type.Literal("manual"), Type.Literal("steam"), Type.Literal("gog")]);
export const WatchItemSchema = Type.Object(
  { id: Id, title: Text300, type: PriceKind, ownedGameId: Type.Optional(Id), coverUrl: Type.Optional(Url2048), coverFallbackUrl: Type.Optional(Url2048), origin: WatchOriginSchema, prices: Type.Union([PricesSchema, Type.Null()]) },
  strict,
);
export type WatchItemDto = RO<Static<typeof WatchItemSchema>>;

export const PriceBoardSchema = Type.Object({ ...BoardState, items: Type.Array(WatchItemSchema, { maxItems: 500 }), wishlistStores: Type.Array(StoreIdSchema, { maxItems: 5 }) }, strict);
export type PriceBoardDto = RO<Static<typeof PriceBoardSchema>>;

export const PriceSearchResultSchema = Type.Object(
  { resultId: Id, title: Text300, type: PriceKind, ownedGameId: Type.Optional(Id), coverUrl: Type.Optional(Url2048), coverFallbackUrl: Type.Optional(Url2048), watched: Type.Boolean() },
  strict,
);
export type PriceSearchResultDto = Static<typeof PriceSearchResultSchema>;

/** POST /api/prices/refresh -> 204. `manual` applies the 1 minute floor and skips the TTL. */
export const PriceRefreshSchema = Type.Object(
  {
    canonicalIds: Type.Optional(Type.Array(Id, { maxItems: 200, uniqueItems: true })),
    watchIds: Type.Optional(Type.Array(Id, { maxItems: 200, uniqueItems: true })),
    manual: Type.Optional(Type.Boolean()),
  },
  { ...strict, minProperties: 1 },
);
export type PriceRefreshDto = Static<typeof PriceRefreshSchema>;
/** POST /api/prices/search -> 200 PriceSearchResultDto[] (at most 20). POST so the title stays out of the URL and the request log. */
export const PriceSearchSchema = Type.Object({ title: Type.String({ minLength: 2, maxLength: 100 }) }, strict);
export type PriceSearchDto = Static<typeof PriceSearchSchema>;
/** POST /api/prices/watch -> 201 WatchItemDto (200 if already followed). resultId must come from a recent search. */
export const PriceWatchSchema = Type.Object({ resultId: Id }, strict);
export type PriceWatchDto = Static<typeof PriceWatchSchema>;

/** ADR 91. Only the stores with a readable wishlist have the route. */
export const WishlistStoreParamsSchema = Type.Object({ store: Type.Union([Type.Literal("steam"), Type.Literal("gog")]) }, strict);
export type WishlistStoreParams = Static<typeof WishlistStoreParamsSchema>;
const Count = Type.Integer({ minimum: 0, maximum: 5000 });
/** POST /api/prices/wishlist/:store/import -> 200. Counters only (ADR 91 point 5.6). */
export const WishlistImportSchema = Type.Object(
  { added: Count, removed: Count, alreadyWatched: Count, notFound: Count, overLimit: Count, hiddenOrEmpty: Type.Boolean() },
  strict,
);
export type WishlistImportDto = Static<typeof WishlistImportSchema>;

// ---- Wizard (ADR 74, point 5). Responses are plain types; requests are validated with TypeBox.
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
  | { kind: "input"; id: string; titleKey: I18nKey; bodyKey: I18nKey; fields: readonly WizardFieldDto[] }
  /** ADR 80. Without the window parameters and `capture`: the web only needs to show the text and a button. */
  | { kind: "embedded-login"; id: string; titleKey: I18nKey; bodyKey: I18nKey };

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

/** An object with an optional entry per store and no other keys. */
const perStore = <T extends TSchema>(s: T) =>
  Type.Object({ steam: Type.Optional(s), gog: Type.Optional(s), epic: Type.Optional(s), ubisoft: Type.Optional(s), ea: Type.Optional(s) }, strict);
const PriceShopsSchema = Type.Union([Type.Literal("ludiary"), Type.Literal("all")]);
const StoreCollectionsSettingsSchema = Type.Object({ enabled: Type.Boolean(), unverifiedFavorites: Type.Boolean() }, strict);

export const SettingsSchema = Type.Object(
  {
    locale: LocaleSchema,
    detection: Type.Union([DetectionModeSchema, Type.Null()]),
    scanRoots: Type.Array(ScanRootSchema),
    /** Absent: the feature is not available (ADR 72). */
    backups: Type.Optional(Type.Object({ periodic: Type.Boolean(), folder: Type.Union([Type.String(), Type.Null()]) }, strict)), // ADR 57, 89: the server always sends it
    autoUpdate: Type.Optional(Type.Boolean()), // ADR 32
    /** ADR 88. Only the stores that mirror collections. */
    storeCollections: perStore(StoreCollectionsSettingsSchema),
    /** ADR 86. Absent: the feature is not available. country null: not chosen yet. */
    prices: Type.Optional(Type.Object({ country: Type.Union([Country, Type.Null()]), shops: PriceShopsSchema }, strict)),
  },
  strict,
);
export type SettingsDto = RO<Static<typeof SettingsSchema>>;

export const SettingsPatchSchema = Type.Object(
  {
    locale: Type.Optional(LocaleSchema),
    detection: Type.Optional(DetectionModeSchema),
    /** ADR 89. The folder never travels here: it only changes through the native dialog. */
    backups: Type.Optional(Type.Object({ periodic: Type.Boolean() }, strict)),
    storeCollections: Type.Optional(perStore(Type.Object({ enabled: Type.Optional(Type.Boolean()), unverifiedFavorites: Type.Optional(Type.Boolean()) }, strict))),
    prices: Type.Optional(Type.Object({ country: Type.Optional(Country), shops: Type.Optional(PriceShopsSchema) }, strict)),
  },
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
    /** ADR 74. Absent counts as null. 'install' when not installed but owned and the store offers it. */
    mainAction: Type.Optional(Type.Union([Type.Literal("play"), Type.Literal("install"), Type.Null()])),
    /** ADR 74 (point 12). true: every non-installed property belongs to a store whose connection is not 'connected'. Absent = false. */
    unsynced: Type.Optional(Type.Boolean()),
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
    dlc: Type.Array(Type.Object({ id: Id, title: Type.String(), store: StoreIdSchema, installed: Type.Boolean() }, strict), { maxItems: 1000 }),
    collections: Type.Array(Type.Object({ id: Id, name: Type.String(), source: Type.Union([StoreIdSchema, Type.Null()]) }, strict)),
  },
  strict,
);
export type GameDetailDto = RO<Static<typeof GameDetailSchema>>;

// ---- User data (ADR 85). Raw limits here are the first barrier; the core applies the real ones.
/** `source`: null = the user's own; a store id = read-only mirror of that store's collection (ADR 88). */
export const CollectionSchema = Type.Object({ id: Id, name: Type.String(), source: Type.Union([StoreIdSchema, Type.Null()]), gameIds: Type.Array(Id) }, strict);
export type CollectionDto = RO<Static<typeof CollectionSchema>>;

const LabelText = Type.String({ maxLength: 200 });
/** PATCH /api/games/:id. Each field replaces the whole set. */
export const GamePatchSchema = Type.Object(
  {
    favorite: Type.Optional(Type.Boolean()),
    tags: Type.Optional(Type.Array(LabelText, { maxItems: 1000 })),
    collectionIds: Type.Optional(Type.Array(Id, { maxItems: 200 })),
  },
  { ...strict, minProperties: 1 },
);
export type GamePatchDto = RO<Static<typeof GamePatchSchema>>;
export const CollectionCreateSchema = Type.Object({ name: LabelText }, strict);
export type CollectionCreateDto = Static<typeof CollectionCreateSchema>;
export const CollectionPatchSchema = CollectionCreateSchema;
export type CollectionPatchDto = CollectionCreateDto;

// ---- Launch and sync
export const LaunchActionSchema = Type.Union([Type.Literal("play"), Type.Literal("install")]);
/** ADR 74. `action` absent means 'play'. */
export const LaunchRequestSchema = Type.Object({ propertyId: Type.Optional(Id), action: Type.Optional(LaunchActionSchema) }, strict);
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

// ---- Wizard routes (ADR 74, point 5). All 'session+key'.
/** Wizard ids are UUID v4 made by the core; the format check keeps junk out of lookups. */
export const WizardIdSchema = Type.String({ pattern: "^[A-Za-z0-9-]{1,64}$" });
export const WizardIdParamsSchema = Type.Object({ wizardId: WizardIdSchema }, strict);
export type WizardIdParams = Static<typeof WizardIdParamsSchema>;
export const StoreParamsSchema = Type.Object({ store: StoreIdSchema }, strict);
export type StoreParams = Static<typeof StoreParamsSchema>;

/** POST /api/stores/:store/wizard -> 201 WizardStartDto. Body: EmptyObjectSchema; returnBase comes from the validated Host. */
export interface WizardStartDto {
  wizardId: string;
  response: WizardResponseDto;
}

// Record(pattern keys) emits patternProperties only; additionalProperties:false is what rejects keys outside the pattern.
/** POST /api/wizards/:wizardId/submit -> 200 WizardResponseDto. At most 8 values of at most 4096 characters. */
export const WizardSubmitSchema = Type.Object(
  {
    stepId: Type.String({ pattern: "^[a-z][a-z0-9-]{0,31}$" }),
    input: Type.Union([
      Type.Object({ kind: Type.Literal("continue") }, strict),
      Type.Object(
        {
          kind: Type.Literal("fields"),
          values: Type.Record(Type.String({ pattern: "^[A-Za-z][A-Za-z0-9]{0,31}$" }), Type.String({ maxLength: 4096 }), { maxProperties: 8, additionalProperties: false }),
        },
        strict,
      ),
    ]),
  },
  strict,
);
export type WizardSubmitDto = RO<Static<typeof WizardSubmitSchema>>;

/** POST /api/wizards/:wizardId/callback -> 200 WizardCallbackResponseDto. At most 32 parameters (the web sends only `openid.*`). */
export const WizardCallbackSchema = Type.Object(
  {
    query: Type.Record(
      Type.String({ pattern: "^[A-Za-z0-9._-]{1,64}$" }),
      Type.String({ maxLength: 2048, pattern: "^[^\u0000-\u001f\u007f]*$" }),
      { maxProperties: 32, additionalProperties: false },
    ),
  },
  strict,
);
export type WizardCallbackDto = RO<Static<typeof WizardCallbackSchema>>;

export interface WizardCallbackResponseDto {
  store: StoreId;
  response: WizardResponseDto;
}
// DELETE /api/wizards/:wizardId and DELETE /api/stores/:store/connection answer 204 with no body.

// ---- Backups (ADR 89)
export const BackupKindSchema = Type.Union([Type.Literal("auto"), Type.Literal("manual"), Type.Literal("pre-migration"), Type.Literal("pre-restore")]);
const BackupId = Type.String({
  maxLength: 120,
  pattern: "^(ludiary-\\d{8}T\\d{9}Z-[0-9a-f]{8}-(auto|manual)|pre-migration-\\d{15}-[0-9a-z_]{1,64}|pre-restore-\\d{15}(-origin)?)\\.sqlite$",
});
export const BackupSchema = Type.Object({ id: BackupId, kind: BackupKindSchema, createdAt: Type.Integer(), sizeBytes: Type.Integer({ minimum: 0 }), foreign: Type.Boolean() }, strict);
export type BackupDto = Static<typeof BackupSchema>;
export const BackupsSchema = Type.Object(
  {
    periodic: Type.Boolean(),
    folder: Type.Union([Type.String(), Type.Null()]),
    folderIsDefault: Type.Boolean(),
    lastBackupAt: Type.Union([Type.Integer(), Type.Null()]),
    lastError: Type.Union([Type.Object({ key: Type.String() }, strict), Type.Null()]),
    lastRestore: Type.Union([
      Type.Object({ id: BackupId, at: Type.Integer(), outcome: Type.Union([Type.Literal("ok"), Type.Literal("rolled-back")]), disabledRoots: Type.Integer({ minimum: 0 }) }, strict),
      Type.Null(),
    ]),
    copies: Type.Array(BackupSchema, { maxItems: 500 }),
  },
  strict,
);
export type BackupsDto = RO<Static<typeof BackupsSchema>>;
export const RestoreBodySchema = Type.Object({ id: BackupId }, strict);
export type RestoreBodyDto = Static<typeof RestoreBodySchema>;
export const RestoreResponseSchema = Type.Object({ restarting: Type.Literal(true) }, strict);

// ---- Updates (ADR 90 point 10)
export const UpdateModeSchema = Type.Union([Type.Literal("auto"), Type.Literal("notify"), Type.Literal("off")]);
export type UpdateModeDto = Static<typeof UpdateModeSchema>;
const Version = Type.String({ pattern: "^\\d+\\.\\d+\\.\\d+$", maxLength: 32 });
export const UpdateStatusSchema = Type.Object(
  {
    /** null: the user has not chosen yet; nothing is requested from GitHub until they do (point 18, M5). */
    mode: Type.Union([UpdateModeSchema, Type.Null()]),
    current: Type.String({ maxLength: 64 }),
    latest: Type.Optional(Version),
    state: Type.Union([
      Type.Literal("unsupported"),
      Type.Literal("idle"),
      Type.Literal("checking"),
      Type.Literal("up-to-date"),
      Type.Literal("available"),
      Type.Literal("downloading"),
      Type.Literal("ready"),
      Type.Literal("failed"),
      Type.Literal("rolled-back"),
    ]),
    progress: Type.Optional(Type.Integer({ minimum: 0, maximum: 100 })),
    lastCheckAt: Type.Optional(EpochSchema),
    /** A code such as `check-failed` or `hash-mismatch`; the web turns it into text. */
    error: Type.Optional(Type.String({ maxLength: 64 })),
    noticeSeen: Type.Boolean(),
    latestFailedBefore: Type.Optional(Type.Boolean()),
    updated: Type.Optional(Version),
    rolledBack: Type.Optional(Type.Object({ from: Version, to: Version, code: Type.String({ maxLength: 64 }) }, strict)),
    downgraded: Type.Optional(Type.Boolean()),
  },
  strict,
);
export type UpdateStatusDto = RO<Static<typeof UpdateStatusSchema>>;
export const UpdateSettingsSchema = Type.Object(
  { mode: Type.Optional(UpdateModeSchema), noticeSeen: Type.Optional(Type.Literal(true)), ack: Type.Optional(Type.Literal(true)) },
  { ...strict, minProperties: 1 },
);
export type UpdateSettingsDto = Static<typeof UpdateSettingsSchema>;
export const UpdateDownloadSchema = Type.Object({ retryBad: Type.Optional(Type.Boolean()) }, strict);
export type UpdateDownloadDto = Static<typeof UpdateDownloadSchema>;
