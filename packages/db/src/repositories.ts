// Repositories that implement the persistence ports of @ludiary/core (ADR 38, 72) over Drizzle + better-sqlite3.
// Methods are async in the signature although the driver is synchronous, so the core is not tied to it.
import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, inArray, isNotNull, isNull, ne, notInArray, sql } from "drizzle-orm";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type Database from "better-sqlite3";
import { normalizeTitle, type EntryMedia, type I18nKey, type StoreId } from "@ludiary/contracts";
import { collectionManaged, collectionsKey, CoreError, emptyMirrorCounts, limitReached, LIMITS, nameTaken, planCollectionMirror } from "@ludiary/core";
import type {
  CollectionRecord,
  CoreLogger,
  Label,
  UserDataRepository,
  GameDetail,
  GameSummary,
  ConnectionRepository,
  IdentityRepository,
  InstallationRecord,
  LaunchTarget,
  LibraryPlan,
  LibraryRepository,
  PriceKind,
  PriceLinkRecord,
  PriceRepository,
  PriceSnapshotRecord,
  PriceWatchRecord,
  PropertyRecord,
  ScanPlan,
  ScanRootRecord,
  ScanRootRepository,
  SecretRepository,
  SettingsRepository,
  StoreConnectionRecord,
  SyncOperation,
  SyncStateRecord,
  SyncStateRepository,
} from "@ludiary/core";
import * as schema from "./schema";
import {
  canonicalGames,
  collectionGames,
  collections,
  devices,
  gameProperties,
  gameTags,
  installations,
  priceLinks,
  priceSnapshots,
  priceWatch,
  scanRoots,
  secrets as secretsTable,
  settings,
  storeConnections,
  syncState,
  tags,
  userGameData,
  users,
} from "./schema";

type Db = BetterSQLite3Database<typeof schema>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
const STORE_ORDER: readonly StoreId[] = ["steam", "gog", "epic", "ubisoft", "ea"];
const CHUNK = 500;
/** ADR 83: safety cap on the DLC shown in a game. */
const MAX_DLC = 1000;

export interface Repositories {
  identity: IdentityRepository;
  library: LibraryRepository;
  userData: UserDataRepository;
  scanRoots: ScanRootRepository;
  syncState: SyncStateRepository;
  settings: SettingsRepository;
  secrets: SecretRepository;
  connections: ConnectionRepository;
  prices: PriceRepository;
}

interface Scope {
  userId: string;
  deviceId: string;
}

const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

function chunks<T>(items: readonly T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += CHUNK) out.push(items.slice(i, i + CHUNK));
  return out;
}

/**
 * All repositories share one scope (the only user and the local device). `identity.ensure` sets it; using any
 * other repository before that is a programming error.
 */
