// Repositories that implement the persistence ports of @ludiary/core (ADR 38, 72) over Drizzle + better-sqlite3.
// Methods are async in the signature although the driver is synchronous, so the core is not tied to it.
import { randomUUID } from "node:crypto";
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type Database from "better-sqlite3";
import type { EntryMedia, I18nKey, StoreId } from "@ludiary/contracts";
import type {
  GameDetail,
  GameSummary,
  ConnectionRepository,
  IdentityRepository,
  InstallationRecord,
  LaunchTarget,
  LibraryPlan,
  LibraryRepository,
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
import { canonicalGames, devices, gameProperties, installations, scanRoots, secrets as secretsTable, settings, storeConnections, syncState, users } from "./schema";

type Db = BetterSQLite3Database<typeof schema>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
const STORE_ORDER: readonly StoreId[] = ["steam", "gog", "epic", "ubisoft", "ea"];
const CHUNK = 500;

export interface Repositories {
  identity: IdentityRepository;
  library: LibraryRepository;
  scanRoots: ScanRootRepository;
  syncState: SyncStateRepository;
  settings: SettingsRepository;
  secrets: SecretRepository;
  connections: ConnectionRepository;
}

interface Scope {
  userId: string;
  deviceId: string;
}

function chunks<T>(items: readonly T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += CHUNK) out.push(items.slice(i, i + CHUNK));
  return out;
}

/**
 * All repositories share one scope (the only user and the local device). `identity.ensure` sets it; using any
 * other repository before that is a programming error.
 */
export function createRepositories(sqlite: Database.Database): Repositories {
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

  function summary(
    g: typeof canonicalGames.$inferSelect,
    ps: (typeof gameProperties.$inferSelect)[],
    installed: ReadonlySet<string>,
    connected: ReadonlySet<string>,
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
      favorite: false,
      playtimeMinutes,
      ...(lastPlayedAt !== null ? { lastPlayedAt } : {}),
      tags: [],
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
      const out: GameSummary[] = [];
      for (const g of games) {
        const ps = byCanonical.get(g.id);
        if (ps && ps.length > 0) out.push(summary(g, ps, installed, connected));
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
      const detail: GameDetail = {
        ...summary(g, games, new Set(inst.keys()), connectedStores(s)),
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
        dlc: all
          .filter((p) => p.kind === "dlc" && p.store !== "manual")
          .map((p) => ({ id: p.id, title: p.title, store: p.store as StoreId })),
        collections: [],
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

    async applyLibraryPlan(plan) {
      const s = need();
      db.transaction((tx) => applyLibrary(tx, s, plan));
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

    async applyScanPlan(plan) {
      const s = need();
      db.transaction((tx) => applyPlan(tx, s, plan));
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

  return { identity, library, scanRoots: roots, syncState: sync, settings: settingsRepo, secrets, connections };
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

/** ADR 72: the whole plan or nothing. Runs inside db.transaction, so any throw rolls everything back. */
function applyPlan(tx: Tx, s: Scope, plan: ScanPlan): void {
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
    tx.insert(gameProperties)
      .values({
        id: c.propertyId,
        userId: s.userId,
        canonicalGameId: c.canonicalId,
        store: plan.store,
        storeGameId: e.storeGameId,
        kind: "game",
        title: e.title,
        normalizedTitle: e.normalizedTitle,
        owned: 0,
        removedAt: null,
        storeMetadata: metadata(e),
      })
      .run();
    upsertInstallation(c.installationId, c.propertyId, e);
  }

  for (const u of plan.update) {
    const e = u.entry;
    const prop = tx
      .select()
      .from(gameProperties)
      .where(and(eq(gameProperties.id, u.propertyId), eq(gameProperties.userId, s.userId)))
      .get();
    if (!prop) throw new Error(`Scan plan updates an unknown property ${u.propertyId}`);
    tx.update(gameProperties)
      // ADR 73: the scan rewrites media and externalIds but keeps what resolveMedia stored.
      .set({
        // ADR 74: the API title of an owned property is better than the manifest name.
        ...(prop.owned === 1 ? {} : { title: e.title, normalizedTitle: e.normalizedTitle }),
        storeMetadata: {
          ...metadata(e),
          ...(prop.storeMetadata?.resolvedMedia ? { resolvedMedia: prop.storeMetadata.resolvedMedia } : {}),
          ...(prop.storeMetadata?.mediaResolvedAt !== undefined ? { mediaResolvedAt: prop.storeMetadata.mediaResolvedAt } : {}),
        },
      })
      .where(and(eq(gameProperties.id, u.propertyId), eq(gameProperties.userId, s.userId)))
      .run();
    if (prop.canonicalGameId) {
      // Only a canonical game with this single property follows the store title and artwork.
      tx.update(canonicalGames)
        .set({
          ...(prop.owned === 1 ? {} : { title: e.title, normalizedTitle: e.normalizedTitle }),
          media: e.media ? { ...e.media } : null,
          updatedAt: at,
        })
        .where(
          and(
            eq(canonicalGames.id, prop.canonicalGameId),
            sql`(SELECT count(*) FROM game_properties WHERE canonical_game_id = ${prop.canonicalGameId}) = 1`,
          ),
        )
        .run();
    }
    upsertInstallation(u.installationId, u.propertyId, e);
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
function applyLibrary(tx: Tx, s: Scope, plan: LibraryPlan): void {
  const at = plan.at;
  type Entry = LibraryPlan["update"][number]["entry"];
  const metadata = (e: Entry) => ({
    ...(e.media ? { media: { ...e.media } } : {}),
    ...(e.externalIds ? { externalIds: { ...e.externalIds } } : {}),
  });

  for (const c of plan.create) {
    const e = c.entry;
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
    tx.insert(gameProperties)
      .values({
        id: c.propertyId,
        userId: s.userId,
        canonicalGameId: c.canonicalId,
        store: plan.store,
        storeGameId: e.storeGameId,
        kind: "game",
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

  for (const u of plan.update) {
    const e = u.entry;
    const prop = tx
      .select()
      .from(gameProperties)
      .where(and(eq(gameProperties.id, u.propertyId), eq(gameProperties.userId, s.userId)))
      .get();
    if (!prop) throw new Error(`Library plan updates an unknown property ${u.propertyId}`);
    tx.update(gameProperties)
      .set({
        title: e.title,
        normalizedTitle: e.normalizedTitle,
        owned: 1,
        removedAt: null,
        storePlaytimeMinutes: e.storePlaytimeMinutes,
        storeLastPlayedAt: e.storeLastPlayedAt,
        // ADR 73: keeps what resolveMedia stored.
        storeMetadata: {
          ...metadata(e),
          ...(prop.storeMetadata?.resolvedMedia ? { resolvedMedia: prop.storeMetadata.resolvedMedia } : {}),
          ...(prop.storeMetadata?.mediaResolvedAt !== undefined ? { mediaResolvedAt: prop.storeMetadata.mediaResolvedAt } : {}),
        },
      })
      .where(and(eq(gameProperties.id, u.propertyId), eq(gameProperties.userId, s.userId)))
      .run();
    if (prop.canonicalGameId) {
      tx.update(canonicalGames)
        .set({ title: e.title, normalizedTitle: e.normalizedTitle, media: e.media ? { ...e.media } : null, updatedAt: at })
        .where(
          and(
            eq(canonicalGames.id, prop.canonicalGameId),
            eq(canonicalGames.userId, s.userId),
            sql`(SELECT count(*) FROM game_properties WHERE canonical_game_id = ${prop.canonicalGameId}) = 1`,
          ),
        )
        .run();
    }
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
