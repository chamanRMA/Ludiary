// Drizzle schema of migration 0001_library_scan (ADR 47, 72). Only what the first cut uses.
import { sql } from "drizzle-orm";
import { check, index, integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export interface MediaJson {
  coverUrl?: string;
  heroUrl?: string;
  iconUrl?: string;
}
export interface StoreMetadataJson {
  media?: MediaJson;
  externalIds?: Record<string, string>;
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
    title: text("title").notNull(),
    normalizedTitle: text("normalized_title").notNull(),
    owned: integer("owned").notNull().default(0),
    removedAt: integer("removed_at"),
    storeMetadata: text("store_metadata", { mode: "json" }).$type<StoreMetadataJson>(),
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