export function createRepositories(sqlite: Database.Database, log?: Pick<CoreLogger, "warn">): Repositories {
  const db: Db = drizzle(sqlite, { schema });
  let scope: Scope | null = null;
  const need = (): Scope => {
    if (!scope) throw new Error("IdentityRepository.ensure must run before using the repositories");
    return scope;
  };

  const identity: IdentityRepository = {
    async ensure(newId, now) {
      const result = db.transaction((tx) => {
        let user = tx.select().from(users).orderBy(asc(users.createdAt), asc(users.id)).limit(1).get();
        if (!user) {
          user = { id: newId(), createdAt: now };
          tx.insert(users).values(user).run();
        }
        let device = tx
          .select()
          .from(devices)
          .where(and(eq(devices.userId, user.id), eq(devices.kind, "local")))
          .limit(1)
          .get();
        if (!device) {
          device = { id: newId(), userId: user.id, name: "local", kind: "local" };
          tx.insert(devices).values(device).run();
        }
        return { userId: user.id, deviceId: device.id };
      });
      scope = result;
      return result;
    },
  };

  const toProperty = (r: typeof gameProperties.$inferSelect): PropertyRecord => ({
    id: r.id,
    canonicalGameId: r.canonicalGameId,
    store: r.store as PropertyRecord["store"],
    storeGameId: r.storeGameId,
    kind: r.kind as "game" | "dlc",
    baseStoreGameId: r.baseStoreGameId,
    dlcInferred: r.storeMetadata?.dlcInferred === true,
    storePlaytimeMinutes: r.storePlaytimeMinutes,
    storeLastPlayedAt: r.storeLastPlayedAt,
    title: r.title,
    normalizedTitle: r.normalizedTitle,
    owned: r.owned === 1,
    removedAt: r.removedAt,
  });
  const toInstallation = (r: typeof installations.$inferSelect): InstallationRecord => ({
    id: r.id,
    propertyId: r.propertyId,
    deviceId: r.deviceId,
    installPath: r.installPath,
    launchData: r.launchData ?? null,
  });

  const installsOfDevice = (s: Scope) =>
    new Map(
      db
        .select()
        .from(installations)
        .where(and(eq(installations.userId, s.userId), eq(installations.deviceId, s.deviceId)))
        .all()
        .map((i) => [i.propertyId, i]),
    );

  /** Stores whose connection is `connected` (ADR 74). Any other store, with or without a row, does not sync. */
  const connectedStores = (s: Scope): ReadonlySet<string> =>
    new Set(
      db
        .select({ store: storeConnections.store })
        .from(storeConnections)
        .where(and(eq(storeConnections.userId, s.userId), eq(storeConnections.status, "connected")))
        .all()
        .map((r) => r.store),
    );

  /** ADR 85: favorites and tags of the user in two queries, for the whole library or for one game. */
  function userDataOf(s: Scope, canonicalId?: string): UserData {
    const favorites = new Set(
      db
        .select({ id: userGameData.canonicalGameId })
        .from(userGameData)
        .where(and(eq(userGameData.userId, s.userId), eq(userGameData.favorite, 1), canonicalId === undefined ? undefined : eq(userGameData.canonicalGameId, canonicalId)))
        .all()
        .map((r) => r.id),
    );
    const byGame = new Map<string, string[]>();
    const rows = db
      .select({ game: gameTags.canonicalGameId, name: tags.name })
      .from(gameTags)
      .innerJoin(tags, eq(tags.id, gameTags.tagId))
      .where(and(eq(gameTags.userId, s.userId), canonicalId === undefined ? undefined : eq(gameTags.canonicalGameId, canonicalId)))
      .orderBy(asc(tags.nameKey))
      .all();
    for (const r of rows) byGame.set(r.game, [...(byGame.get(r.game) ?? []), r.name]);
    return { favorites, tags: byGame };
  }

  function summary(
    g: typeof canonicalGames.$inferSelect,
    ps: (typeof gameProperties.$inferSelect)[],
    installed: ReadonlySet<string>,
    connected: ReadonlySet<string>,
    data: UserData,
  ): GameSummary {
    const stores = STORE_ORDER.filter((st) => ps.some((p) => p.store === st));
    // ADR 71: when a Steam property exists its artwork wins; otherwise the first store, in STORE_ORDER, that has some (ADR 76).
    const art =
      ps.find((p) => p.store === "steam") ??
      STORE_ORDER.map((st) => ps.find((p) => p.store === st && (p.storeMetadata?.resolvedMedia || p.storeMetadata?.media))).find(Boolean);
    const scanned: EntryMedia = art?.storeMetadata?.media ?? g.media ?? {};
    const resolved = art?.storeMetadata?.resolvedMedia; // ADR 73: field by field
    const media: EntryMedia = {
      ...(resolved?.coverUrl ?? scanned.coverUrl ? { coverUrl: resolved?.coverUrl ?? scanned.coverUrl } : {}),
      ...(resolved?.heroUrl ?? scanned.heroUrl ? { heroUrl: resolved?.heroUrl ?? scanned.heroUrl } : {}),
    };
    const isInstalled = ps.some((p) => installed.has(p.id));
    // ADR 56, 74: per property the larger of the store's time and ours (ours is 0 until cut 2b); per game the sum.
    const playtimeMinutes = ps.reduce((sum, p) => sum + (p.storePlaytimeMinutes ?? 0), 0);
    const lastPlayedAt = ps.reduce<number | null>((m, p) => (p.storeLastPlayedAt !== null && (m === null || p.storeLastPlayedAt > m) ? p.storeLastPlayedAt : m), null);
    return {
      id: g.id,
      title: g.title,
      ...(media.coverUrl ? { coverUrl: media.coverUrl } : {}),
      ...(media.heroUrl ? { coverFallbackUrl: media.heroUrl } : {}),
      stores,
      installed: isInstalled,
      favorite: data.favorites.has(g.id),
      playtimeMinutes,
      ...(lastPlayedAt !== null ? { lastPlayedAt } : {}),
      tags: data.tags.get(g.id) ?? [],
      // The core narrows mainAction by connector capabilities and mode (it knows them; the repository does not).
      mainAction: isInstalled ? "play" : ps.some((p) => p.owned === 1) ? "install" : null,
      // ADR 74 point 12: computed on read. An installed game never has the veil.
      unsynced: !isInstalled && ps.length > 0 && ps.every((p) => p.store !== "manual" && !connected.has(p.store)),
    };
  }

  const library: LibraryRepository = {
    async listLibrary() {
      const s = need();
      const props = db
        .select()
        .from(gameProperties)
        .where(and(eq(gameProperties.userId, s.userId), isNull(gameProperties.removedAt), eq(gameProperties.kind, "game")))
        .all();
      const installed = new Set(installsOfDevice(s).keys());
      const connected = connectedStores(s);
      const byCanonical = new Map<string, (typeof props)[number][]>();
      for (const p of props) {
        if (!p.canonicalGameId) continue;
        const list = byCanonical.get(p.canonicalGameId) ?? [];
        list.push(p);
        byCanonical.set(p.canonicalGameId, list);
      }
      const games = db
        .select()
        .from(canonicalGames)
        .where(eq(canonicalGames.userId, s.userId))
        .orderBy(asc(canonicalGames.normalizedTitle), asc(canonicalGames.title), asc(canonicalGames.id))
        .all();
      const data = userDataOf(s);
      const out: GameSummary[] = [];
      for (const g of games) {
        const ps = byCanonical.get(g.id);
        if (ps && ps.length > 0) out.push(summary(g, ps, installed, connected, data));
      }
      return out;
    },

    async getGame(canonicalId) {
      const s = need();
      const g = db
        .select()
        .from(canonicalGames)
        .where(and(eq(canonicalGames.id, canonicalId), eq(canonicalGames.userId, s.userId)))
        .get();
      if (!g) return null;
      const all = db
        .select()
        .from(gameProperties)
        .where(and(eq(gameProperties.canonicalGameId, canonicalId), eq(gameProperties.userId, s.userId), isNull(gameProperties.removedAt)))
        .all();
      const games = all.filter((p) => p.kind === "game");
      if (games.length === 0) return null;
      const inst = installsOfDevice(s);
      // ADR 84: a title resolved by the store wins over the scan's placeholder, and the order follows it.
      const shown = (p: (typeof all)[number]) => p.storeMetadata?.resolvedTitle ?? p.title;
      const sortKey = (p: (typeof all)[number]) => (p.storeMetadata?.resolvedTitle ? normalizeTitle(p.storeMetadata.resolvedTitle) : p.normalizedTitle);
      const allDlc = all
        .filter((p) => p.kind === "dlc" && p.store !== "manual")
        .sort((a, b) => cmp(sortKey(a), sortKey(b)) || cmp(a.id, b.id));
      if (allDlc.length > MAX_DLC) log?.warn("A game has more DLC than can be shown; the list was cut", { dlc: allDlc.length, shown: MAX_DLC });
      const dlc = allDlc.slice(0, MAX_DLC);
      const detail: GameDetail = {
        ...summary(g, games, new Set(inst.keys()), connectedStores(s), userDataOf(s, canonicalId)),
        // The core fills `actions` from the connector capabilities; the repository does not know them.
        properties: games.map((p) => {
          const i = inst.get(p.id);
          return {
            id: p.id,
            store: p.store as StoreId | "manual",
            installed: i !== undefined,
            owned: p.owned === 1,
            ...(i ? { installPath: i.installPath } : {}),
            actions: [],
          };
        }),
        dlc: dlc.map((p) => ({ id: p.id, title: shown(p), store: p.store as StoreId, installed: inst.has(p.id) })),
        collections: db
          .select({ id: collections.id, name: collections.name, source: sql<StoreId | null>`${collections.sourceStore}` })
          .from(collectionGames)
          .innerJoin(collections, eq(collections.id, collectionGames.collectionId))
          .where(and(eq(collectionGames.canonicalGameId, canonicalId), eq(collectionGames.userId, s.userId)))
          .orderBy(asc(collections.position), asc(collections.id))
          .all(),
      };
      return detail;
    },

    async getLaunchTargets(canonicalId) {
      const s = need();
      const props = db
        .select()
        .from(gameProperties)
        .where(and(eq(gameProperties.canonicalGameId, canonicalId), eq(gameProperties.userId, s.userId)))
        .all();
      const inst = installsOfDevice(s);
      return props.map((p): LaunchTarget => {
        const i = inst.get(p.id);
        return { canonicalGameId: canonicalId, property: toProperty(p), installation: i ? toInstallation(i) : null };
      });
    },

    async listProperties(store) {
      const s = need();
      return db
        .select()
        .from(gameProperties)
        .where(and(eq(gameProperties.userId, s.userId), eq(gameProperties.store, store)))
        .all()
        .map(toProperty);
    },

    async listInstallations(store) {
      const s = need();
      return db
        .select({ i: installations })
        .from(installations)
        .innerJoin(gameProperties, eq(gameProperties.id, installations.propertyId))
        .where(
          and(
            eq(installations.userId, s.userId),
            eq(gameProperties.userId, s.userId),
            eq(installations.deviceId, s.deviceId),
            eq(installations.detectedBy, "scan"),
            eq(gameProperties.store, store),
          ),
        )
        .all()
        .map((r) => toInstallation(r.i));
    },

    async listMediaPending(store, olderThan, limit) {
      const s = need();
      const resolvedAt = sql`json_extract(${gameProperties.storeMetadata}, '$.mediaResolvedAt')`;
      return db
        .select({ id: gameProperties.storeGameId })
        .from(gameProperties)
        .where(
          and(
            eq(gameProperties.userId, s.userId),
            eq(gameProperties.store, store),
            eq(gameProperties.kind, "game"),
            isNull(gameProperties.removedAt),
            sql`${gameProperties.storeGameId} IS NOT NULL`,
            sql`(${resolvedAt} IS NULL OR ${resolvedAt} < ${olderThan})`,
          ),
        )
        .orderBy(sql`coalesce(${resolvedAt}, 0)`, asc(gameProperties.storeGameId))
        .limit(limit)
        .all()
        .map((r) => r.id as string);
    },

    async setResolvedMedia(store, media, requested, at) {
      const s = need();
      db.transaction((tx) => {
        for (const part of chunks(requested)) {
          const rows = tx
            .select()
            .from(gameProperties)
            .where(
              and(
                eq(gameProperties.userId, s.userId),
                eq(gameProperties.store, store),
                eq(gameProperties.kind, "game"),
                inArray(gameProperties.storeGameId, part),
              ),
            )
            .all();
          for (const r of rows) {
            const m = media.get(r.storeGameId as string);
            tx.update(gameProperties)
              .set({ storeMetadata: { ...(r.storeMetadata ?? {}), resolvedMedia: m ? { ...m } : {}, mediaResolvedAt: at } })
              .where(and(eq(gameProperties.id, r.id), eq(gameProperties.userId, s.userId)))
              .run();
          }
        }
      });
    },

    async listTitlePending(store, olderThan, limit) {
      const s = need();
      const resolvedAt = sql`json_extract(${gameProperties.storeMetadata}, '$.titleResolvedAt')`;
      return db
        .select({ id: gameProperties.storeGameId })
        .from(gameProperties)
        .where(
          and(
            eq(gameProperties.userId, s.userId),
            eq(gameProperties.store, store),
            eq(gameProperties.kind, "dlc"),
            isNull(gameProperties.removedAt),
            sql`${gameProperties.storeGameId} IS NOT NULL`,
            sql`(${resolvedAt} IS NULL OR ${resolvedAt} < ${olderThan})`,
          ),
        )
        .orderBy(sql`coalesce(${resolvedAt}, 0)`, asc(gameProperties.storeGameId))
        .limit(limit)
        .all()
        .map((r) => r.id as string);
    },

    async setResolvedTitles(store, titles, requested, at) {
      const s = need();
      db.transaction((tx) => {
        for (const part of chunks(requested)) {
          const rows = tx
            .select()
            .from(gameProperties)
            .where(
              and(
                eq(gameProperties.userId, s.userId),
                eq(gameProperties.store, store),
                eq(gameProperties.kind, "dlc"),
                inArray(gameProperties.storeGameId, part),
              ),
            )
            .all();
          for (const r of rows) {
            const t = titles.get(r.storeGameId as string);
            // Only a valid title replaces the previous one; the stamp is written either way (ADR 84 point 10).
            tx.update(gameProperties)
              .set({ storeMetadata: { ...(r.storeMetadata ?? {}), titleResolvedAt: at, ...(t ? { resolvedTitle: t } : {}) } })
              .where(and(eq(gameProperties.id, r.id), eq(gameProperties.userId, s.userId), eq(gameProperties.kind, "dlc"), eq(gameProperties.store, store)))
              .run();
          }
        }
      });
    },

    async applyLibraryPlan(plan) {
      const s = need();
      db.transaction((tx) => applyLibrary(tx, s, plan, log));
    },
    async countOwned(store) {
      const s = need();
      return db
        .select({ n: sql<number>`count(*)` })
        .from(gameProperties)
        .where(
          and(
            eq(gameProperties.userId, s.userId),
            eq(gameProperties.store, store),
            eq(gameProperties.kind, "game"),
            eq(gameProperties.owned, 1),
            isNull(gameProperties.removedAt),
          ),
        )
        .get()!.n;
    },

    async findVisibleCanonicals(store) {
      const s = need();
      const rows = db
        .select({ storeGameId: gameProperties.storeGameId, canonicalId: gameProperties.canonicalGameId, kind: gameProperties.kind, removedAt: gameProperties.removedAt })
        .from(gameProperties)
        .where(and(eq(gameProperties.userId, s.userId), eq(gameProperties.store, store)))
        .all();
      const shown = shownCanonicals(db, s);
      const games = new Map<string, string>();
      const dlc = new Set<string>();
      for (const r of rows) {
        if (r.storeGameId === null) continue;
        if (r.kind === "game" && r.canonicalId !== null && shown.has(r.canonicalId)) games.set(r.storeGameId, r.canonicalId);
        else if (r.kind === "dlc" && r.removedAt === null) dlc.add(r.storeGameId);
      }
      return { games, dlc };
    },

    async applyScanPlan(plan) {
      const s = need();
      db.transaction((tx) => applyPlan(tx, s, plan, log));
    },
  };

  const userData: UserDataRepository = {
    async updateGame(canonicalId, patch, at) {
      const s = need();
      db.transaction((tx) => {
        // Checked again inside the transaction: the game or a collection may have gone since the core looked (ADR 85 point 12).
        if (!isShown(tx, s, canonicalId)) throw new CoreError("not-found", "The game is not shown");
        if (patch.favorite === true) {
          tx.insert(userGameData)
            .values({ canonicalGameId: canonicalId, userId: s.userId, favorite: 1, updatedAt: at })
            .onConflictDoUpdate({ target: userGameData.canonicalGameId, set: { favorite: 1, updatedAt: at } })
            .run();
        } else if (patch.favorite === false) {
          tx.delete(userGameData).where(and(eq(userGameData.canonicalGameId, canonicalId), eq(userGameData.userId, s.userId))).run();
        }
        if (patch.tags) setTags(tx, s, canonicalId, patch.tags, at);
        if (patch.collectionIds) setCollections(tx, s, canonicalId, patch.collectionIds, at);
      });
    },
    async listCollections() {
      return readCollections(db, need());
    },
    async createCollection(label, at) {
      const s = need();
      return db.transaction((tx) => {
        // ADR 88 point 15: the limit and the name are about the user's own collections; mirrors have their own cap.
        if (countOwn(tx, s) >= LIMITS.collections) throw limitReached(LIMITS.collections, "collections");
        if (tx.select().from(collections).where(and(eq(collections.userId, s.userId), isNull(collections.sourceStore), eq(collections.nameKey, label.key))).get()) throw nameTaken();
        const last = tx.select({ m: sql<number>`coalesce(max(${collections.position}), 0)` }).from(collections).where(eq(collections.userId, s.userId)).get()!.m;
        const id = randomUUID();
        tx.insert(collections).values({ id, userId: s.userId, name: label.name, nameKey: label.key, position: last + 1, createdAt: at, updatedAt: at }).run();
        return { id, name: label.name, source: null, gameIds: [] };
      });
    },
    async renameCollection(id, label, at) {
      const s = need();
      return db.transaction((tx) => {
        const row = tx.select().from(collections).where(and(eq(collections.id, id), eq(collections.userId, s.userId))).get();
        if (!row) throw new CoreError("not-found", "The collection does not exist");
        if (row.sourceStore !== null) throw collectionManaged(row.sourceStore as StoreId);
        const clash = tx.select({ id: collections.id }).from(collections).where(and(eq(collections.userId, s.userId), isNull(collections.sourceStore), eq(collections.nameKey, label.key))).get();
        if (clash && clash.id !== id) throw nameTaken();
        tx.update(collections).set({ name: label.name, nameKey: label.key, updatedAt: at }).where(and(eq(collections.id, id), isNull(collections.sourceStore))).run();
        return readCollections(tx, s, id)[0] as CollectionRecord;
      });
    },
    async deleteCollection(id) {
      const s = need();
      db.transaction((tx) => {
        const row = tx.select({ sourceStore: collections.sourceStore }).from(collections).where(and(eq(collections.id, id), eq(collections.userId, s.userId))).get();
        if (row && row.sourceStore !== null) throw collectionManaged(row.sourceStore as StoreId);
        tx.delete(collections).where(and(eq(collections.id, id), eq(collections.userId, s.userId), isNull(collections.sourceStore))).run();
      });
    },
    async applyCollectionMirror(store, input, at) {
      const s = need();
      return db.transaction((tx) => {
        type Name = Parameters<typeof collectionsKey>[1];
        const setting = (name: Name): unknown => tx.select().from(settings).where(and(eq(settings.userId, s.userId), eq(settings.key, collectionsKey(store, name)))).get()?.value;
        const put = (name: Name, value: unknown) =>
          tx.insert(settings).values({ userId: s.userId, key: collectionsKey(store, name), value }).onConflictDoUpdate({ target: [settings.userId, settings.key], set: { value } }).run();
        // The setting is read again here: a switch-off during the pass must leave nothing behind (ADR 88 point 15).
        if (setting("enabled") === false) return { ...emptyMirrorCounts(), off: true };
        const rows = tx.select().from(collections).where(and(eq(collections.userId, s.userId), eq(collections.sourceStore, store))).orderBy(asc(collections.position), asc(collections.id)).all();
        const members = new Map<string, string[]>(rows.map((r) => [r.id, []]));
        if (rows.length > 0) {
          const links = tx.select().from(collectionGames).where(and(eq(collectionGames.userId, s.userId), inArray(collectionGames.collectionId, rows.map((r) => r.id)))).orderBy(asc(collectionGames.position), asc(collectionGames.canonicalGameId)).all();
          for (const l of links) members.get(l.collectionId)?.push(l.canonicalGameId);
        }
        const seenRaw = setting("favoritesSeen");
        const plan = planCollectionMirror(input, {
          mirrors: rows.map((r) => ({ id: r.id, sourceId: r.sourceId as string, name: r.name, nameKey: r.nameKey, members: members.get(r.id) ?? [] })),
          shown: shownCanonicals(tx, s),
          favorites: new Set(tx.select({ id: userGameData.canonicalGameId }).from(userGameData).where(and(eq(userGameData.userId, s.userId), eq(userGameData.favorite, 1))).all().map((r) => r.id)),
          favoritesSeen: new Set(Array.isArray(seenRaw) ? seenRaw.filter((x): x is string => typeof x === "string") : []),
        });
        // Links of a mirror = the wanted list, in order: missing ones inserted, extra ones deleted, positions rewritten only where they differ.
        const syncLinks = (collectionId: string, wanted: readonly string[]) => {
          const current = new Map(tx.select().from(collectionGames).where(eq(collectionGames.collectionId, collectionId)).all().map((l) => [l.canonicalGameId, l]));
          const keep = new Set(wanted);
          for (const id of current.keys()) {
            if (!keep.has(id)) tx.delete(collectionGames).where(and(eq(collectionGames.collectionId, collectionId), eq(collectionGames.canonicalGameId, id))).run();
          }
          wanted.forEach((canonicalGameId, i) => {
            const have = current.get(canonicalGameId);
            if (!have) tx.insert(collectionGames).values({ collectionId, canonicalGameId, userId: s.userId, position: i + 1, addedAt: at }).run();
            else if (have.position !== i + 1) tx.update(collectionGames).set({ position: i + 1 }).where(and(eq(collectionGames.collectionId, collectionId), eq(collectionGames.canonicalGameId, canonicalGameId))).run();
          });
        };
        let position = tx.select({ m: sql<number>`coalesce(max(${collections.position}), 0)` }).from(collections).where(eq(collections.userId, s.userId)).get()!.m;
        for (const c of plan.create) {
          const id = randomUUID();
          tx.insert(collections).values({ id, userId: s.userId, name: c.name, nameKey: c.key, position: ++position, createdAt: at, updatedAt: at, sourceStore: store, sourceId: c.sourceId }).run();
          syncLinks(id, c.gameIds);
        }
        for (const u of plan.update) {
          if (u.gameIds) syncLinks(u.id, u.gameIds);
          tx.update(collections).set({ ...(u.rename ? { name: u.rename.name, nameKey: u.rename.key } : {}), updatedAt: at }).where(and(eq(collections.id, u.id), eq(collections.sourceStore, store))).run();
        }
        if (plan.remove.length > 0) tx.delete(collections).where(and(eq(collections.userId, s.userId), eq(collections.sourceStore, store), inArray(collections.id, plan.remove))).run();
        for (const canonicalGameId of plan.favorites) {
          tx.insert(userGameData)
            .values({ canonicalGameId, userId: s.userId, favorite: 1, updatedAt: at })
            .onConflictDoUpdate({ target: userGameData.canonicalGameId, set: { favorite: 1, updatedAt: at } })
            .run();
        }
        if (plan.favoritesSeen) put("favoritesSeen", plan.favoritesSeen);
        if (setting("mirrorAccountSource") !== input.accountSource) put("mirrorAccountSource", input.accountSource);
        return plan.counts;
      });
    },
    async deleteCollectionMirrors(store) {
      const s = need();
      return db.transaction((tx) => {
        const n = tx.delete(collections).where(and(eq(collections.userId, s.userId), eq(collections.sourceStore, store))).run().changes;
        tx.delete(settings).where(and(eq(settings.userId, s.userId), eq(settings.key, collectionsKey(store, "mirrorAccountSource")))).run();
        return n;
      });
    },
    async mergeUserData(from, to, at) {
      const s = need();
      db.transaction((tx) => mergeInTx(tx, s, from, to, at));
    },
  };

  const roots: ScanRootRepository = {
    async list() {
      const s = need();
      return db
        .select()
        .from(scanRoots)
        .where(and(eq(scanRoots.userId, s.userId), eq(scanRoots.deviceId, s.deviceId)))
        .orderBy(asc(scanRoots.origin), asc(scanRoots.pathKey))
        .all()
        .map(toRoot);
    },
    async get(id) {
      const s = need();
      const r = db
        .select()
        .from(scanRoots)
        .where(and(eq(scanRoots.id, id), eq(scanRoots.userId, s.userId)))
        .get();
      return r ? toRoot(r) : null;
    },
    async addUser(root) {
      const s = need();
      const res = db
        .insert(scanRoots)
        .values({
          id: root.id,
          userId: s.userId,
          deviceId: s.deviceId,
          origin: "user",
          path: root.path,
          pathKey: root.pathKey,
          declarationId: null,
          store: null,
          tag: null,
          enabled: root.enabled ? 1 : 0,
        })
        .onConflictDoNothing()
        .run();
      if (res.changes === 0) return null;
      return { ...root, origin: "user", declarationId: null, store: null, tag: null };
    },
    async setEnabled(id, enabled) {
      const s = need();
      db.update(scanRoots)
        .set({ enabled: enabled ? 1 : 0 })
        .where(and(eq(scanRoots.id, id), eq(scanRoots.userId, s.userId)))
        .run();
    },
    async remove(id) {
      const s = need();
      return (
        db
          .delete(scanRoots)
          .where(and(eq(scanRoots.id, id), eq(scanRoots.userId, s.userId), eq(scanRoots.origin, "user")))
          .run().changes > 0
      );
    },
  };

  const sync: SyncStateRepository = {
    async get(store, operation) {
      const s = need();
      const r = db
        .select()
        .from(syncState)
        .where(and(eq(syncState.userId, s.userId), eq(syncState.store, store), eq(syncState.operation, operation)))
        .get();
      return r ? toSync(r) : null;
    },
    async list() {
      const s = need();
      return db
        .select()
        .from(syncState)
        .where(eq(syncState.userId, s.userId))
        .orderBy(asc(syncState.store), asc(syncState.operation))
        .all()
        .map(toSync);
    },
    async put(state) {
      putSync(db, need(), state);
    },
    async delete(store, operation) {
      const s = need();
      db.delete(syncState)
        .where(and(eq(syncState.userId, s.userId), eq(syncState.store, store), eq(syncState.operation, operation)))
        .run();
    },
    async resetRunning() {
      const s = need();
      return db
        .update(syncState)
        .set({ status: "idle" })
        .where(and(eq(syncState.userId, s.userId), eq(syncState.status, "running")))
        .run().changes;
    },
  };

  const settingsRepo: SettingsRepository = {
    async get(key) {
      const s = need();
      const r = db
        .select()
        .from(settings)
        .where(and(eq(settings.userId, s.userId), eq(settings.key, key)))
        .get();
      return r ? r.value : undefined;
    },
    async set(key, value) {
      const s = need();
      db.insert(settings)
        .values({ userId: s.userId, key, value })
        .onConflictDoUpdate({ target: [settings.userId, settings.key], set: { value } })
        .run();
    },
    async delete(key) {
      const s = need();
      db.delete(settings).where(and(eq(settings.userId, s.userId), eq(settings.key, key))).run();
    },
  };

  const secrets: SecretRepository = {
    async get(scope, name) {
      const s = need();
      const r = db
        .select()
        .from(secretsTable)
        .where(and(eq(secretsTable.userId, s.userId), eq(secretsTable.scope, scope), eq(secretsTable.name, name)))
        .get();
      return r ? { scope: r.scope, name: r.name, ciphertext: r.ciphertext, keyId: r.keyId, updatedAt: r.updatedAt } : null;
    },
    async put(rec) {
      const s = need();
      const values = { ciphertext: rec.ciphertext, keyId: rec.keyId, updatedAt: rec.updatedAt };
      db.insert(secretsTable)
        .values({ id: randomUUID(), userId: s.userId, scope: rec.scope, name: rec.name, ...values })
        .onConflictDoUpdate({ target: [secretsTable.userId, secretsTable.scope, secretsTable.name], set: values })
        .run();
    },
    async delete(scope, name) {
      const s = need();
      db.delete(secretsTable).where(and(eq(secretsTable.userId, s.userId), eq(secretsTable.scope, scope), eq(secretsTable.name, name))).run();
    },
    async deleteScope(scope) {
      const s = need();
      return db.delete(secretsTable).where(and(eq(secretsTable.userId, s.userId), eq(secretsTable.scope, scope))).run().changes;
    },
  };

  const toConnection = (r: typeof storeConnections.$inferSelect): StoreConnectionRecord => ({
    store: r.store as StoreId,
    status: r.status as "connected" | "expired",
    accountLabel: r.accountLabel,
    connectedAt: r.connectedAt,
  });
  const connections: ConnectionRepository = {
    async get(store) {
      const s = need();
      const r = db.select().from(storeConnections).where(and(eq(storeConnections.userId, s.userId), eq(storeConnections.store, store))).get();
      return r ? toConnection(r) : null;
    },
    async list() {
      const s = need();
      return db.select().from(storeConnections).where(eq(storeConnections.userId, s.userId)).orderBy(asc(storeConnections.store)).all().map(toConnection);
    },
    async put(rec) {
      const s = need();
      const values = { status: rec.status, accountLabel: rec.accountLabel, connectedAt: rec.connectedAt };
      db.insert(storeConnections)
        .values({ userId: s.userId, store: rec.store, ...values })
        .onConflictDoUpdate({ target: [storeConnections.userId, storeConnections.store], set: values })
        .run();
    },
    async setStatus(store, status) {
      const s = need();
      db.update(storeConnections).set({ status }).where(and(eq(storeConnections.userId, s.userId), eq(storeConnections.store, store))).run();
    },
    async delete(store) {
      const s = need();
      db.delete(storeConnections).where(and(eq(storeConnections.userId, s.userId), eq(storeConnections.store, store))).run();
    },
  };

  const toLink = (r: typeof priceLinks.$inferSelect): PriceLinkRecord => ({
    canonicalGameId: r.canonicalGameId,
    service: r.service as PriceLinkRecord["service"],
    serviceGameId: r.serviceGameId,
    status: r.status as PriceLinkRecord["status"],
    source: r.source as PriceLinkRecord["source"],
    inputsHash: r.inputsHash,
    lookedUpAt: r.lookedUpAt,
  });
  const toWatch = (r: typeof priceWatch.$inferSelect): PriceWatchRecord => ({
    id: r.id,
    service: r.service as PriceWatchRecord["service"],
    serviceGameId: r.serviceGameId,
    title: r.title,
    type: r.type as PriceKind | null,
    ...(r.coverUrl ? { coverUrl: r.coverUrl } : {}),
    ...(r.coverFallbackUrl ? { coverFallbackUrl: r.coverFallbackUrl } : {}),
    addedAt: r.addedAt,
    origin: r.origin as PriceWatchRecord["origin"],
    originStoreGameId: r.originStoreGameId,
  });
  // ADR 86 point 8. Links and cache are rebuildable; the watch list is the user's.
  const prices: PriceRepository = {
    async getLinks(service, canonicalIds) {
      const s = need();
      const out = new Map<string, PriceLinkRecord>();
      for (const part of chunks(canonicalIds)) {
        const rows = db.select().from(priceLinks).where(and(eq(priceLinks.userId, s.userId), eq(priceLinks.service, service), inArray(priceLinks.canonicalGameId, part))).all();
        for (const r of rows) out.set(r.canonicalGameId, toLink(r));
      }
      return out;
    },
    async putLink(rec) {
      const s = need();
      if (!db.select({ id: canonicalGames.id }).from(canonicalGames).where(and(eq(canonicalGames.userId, s.userId), eq(canonicalGames.id, rec.canonicalGameId))).get()) {
        throw new CoreError("not-found", "The game does not exist");
      }
      const values = { serviceGameId: rec.serviceGameId, status: rec.status, source: rec.source, inputsHash: rec.inputsHash, lookedUpAt: rec.lookedUpAt };
      db.insert(priceLinks)
        .values({ userId: s.userId, canonicalGameId: rec.canonicalGameId, service: rec.service, ...values })
        .onConflictDoUpdate({ target: [priceLinks.userId, priceLinks.canonicalGameId, priceLinks.service], set: values })
        .run();
    },
    async deleteLink(service, canonicalId) {
      const s = need();
      db.delete(priceLinks).where(and(eq(priceLinks.userId, s.userId), eq(priceLinks.service, service), eq(priceLinks.canonicalGameId, canonicalId))).run();
    },
    async findOwned(service, serviceGameIds) {
      const s = need();
      const out = new Map<string, string>();
      for (const part of chunks(serviceGameIds)) {
        // Oldest lookup wins when two games share an id; only games that are shown (a non-retired `game` property).
        const rows = db
          .select({ sid: priceLinks.serviceGameId, cid: priceLinks.canonicalGameId })
          .from(priceLinks)
          .where(and(eq(priceLinks.userId, s.userId), eq(priceLinks.service, service), eq(priceLinks.status, "found"), inArray(priceLinks.serviceGameId, part), sql`EXISTS (SELECT 1 FROM game_properties gp WHERE gp.canonical_game_id = ${priceLinks.canonicalGameId} AND gp.removed_at IS NULL AND gp.kind = 'game')`))
          .orderBy(desc(priceLinks.lookedUpAt))
          .all();
        for (const r of rows) if (r.sid !== null) out.set(r.sid, r.cid);
      }
      return out;
    },
    async getSnapshots(service, serviceGameIds, country, shops) {
      const s = need();
      const out = new Map<string, PriceSnapshotRecord>();
      for (const part of chunks(serviceGameIds)) {
        const rows = db
          .select()
          .from(priceSnapshots)
          .where(and(eq(priceSnapshots.userId, s.userId), eq(priceSnapshots.service, service), eq(priceSnapshots.country, country), eq(priceSnapshots.shops, shops), inArray(priceSnapshots.serviceGameId, part)))
          .all();
        for (const r of rows) {
          out.set(r.serviceGameId, { service, serviceGameId: r.serviceGameId, country: r.country, shops: r.shops as PriceSnapshotRecord["shops"], data: r.data, fetchedAt: r.fetchedAt });
        }
      }
      return out;
    },
    async putSnapshots(records) {
      const s = need();
      db.transaction((tx) => {
        for (const r of records) {
          const values = { data: r.data, fetchedAt: r.fetchedAt };
          tx.insert(priceSnapshots)
            .values({ userId: s.userId, service: r.service, serviceGameId: r.serviceGameId, country: r.country, shops: r.shops, ...values })
            .onConflictDoUpdate({ target: [priceSnapshots.userId, priceSnapshots.service, priceSnapshots.serviceGameId, priceSnapshots.country, priceSnapshots.shops], set: values })
            .run();
        }
      });
    },
    async listWatch(service) {
      const s = need();
      return db.select().from(priceWatch).where(and(eq(priceWatch.userId, s.userId), eq(priceWatch.service, service))).orderBy(asc(priceWatch.addedAt), asc(priceWatch.id)).all().map(toWatch);
    },
    async getWatch(id) {
      const s = need();
      const r = db.select().from(priceWatch).where(and(eq(priceWatch.userId, s.userId), eq(priceWatch.id, id))).get();
      return r ? toWatch(r) : null;
    },
    async addWatch(rec, max) {
      const s = need();
      return db.transaction((tx) => {
        const old = tx.select().from(priceWatch).where(and(eq(priceWatch.userId, s.userId), eq(priceWatch.service, rec.service), eq(priceWatch.serviceGameId, rec.serviceGameId))).get();
        if (old) return { record: toWatch(old), created: false };
        if (countOf(tx, priceWatch, s.userId) >= max) throw limitReached(max, "watch");
        tx.insert(priceWatch).values({ id: rec.id, userId: s.userId, service: rec.service, serviceGameId: rec.serviceGameId, title: rec.title, type: rec.type, coverUrl: rec.coverUrl ?? null, coverFallbackUrl: rec.coverFallbackUrl ?? null, addedAt: rec.addedAt, origin: rec.origin, originStoreGameId: rec.originStoreGameId }).run();
        return { record: rec, created: true };
      });
    },
    async deleteWatch(id) {
      const s = need();
      db.delete(priceWatch).where(and(eq(priceWatch.userId, s.userId), eq(priceWatch.id, id))).run();
    },
    async applyWishlistImport(plan, max) {
      const s = need();
      return db.transaction((tx) => {
        let removed = 0;
        for (const id of plan.remove) removed += tx.delete(priceWatch).where(and(eq(priceWatch.userId, s.userId), eq(priceWatch.id, id))).run().changes;
        for (const r of plan.rekey) tx.update(priceWatch).set({ originStoreGameId: r.originStoreGameId }).where(and(eq(priceWatch.userId, s.userId), eq(priceWatch.id, r.id), ne(priceWatch.origin, "manual"))).run();
        let added = 0;
        for (const rec of plan.add) {
          const old = tx.select({ id: priceWatch.id }).from(priceWatch).where(and(eq(priceWatch.userId, s.userId), eq(priceWatch.service, rec.service), eq(priceWatch.serviceGameId, rec.serviceGameId))).get();
          if (old) continue; // followed meanwhile: it stays as it is
          if (countOf(tx, priceWatch, s.userId) >= max) throw limitReached(max, "watch"); // rolls everything back
          tx.insert(priceWatch).values({ id: rec.id, userId: s.userId, service: rec.service, serviceGameId: rec.serviceGameId, title: rec.title, type: rec.type, coverUrl: rec.coverUrl ?? null, coverFallbackUrl: rec.coverFallbackUrl ?? null, addedAt: rec.addedAt, origin: rec.origin, originStoreGameId: rec.originStoreGameId }).run();
          added++;
        }
        return { added, removed };
      });
    },
    async clearService(service) {
      const s = need();
      db.transaction((tx) => {
        tx.delete(priceSnapshots).where(and(eq(priceSnapshots.userId, s.userId), eq(priceSnapshots.service, service))).run();
        tx.delete(priceLinks).where(and(eq(priceLinks.userId, s.userId), eq(priceLinks.service, service), ne(priceLinks.status, "excluded"))).run();
      });
    },
  };

  return { identity, library, userData, scanRoots: roots, syncState: sync, settings: settingsRepo, secrets, connections, prices };
}

