// Drizzle schema of migrations 0001_library_scan to 0007_prices (ADR 47, 72, 74, 85, 86).
import { sql } from "drizzle-orm";
import { check, index, integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import type { PriceSnapshotData } from "@ludiary/core";

export interface MediaJson {
  coverUrl?: string;
  heroUrl?: string;
  iconUrl?: string;
}
export interface StoreMetadataJson {
  media?: MediaJson;
  externalIds?: Record<string, string>;
  /** ADR 73: artwork from the connector's resolveMedia; {} when the store knows nothing. Wins over `media`, field by field. */
  resolvedMedia?: MediaJson;
  /** ADR 73: epoch ms of the last resolveMedia answer. */
  mediaResolvedAt?: number;
  /** ADR 84: DLC title from the connector's resolveTitles. Wins over `title` when shown. */
  resolvedTitle?: string;
  /** ADR 84: epoch ms of the last resolveTitles attempt (stamped even when no title came). */
  titleResolvedAt?: number;
  /** ADR 83 M2: the DLC link was deduced from the title. */
  dlcInferred?: true;
}

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  createdAt: integer("created_at").notNull(),
});

export const devices = sqliteTable(
  "devices",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id),
    name: text("name").notNull(),
    kind: text("kind").notNull(),
  },
  (t) => [check("devices_kind_check", sql`${t.kind} IN ('local', 'agent')`), index("devices_user_idx").on(t.userId, t.kind)],
);

export const canonicalGames = sqliteTable(
  "canonical_games",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id),
    title: text("title").notNull(),
    normalizedTitle: text("normalized_title").notNull(),
    media: text("media", { mode: "json" }).$type<MediaJson>(),
    metadataSource: text("metadata_source"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [index("canonical_games_title_idx").on(t.userId, t.normalizedTitle)],
);

export const gameProperties = sqliteTable(
  "game_properties",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id),
    canonicalGameId: text("canonical_game_id").references(() => canonicalGames.id),
    store: text("store").notNull(),
    storeGameId: text("store_game_id"),
    kind: text("kind").notNull(),
    /** ADR 83. Store id of the base game of a `dlc` property (same store); null if unknown. Not an index: plans load the store's properties. */
    baseStoreGameId: text("base_store_game_id"),
    title: text("title").notNull(),
    normalizedTitle: text("normalized_title").notNull(),
    owned: integer("owned").notNull().default(0),
    removedAt: integer("removed_at"),
    storeMetadata: text("store_metadata", { mode: "json" }).$type<StoreMetadataJson>(),
    /** ADR 74. Minutes and epoch ms reported by the store; null if unknown. */
    storePlaytimeMinutes: integer("store_playtime_minutes"),
    storeLastPlayedAt: integer("store_last_played_at"),
  },
  (t) => [
    uniqueIndex("game_properties_store_uq").on(t.userId, t.store, t.storeGameId),
    index("game_properties_canonical_idx").on(t.canonicalGameId),
    index("game_properties_title_idx").on(t.userId, t.normalizedTitle),
    check("game_properties_store_check", sql`${t.store} IN ('steam', 'gog', 'epic', 'ubisoft', 'ea', 'manual')`),
    check("game_properties_kind_check", sql`${t.kind} IN ('game', 'dlc')`),
  ],
);

export const installations = sqliteTable(
  "installations",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id),
    propertyId: text("property_id").notNull().references(() => gameProperties.id, { onDelete: "cascade" }),
    deviceId: text("device_id").notNull().references(() => devices.id),
    installPath: text("install_path").notNull(),
    launchData: text("launch_data", { mode: "json" }).$type<Record<string, string>>(),
    /** 'scan' = found by a scan. 'library' = registered by the user (manual game, ADR 93): only addManualGame and setManualInstallation write it; scans and syncs never touch those rows. */
    detectedBy: text("detected_by").notNull().default("scan"),
    lastSeenAt: integer("last_seen_at").notNull(),
  },
  (t) => [
    uniqueIndex("installations_property_device_uq").on(t.propertyId, t.deviceId),
    check("installations_detected_by_check", sql`${t.detectedBy} IN ('scan', 'library')`),
  ],
);