function toRoot(r: typeof scanRoots.$inferSelect): ScanRootRecord {
  return {
    id: r.id,
    origin: r.origin as "user" | "discovered",
    path: r.path,
    pathKey: r.pathKey,
    declarationId: r.declarationId,
    store: r.store as StoreId | null,
    tag: r.tag,
    enabled: r.enabled === 1,
  };
}

function toSync(r: typeof syncState.$inferSelect): SyncStateRecord {
  return {
    store: r.store as StoreId,
    operation: r.operation as SyncOperation,
    lastAttemptAt: r.lastAttemptAt,
    lastSuccessAt: r.lastSuccessAt,
    status: r.status as SyncStateRecord["status"],
    error: r.errorCode
      ? {
          code: r.errorCode as NonNullable<SyncStateRecord["error"]>["code"],
          key: (r.errorKey ?? "") as I18nKey,
          ...(r.errorParams ? { params: r.errorParams } : {}),
        }
      : null,
    nextAllowedAt: r.nextAllowedAt,
  };
}

function putSync(db: Db | Tx, s: Scope, st: SyncStateRecord): void {
  const values = {
    userId: s.userId,
    store: st.store,
    operation: st.operation,
    lastAttemptAt: st.lastAttemptAt,
    lastSuccessAt: st.lastSuccessAt,
    status: st.status,
    errorCode: st.error?.code ?? null,
    errorKey: st.error?.key ?? null,
    errorParams: st.error?.params ? { ...st.error.params } : null,
    nextAllowedAt: st.nextAllowedAt,
  };
  db.insert(syncState)
    .values(values)
    .onConflictDoUpdate({ target: [syncState.userId, syncState.store, syncState.operation], set: values })
    .run();
}

const isFollowing = (canonicalId: string, userId: string) =>
  // ADR 83: only a canonical game with exactly one live `game` property follows its store title and artwork.
  sql`(SELECT count(*) FROM game_properties WHERE canonical_game_id = ${canonicalId} AND user_id = ${userId} AND removed_at IS NULL AND kind = 'game') = 1`;

/**
 * ADR 83 (A3, M1): kind changes first (with the new canonical game of a DLC that becomes a game), then the DLC links,
 * then the canonical games left without any property are deleted. Runs before the canonical follows the store title.
 */
function applyKindsAndLinks(
  tx: Tx,
  s: Scope,
  plan: { store: StoreId; at: number; kindChanges: ScanPlan["kindChanges"]; dlcLinks: ScanPlan["dlcLinks"] },
  entryOf: ReadonlyMap<string, { media?: EntryMedia | undefined }>,
  log?: Pick<CoreLogger, "warn">,
): void {
  const emptied = new Set<string>();
  /** Properties that left each emptied canonical game (ADR 85 point 6.2). */
  const left = new Map<string, string[]>();
  for (const k of plan.kindChanges) {
    const prop = tx
      .select()
      .from(gameProperties)
      .where(and(eq(gameProperties.id, k.propertyId), eq(gameProperties.userId, s.userId)))
      .get();
    if (!prop) throw new Error(`Plan changes the kind of an unknown property ${k.propertyId}`);
    if (prop.canonicalGameId && prop.canonicalGameId !== k.canonicalId) {
      emptied.add(prop.canonicalGameId);
      left.set(prop.canonicalGameId, [...(left.get(prop.canonicalGameId) ?? []), k.propertyId]);
    }
    if (k.kind === "game" && k.canonicalId) {
      const media = entryOf.get(k.propertyId)?.media;
      tx.insert(canonicalGames)
        .values({
          id: k.canonicalId,
          userId: s.userId,
          title: prop.title,
          normalizedTitle: prop.normalizedTitle,
          media: media ? { ...media } : null,
          metadataSource: plan.store,
          createdAt: plan.at,
          updatedAt: plan.at,
        })
        .run();
    }
    tx.update(gameProperties)
      .set({ kind: k.kind, canonicalGameId: k.canonicalId, ...(k.kind === "game" ? { baseStoreGameId: null } : {}) })
      .where(and(eq(gameProperties.id, k.propertyId), eq(gameProperties.userId, s.userId)))
      .run();
  }
  const byTarget = new Map<string | null, string[]>();
  for (const l of plan.dlcLinks) byTarget.set(l.canonicalId, [...(byTarget.get(l.canonicalId) ?? []), l.propertyId]);
  for (const [canonicalId, ids] of byTarget) {
    for (const part of chunks(ids)) {
      tx.update(gameProperties)
        .set({ canonicalGameId: canonicalId })
        .where(and(eq(gameProperties.kind, "dlc"), eq(gameProperties.store, plan.store), eq(gameProperties.userId, s.userId), inArray(gameProperties.id, part)))
        .run();
    }
  }
  const doomed = new Set<string>();
  for (const part of chunks([...emptied])) {
    const rows = tx
      .select({ id: canonicalGames.id })
      .from(canonicalGames)
      .where(
        and(
          eq(canonicalGames.userId, s.userId),
          inArray(canonicalGames.id, part),
          sql`NOT EXISTS (SELECT 1 FROM game_properties WHERE canonical_game_id = ${canonicalGames.id})`,
        ),
      )
      .all();
    for (const r of rows) doomed.add(r.id);
  }
  // ADR 85 point 6.2, 12: user data moves to the one canonical game the properties went to, if that one survives; else it goes with the game.
  let dropped = 0;
  for (const id of doomed) {
    if (!hasUserData(tx, id)) continue;
    const targets = new Set<string | null>();
    for (const part of chunks(left.get(id) ?? [])) {
      for (const r of tx.select({ c: gameProperties.canonicalGameId }).from(gameProperties).where(inArray(gameProperties.id, part)).all()) targets.add(r.c);
    }
    const target = targets.size === 1 ? [...targets][0] : null;
    if (target) mergeInTx(tx, s, id, target, plan.at);
    else dropped++;
  }
  for (const part of chunks([...doomed])) {
    tx.delete(canonicalGames).where(and(eq(canonicalGames.userId, s.userId), inArray(canonicalGames.id, part))).run();
  }
  if (dropped > 0) {
    deleteOrphanTags(tx, s);
    log?.warn("User data was deleted with games that became DLC without a base game", { userDataDropped: dropped });
  }
}