export const scanRoots = sqliteTable(
  "scan_roots",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id),
    deviceId: text("device_id").notNull().references(() => devices.id),
    origin: text("origin").notNull(),
    path: text("path").notNull(),
    pathKey: text("path_key").notNull(),
    declarationId: text("declaration_id"),
    store: text("store"),
    tag: text("tag"),
    enabled: integer("enabled").notNull().default(1),
  },
  (t) => [
    uniqueIndex("scan_roots_path_uq").on(t.userId, t.deviceId, t.origin, t.pathKey),
    check("scan_roots_origin_check", sql`${t.origin} IN ('user', 'discovered')`),
  ],
);

export const syncState = sqliteTable(
  "sync_state",
  {
    userId: text("user_id").notNull().references(() => users.id),
    store: text("store").notNull(),
    operation: text("operation").notNull(),
    lastAttemptAt: integer("last_attempt_at"),
    lastSuccessAt: integer("last_success_at"),
    status: text("status").notNull(),
    errorCode: text("error_code"),
    errorKey: text("error_key"),
    errorParams: text("error_params", { mode: "json" }).$type<Record<string, string | number>>(),
    nextAllowedAt: integer("next_allowed_at"),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.store, t.operation] }),
    check("sync_state_operation_check", sql`${t.operation} IN ('library', 'scan')`),
    check("sync_state_status_check", sql`${t.status} IN ('idle', 'running', 'error')`),
  ],
);

export const settings = sqliteTable(
  "settings",
  {
    userId: text("user_id").references(() => users.id),
    key: text("key").notNull(),
    value: text("value", { mode: "json" }),
  },
  (t) => [uniqueIndex("settings_user_key_uq").on(t.userId, t.key)],
);

/** ADR 46, 74. Ciphertext only; the key lives outside the database. */
export const secrets = sqliteTable(
  "secrets",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id),
    scope: text("scope").notNull(),
    name: text("name").notNull(),
    ciphertext: text("ciphertext").notNull(),
    keyId: integer("key_id").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [uniqueIndex("secrets_user_scope_name_uq").on(t.userId, t.scope, t.name)],
);

/** ADR 74. No row = disconnected. */
export const storeConnections = sqliteTable(
  "store_connections",
  {
    userId: text("user_id").notNull().references(() => users.id),
    store: text("store").notNull(),
    status: text("status").notNull(),
    accountLabel: text("account_label"),
    connectedAt: integer("connected_at").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.store] }),
    check("store_connections_status_check", sql`${t.status} IN ('connected', 'expired')`),
  ],
);

// ---- ADR 85. User data hangs from the canonical game; every key to it cascades so the canonical deletes of ADR 83 cannot fail.
/** One row only when something differs from the default: removing the favorite deletes the row. */
export const userGameData = sqliteTable(
  "user_game_data",
  {
    canonicalGameId: text("canonical_game_id").primaryKey().references(() => canonicalGames.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull().references(() => users.id),
    favorite: integer("favorite").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [check("user_game_data_favorite_check", sql`${t.favorite} IN (0, 1)`)],
);

export const tags = sqliteTable(
  "tags",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id),
    name: text("name").notNull(),
    nameKey: text("name_key").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [uniqueIndex("tags_user_key_uq").on(t.userId, t.nameKey)],
);

export const gameTags = sqliteTable(
  "game_tags",
  {
    canonicalGameId: text("canonical_game_id").notNull().references(() => canonicalGames.id, { onDelete: "cascade" }),
    tagId: text("tag_id").notNull().references(() => tags.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull().references(() => users.id),
  },
  (t) => [primaryKey({ columns: [t.canonicalGameId, t.tagId] }), index("game_tags_tag_idx").on(t.tagId)],
);

export const collections = sqliteTable(
  "collections",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id),
    name: text("name").notNull(),
    nameKey: text("name_key").notNull(),
    position: integer("position").notNull(),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
    // ADR 88: NULL = the user's own collection; 'steam' = read-only mirror. Both null or both set (checked by the repository).
    sourceStore: text("source_store"),
    sourceId: text("source_id"),
  },
  (t) => [
    uniqueIndex("collections_user_key_uq").on(t.userId, t.nameKey).where(sql`${t.sourceStore} IS NULL`),
    uniqueIndex("collections_source_uq").on(t.userId, t.sourceStore, t.sourceId).where(sql`${t.sourceStore} IS NOT NULL`),
  ],
);