interface UserData {
  favorites: ReadonlySet<string>;
  tags: ReadonlyMap<string, readonly string[]>;
}

const hasUserData = (tx: Db | Tx, canonicalId: string): boolean =>
  tx.get<{ n: number }>(
    sql`SELECT (EXISTS (SELECT 1 FROM user_game_data WHERE canonical_game_id = ${canonicalId})
      OR EXISTS (SELECT 1 FROM game_tags WHERE canonical_game_id = ${canonicalId})
      OR EXISTS (SELECT 1 FROM collection_games WHERE canonical_game_id = ${canonicalId})) AS n`,
  ).n === 1;

/** A tag with no game left is deleted in the same transaction that took its last game (ADR 85 point 4). */
const deleteOrphanTags = (tx: Db | Tx, s: Scope): void => {
  tx.run(sql`DELETE FROM tags WHERE user_id = ${s.userId} AND NOT EXISTS (SELECT 1 FROM game_tags WHERE tag_id = tags.id)`);
};

/** ADR 85 point 6.3: favorite if either was, union of tags, union of collections keeping the lower position. `from` is not touched. */
function mergeInTx(tx: Db | Tx, s: Scope, from: string, to: string, at: number): void {
  const fav = tx.select().from(userGameData).where(and(eq(userGameData.canonicalGameId, from), eq(userGameData.userId, s.userId))).get();
  if (fav?.favorite === 1) {
    tx.insert(userGameData)
      .values({ canonicalGameId: to, userId: s.userId, favorite: 1, updatedAt: at })
      .onConflictDoUpdate({ target: userGameData.canonicalGameId, set: { favorite: 1, updatedAt: at } })
      .run();
  }
  tx.run(sql`INSERT OR IGNORE INTO game_tags (canonical_game_id, tag_id, user_id)
    SELECT ${to}, tag_id, user_id FROM game_tags WHERE canonical_game_id = ${from} AND user_id = ${s.userId}`);
  tx.run(sql`UPDATE collection_games SET position = MIN(position, (SELECT f.position FROM collection_games f
      WHERE f.collection_id = collection_games.collection_id AND f.canonical_game_id = ${from}))
    WHERE canonical_game_id = ${to} AND user_id = ${s.userId}
      AND collection_id IN (SELECT collection_id FROM collection_games WHERE canonical_game_id = ${from})`);
  tx.run(sql`INSERT OR IGNORE INTO collection_games (collection_id, canonical_game_id, user_id, position, added_at)
    SELECT collection_id, ${to}, user_id, position, added_at FROM collection_games WHERE canonical_game_id = ${from} AND user_id = ${s.userId}`);
}

/** The game is shown (ADR 85): the same condition as `getGame`. */
const isShown = (tx: Db | Tx, s: Scope, canonicalId: string): boolean =>
  tx
    .select({ n: sql<number>`count(*)` })
    .from(gameProperties)
    .where(
      and(
        eq(gameProperties.canonicalGameId, canonicalId),
        eq(gameProperties.userId, s.userId),
        isNull(gameProperties.removedAt),
        eq(gameProperties.kind, "game"),
      ),
    )
    .get()!.n > 0;

/** Canonical ids that are shown: at least one non-retired `game` property. */
const shownCanonicals = (tx: Db | Tx, s: Scope): Set<string> =>
  new Set(
    tx
      .select({ id: gameProperties.canonicalGameId })
      .from(gameProperties)
      .where(and(eq(gameProperties.userId, s.userId), isNull(gameProperties.removedAt), eq(gameProperties.kind, "game")))
      .all()
      .map((r) => r.id as string),
  );

function readCollections(tx: Db | Tx, s: Scope, onlyId?: string): CollectionRecord[] {
  const rows = tx
    .select()
    .from(collections)
    .where(and(eq(collections.userId, s.userId), onlyId === undefined ? undefined : eq(collections.id, onlyId)))
    .orderBy(asc(collections.position), asc(collections.id))
    .all();
  const shown = new Set(
    tx
      .select({ id: gameProperties.canonicalGameId })
      .from(gameProperties)
      .where(and(eq(gameProperties.userId, s.userId), isNull(gameProperties.removedAt), eq(gameProperties.kind, "game")))
      .all()
      .map((r) => r.id),
  );
  const games = new Map<string, string[]>();
  const links = tx
    .select()
    .from(collectionGames)
    .where(and(eq(collectionGames.userId, s.userId), onlyId === undefined ? undefined : eq(collectionGames.collectionId, onlyId)))
    .orderBy(asc(collectionGames.position), asc(collectionGames.canonicalGameId))
    .all();
  for (const l of links) if (shown.has(l.canonicalGameId)) games.set(l.collectionId, [...(games.get(l.collectionId) ?? []), l.canonicalGameId]);
  return rows.map((c) => ({ id: c.id, name: c.name, source: (c.sourceStore as StoreId | null) ?? null, gameIds: games.get(c.id) ?? [] }));
}