export const collectionGames = sqliteTable(
  "collection_games",
  {
    collectionId: text("collection_id").notNull().references(() => collections.id, { onDelete: "cascade" }),
    canonicalGameId: text("canonical_game_id").notNull().references(() => canonicalGames.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull().references(() => users.id),
    position: integer("position").notNull(),
    addedAt: integer("added_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.collectionId, t.canonicalGameId] }), index("collection_games_game_idx").on(t.canonicalGameId)],
);

// ---- ADR 86. Prices: links and cache are not user data (only `excluded` links are kept on disconnect); the watch list is.
export const priceLinks = sqliteTable(
  "price_links",
  {
    userId: text("user_id").notNull().references(() => users.id),
    canonicalGameId: text("canonical_game_id").notNull().references(() => canonicalGames.id, { onDelete: "cascade" }),
    service: text("service").notNull(),
    serviceGameId: text("service_game_id"),
    status: text("status").notNull(),
    source: text("source"),
    inputsHash: text("inputs_hash").notNull(),
    lookedUpAt: integer("looked_up_at").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.canonicalGameId, t.service] }),
    index("price_links_service_game_idx").on(t.userId, t.service, t.serviceGameId),
    check("price_links_service_check", sql`${t.service} IN ('itad')`),
    check("price_links_status_check", sql`${t.status} IN ('found', 'not-found', 'conflict', 'excluded')`),
    check("price_links_source_check", sql`${t.source} IS NULL OR ${t.source} IN ('steam', 'gog', 'title')`),
  ],
);

export const priceSnapshots = sqliteTable(
  "price_snapshots",
  {
    userId: text("user_id").notNull().references(() => users.id),
    service: text("service").notNull(),
    serviceGameId: text("service_game_id").notNull(),
    country: text("country").notNull(),
    shops: text("shops").notNull(),
    data: text("data", { mode: "json" }).$type<PriceSnapshotData>().notNull(),
    fetchedAt: integer("fetched_at").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.service, t.serviceGameId, t.country, t.shops] }),
    check("price_snapshots_service_check", sql`${t.service} IN ('itad')`),
    check("price_snapshots_country_check", sql`length(${t.country}) = 2`),
    check("price_snapshots_shops_check", sql`${t.shops} IN ('ludiary', 'all')`),
  ],
);

export const priceWatch = sqliteTable(
  "price_watch",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id),
    service: text("service").notNull(),
    serviceGameId: text("service_game_id").notNull(),
    title: text("title").notNull(),
    type: text("type"),
    addedAt: integer("added_at").notNull(),
    // ADR 86 point 17. Null for games of the library and for items followed before 0008_watch_media.
    coverUrl: text("cover_url"),
    coverFallbackUrl: text("cover_fallback_url"),
    // ADR 91 point 6. 'manual' (followed by hand) or the store whose wishlist import added it.
    origin: text("origin").notNull().default("manual"),
    originStoreGameId: text("origin_store_game_id"),
  },
  (t) => [
    uniqueIndex("price_watch_game_uq").on(t.userId, t.service, t.serviceGameId),
    check("price_watch_service_check", sql`${t.service} IN ('itad')`),
    check("price_watch_type_check", sql`${t.type} IS NULL OR ${t.type} IN ('game', 'dlc', 'package')`),
    check("price_watch_cover_check", sql`${t.coverUrl} IS NULL OR length(${t.coverUrl}) <= 2048`),
    check("price_watch_cover_fallback_check", sql`${t.coverFallbackUrl} IS NULL OR length(${t.coverFallbackUrl}) <= 2048`),
    check("price_watch_origin_check", sql`${t.origin} IN ('manual', 'steam', 'gog')`),
    check("price_watch_origin_pair_check", sql`(${t.origin} = 'manual') = (${t.originStoreGameId} IS NULL)`),
    index("price_watch_origin_idx").on(t.userId, t.origin),
  ],
);