const countOf = (tx: Db | Tx, table: typeof tags | typeof collections | typeof priceWatch, userId: string): number =>
  tx.select({ n: sql<number>`count(*)` }).from(table).where(eq(table.userId, userId)).get()!.n;

/** The user's own collections (ADR 88: mirrors are not counted against the limit). */
const countOwn = (tx: Db | Tx, s: Scope): number =>
  tx.select({ n: sql<number>`count(*)` }).from(collections).where(and(eq(collections.userId, s.userId), isNull(collections.sourceStore))).get()!.n;

function setTags(tx: Db | Tx, s: Scope, canonicalId: string, wanted: readonly Label[], at: number): void {
  const labels = [...new Map(wanted.map((l) => [l.key, l])).values()];
  // ADR 85 point 5, 12: a merge may leave a game above 20; a new set may exceed 20 only if it does not grow.
  if (labels.length > LIMITS.tagsPerGame) {
    const current = tx.select({ n: sql<number>`count(*)` }).from(gameTags).where(eq(gameTags.canonicalGameId, canonicalId)).get()!.n;
    if (labels.length > current) throw limitReached(LIMITS.tagsPerGame, "tagsPerGame");
  }
  const existing = new Map<string, string>(
    labels.length === 0
      ? []
      : tx
          .select()
          .from(tags)
          .where(and(eq(tags.userId, s.userId), inArray(tags.nameKey, labels.map((l) => l.key))))
          .all()
          .map((t) => [t.nameKey, t.id]),
  );
  const fresh = labels.filter((l) => !existing.has(l.key));
  if (fresh.length > 0 && countOf(tx, tags, s.userId) + fresh.length > LIMITS.tags) throw limitReached(LIMITS.tags, "tags");
  for (const l of fresh) {
    const id = randomUUID();
    tx.insert(tags).values({ id, userId: s.userId, name: l.name, nameKey: l.key, createdAt: at }).run();
    existing.set(l.key, id);
  }
  const ids = labels.map((l) => existing.get(l.key) as string);
  tx.delete(gameTags)
    .where(and(eq(gameTags.canonicalGameId, canonicalId), ids.length === 0 ? undefined : notInArray(gameTags.tagId, ids)))
    .run();
  for (const tagId of ids) tx.insert(gameTags).values({ canonicalGameId: canonicalId, tagId, userId: s.userId }).onConflictDoNothing().run();
  deleteOrphanTags(tx, s);
}

function setCollections(tx: Db | Tx, s: Scope, canonicalId: string, wanted: readonly string[], at: number): void {
  const requested = [...new Set(wanted)];
  // ADR 88 point 15: ids of mirrors leave the wanted set BEFORE the existence check (no false 404), and their links stay as they are.
  const mirrorIds = new Set(
    requested.length === 0 ? [] : tx.select({ id: collections.id }).from(collections).where(and(eq(collections.userId, s.userId), inArray(collections.id, requested), isNotNull(collections.sourceStore))).all().map((r) => r.id),
  );
  const ids = requested.filter((id) => !mirrorIds.has(id));
  if (ids.length > 0) {
    const found = tx.select({ id: collections.id }).from(collections).where(and(eq(collections.userId, s.userId), isNull(collections.sourceStore), inArray(collections.id, ids))).all();
    if (found.length !== ids.length) throw new CoreError("not-found", "A collection does not exist");
  }
  const current = new Set(
    tx
      .select({ id: collectionGames.collectionId })
      .from(collectionGames)
      .where(and(eq(collectionGames.canonicalGameId, canonicalId), eq(collectionGames.userId, s.userId)))
      .all()
      .map((r) => r.id),
  );
  tx.delete(collectionGames)
    .where(
      and(
        eq(collectionGames.canonicalGameId, canonicalId),
        eq(collectionGames.userId, s.userId),
        inArray(collectionGames.collectionId, tx.select({ id: collections.id }).from(collections).where(and(eq(collections.userId, s.userId), isNull(collections.sourceStore)))),
        ids.length === 0 ? undefined : notInArray(collectionGames.collectionId, ids),
      ),
    )
    .run();
  for (const collectionId of ids.filter((id) => !current.has(id))) {
    const { n, last } = tx
      .select({ n: sql<number>`count(*)`, last: sql<number>`coalesce(max(${collectionGames.position}), 0)` })
      .from(collectionGames)
      .where(eq(collectionGames.collectionId, collectionId))
      .get()!;
    if (n >= LIMITS.gamesPerCollection) throw limitReached(LIMITS.gamesPerCollection, "gamesPerCollection");
    tx.insert(collectionGames).values({ collectionId, canonicalGameId: canonicalId, userId: s.userId, position: last + 1, addedAt: at }).run();
  }
}

/** ADR 72: the whole plan or nothing. Runs inside db.transaction, so any throw rolls everything back. */
function applyPlan(tx: Tx, s: Scope, plan: ScanPlan, log?: Pick<CoreLogger, "warn">): void {
  const at = plan.at;
  type Entry = ScanPlan["update"][number]["entry"];
  const upsertInstallation = (id: string, propertyId: string, e: Entry) => {
    const values = {
      installPath: e.installPath,
      launchData: e.launchData ? { ...e.launchData } : null,
      detectedBy: "scan",
      lastSeenAt: at,
    };
    tx.insert(installations)
      .values({ id, userId: s.userId, propertyId, deviceId: s.deviceId, ...values })
      .onConflictDoUpdate({ target: [installations.propertyId, installations.deviceId], set: values })
      .run();
  };
  const metadata = (e: Entry) => ({
    ...(e.media ? { media: { ...e.media } } : {}),
    ...(e.externalIds ? { externalIds: { ...e.externalIds } } : {}),
  });

  for (const c of plan.create) {
    const e = c.entry;
    // A DLC never creates a canonical game: `canonicalId` is the one of its base game, or null (ADR 83).
    if (e.kind === "game" && c.canonicalId) {
      tx.insert(canonicalGames)
        .values({
          id: c.canonicalId,
          userId: s.userId,
          title: e.title,
          normalizedTitle: e.normalizedTitle,
          media: e.media ? { ...e.media } : null,
          metadataSource: plan.store,
          createdAt: at,
          updatedAt: at,
        })
        .run();
    }
    tx.insert(gameProperties)
      .values({
        id: c.propertyId,
        userId: s.userId,
        canonicalGameId: c.canonicalId,
        store: plan.store,
        storeGameId: e.storeGameId,
        kind: e.kind,
        baseStoreGameId: e.kind === "dlc" ? (e.baseStoreGameId ?? null) : null,
        title: e.title,
        normalizedTitle: e.normalizedTitle,
        owned: 0,
        removedAt: null,
        storeMetadata: metadata(e),
      })
      .run();
    upsertInstallation(c.installationId, c.propertyId, e);
  }

  const kindOf = new Map(plan.kindChanges.map((k) => [k.propertyId, k.kind]));
  const tracked: { canonicalId: string; entry: Entry; owned: boolean }[] = [];
  for (const u of plan.update) {
    const e = u.entry;
    const prop = tx
      .select()
      .from(gameProperties)
      .where(and(eq(gameProperties.id, u.propertyId), eq(gameProperties.userId, s.userId)))
      .get();
    if (!prop) throw new Error(`Scan plan updates an unknown property ${u.propertyId}`);
    const finalKind = kindOf.get(u.propertyId) ?? (prop.kind as "game" | "dlc");
    // ADR 83 A1: an entry of another kind than the row (kept as is) changes nothing.
    if (e.kind === finalKind) {
      tx.update(gameProperties)
        // ADR 73: the scan rewrites media and externalIds but keeps what resolveMedia stored.
        .set({
          // ADR 74: the API title of an owned property is better than the manifest name.
          ...(prop.owned === 1 ? {} : { title: e.title, normalizedTitle: e.normalizedTitle }),
          ...(finalKind === "dlc" ? { baseStoreGameId: e.baseStoreGameId ?? null } : {}),
          storeMetadata: {
            ...metadata(e),
            ...(prop.storeMetadata?.resolvedMedia ? { resolvedMedia: prop.storeMetadata.resolvedMedia } : {}),
            ...(prop.storeMetadata?.mediaResolvedAt !== undefined ? { mediaResolvedAt: prop.storeMetadata.mediaResolvedAt } : {}),
            ...(prop.storeMetadata?.resolvedTitle ? { resolvedTitle: prop.storeMetadata.resolvedTitle } : {}),
            ...(prop.storeMetadata?.titleResolvedAt !== undefined ? { titleResolvedAt: prop.storeMetadata.titleResolvedAt } : {}),
            ...(finalKind === "dlc" && prop.storeMetadata?.dlcInferred ? { dlcInferred: true as const } : {}),
          },
        })
        .where(and(eq(gameProperties.id, u.propertyId), eq(gameProperties.userId, s.userId)))
        .run();
      if (prop.kind === "game" && finalKind === "game" && prop.canonicalGameId) tracked.push({ canonicalId: prop.canonicalGameId, entry: e, owned: prop.owned === 1 });
      upsertInstallation(u.installationId, u.propertyId, e); // not on a conflict: it would overwrite launch data with a DLC's
    }
  }

  applyKindsAndLinks(tx, s, plan, new Map(plan.update.map((u) => [u.propertyId, u.entry])), log);
  for (const t of tracked) {
    // Only a canonical game with this single property follows the store title and artwork.
    tx.update(canonicalGames)
      .set({
        ...(t.owned ? {} : { title: t.entry.title, normalizedTitle: t.entry.normalizedTitle }),
        media: t.entry.media ? { ...t.entry.media } : null,
        updatedAt: at,
      })
      .where(and(eq(canonicalGames.id, t.canonicalId), eq(canonicalGames.userId, s.userId), isFollowing(t.canonicalId, s.userId)))
      .run();
  }

  for (const part of chunks(plan.removeInstallations)) {
    tx.delete(installations)
      .where(and(eq(installations.userId, s.userId), eq(installations.deviceId, s.deviceId), inArray(installations.id, part)))
      .run();
  }
  for (const part of chunks(plan.retireProperties)) {
    tx.update(gameProperties)
      .set({ removedAt: at })
      .where(and(eq(gameProperties.userId, s.userId), inArray(gameProperties.id, part)))
      .run();
  }
  for (const part of chunks(plan.reviveProperties)) {
    tx.update(gameProperties)
      .set({ removedAt: null })
      .where(and(eq(gameProperties.userId, s.userId), inArray(gameProperties.id, part)))
      .run();
  }

  for (const r of plan.upsertDiscoveredRoots) {
    tx.insert(scanRoots)
      .values({
        id: r.id,
        userId: s.userId,
        deviceId: s.deviceId,
        origin: "discovered",
        path: r.path,
        pathKey: r.pathKey,
        declarationId: r.declarationId,
        store: r.store,
        tag: r.tag,
        enabled: r.enabled ? 1 : 0,
      })
      // An existing row keeps its id and its switch (the user may have turned it off).
      .onConflictDoUpdate({
        target: [scanRoots.userId, scanRoots.deviceId, scanRoots.origin, scanRoots.pathKey],
        set: { path: r.path, declarationId: r.declarationId, store: r.store, tag: r.tag },
        // ADR 79: a folder already stored for another store is not taken over.
        setWhere: eq(scanRoots.store, r.store ?? ""),
      })
      .run();
  }
  for (const part of chunks(plan.deleteRoots)) {
    tx.delete(scanRoots)
      .where(and(eq(scanRoots.userId, s.userId), eq(scanRoots.origin, "discovered"), inArray(scanRoots.id, part)))
      .run();
  }

  putSync(tx, s, plan.sync);
}

/** ADR 74: a library snapshot. Same storeGameId = same property (unique index). The whole plan or nothing. */
function applyLibrary(tx: Tx, s: Scope, plan: LibraryPlan, log?: Pick<CoreLogger, "warn">): void {
  const at = plan.at;
  type Entry = LibraryPlan["update"][number]["entry"];
  const metadata = (e: Entry) => ({
    ...(e.media ? { media: { ...e.media } } : {}),
    ...(e.externalIds ? { externalIds: { ...e.externalIds } } : {}),
    ...(e.kind === "dlc" && e.dlcInferred ? { dlcInferred: true as const } : {}),
  });

  for (const c of plan.create) {
    const e = c.entry;
    // A DLC never creates a canonical game: `canonicalId` is the one of its base game, or null (ADR 83).
    if (e.kind === "game" && c.canonicalId) {
      tx.insert(canonicalGames)
        .values({
          id: c.canonicalId,
          userId: s.userId,
          title: e.title,
          normalizedTitle: e.normalizedTitle,
          media: e.media ? { ...e.media } : null,
          metadataSource: plan.store,
          createdAt: at,
          updatedAt: at,
        })
        .run();
    }
    tx.insert(gameProperties)
      .values({
        id: c.propertyId,
        userId: s.userId,
        canonicalGameId: c.canonicalId,
        store: plan.store,
        storeGameId: e.storeGameId,
        kind: e.kind,
        baseStoreGameId: e.kind === "dlc" ? (e.baseStoreGameId ?? null) : null,
        title: e.title,
        normalizedTitle: e.normalizedTitle,
        owned: 1,
        removedAt: null,
        storeMetadata: metadata(e),
        storePlaytimeMinutes: e.storePlaytimeMinutes,
        storeLastPlayedAt: e.storeLastPlayedAt,
      })
      .run();
  }

  const kindOf = new Map(plan.kindChanges.map((k) => [k.propertyId, k.kind]));
  const tracked: { canonicalId: string; entry: Entry }[] = [];
  for (const u of plan.update) {
    const e = u.entry;
    const prop = tx
      .select()
      .from(gameProperties)
      .where(and(eq(gameProperties.id, u.propertyId), eq(gameProperties.userId, s.userId)))
      .get();
    if (!prop) throw new Error(`Library plan updates an unknown property ${u.propertyId}`);
    const finalKind = kindOf.get(u.propertyId) ?? (prop.kind as "game" | "dlc");
    // ADR 83 A1: an entry of another kind than the row (kept as is) only confirms the ownership.
    const same = e.kind === finalKind;
    tx.update(gameProperties)
      .set({
        owned: 1,
        removedAt: null,
        ...(same
          ? {
              title: e.title,
              normalizedTitle: e.normalizedTitle,
              storePlaytimeMinutes: e.storePlaytimeMinutes,
              storeLastPlayedAt: e.storeLastPlayedAt,
              ...(finalKind === "dlc" ? { baseStoreGameId: e.baseStoreGameId ?? null } : {}),
              // ADR 73: keeps what resolveMedia stored.
              storeMetadata: {
                ...metadata(e),
                ...(prop.storeMetadata?.resolvedMedia ? { resolvedMedia: prop.storeMetadata.resolvedMedia } : {}),
                ...(prop.storeMetadata?.mediaResolvedAt !== undefined ? { mediaResolvedAt: prop.storeMetadata.mediaResolvedAt } : {}),
                ...(prop.storeMetadata?.resolvedTitle ? { resolvedTitle: prop.storeMetadata.resolvedTitle } : {}),
                ...(prop.storeMetadata?.titleResolvedAt !== undefined ? { titleResolvedAt: prop.storeMetadata.titleResolvedAt } : {}),
              },
            }
          : {}),
      })
      .where(and(eq(gameProperties.id, u.propertyId), eq(gameProperties.userId, s.userId)))
      .run();
    if (same && prop.kind === "game" && finalKind === "game" && prop.canonicalGameId) tracked.push({ canonicalId: prop.canonicalGameId, entry: e });
  }

  applyKindsAndLinks(tx, s, plan, new Map(plan.update.map((u) => [u.propertyId, u.entry])), log);
  for (const t of tracked) {
    tx.update(canonicalGames)
      .set({ title: t.entry.title, normalizedTitle: t.entry.normalizedTitle, media: t.entry.media ? { ...t.entry.media } : null, updatedAt: at })
      .where(and(eq(canonicalGames.id, t.canonicalId), eq(canonicalGames.userId, s.userId), isFollowing(t.canonicalId, s.userId)))
      .run();
  }

  for (const part of chunks(plan.disown)) {
    tx.update(gameProperties)
      .set({ owned: 0 })
      .where(and(eq(gameProperties.userId, s.userId), eq(gameProperties.store, plan.store), inArray(gameProperties.id, part)))
      .run();
  }
  for (const part of chunks(plan.retire)) {
    tx.update(gameProperties)
      .set({ removedAt: at })
      .where(and(eq(gameProperties.userId, s.userId), eq(gameProperties.store, plan.store), inArray(gameProperties.id, part)))
      .run();
  }

  putSync(tx, s, plan.sync);
}
