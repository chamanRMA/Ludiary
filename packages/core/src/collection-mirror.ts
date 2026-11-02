// ADR 88: a store's collections kept as a read-only mirror, refreshed at the end of each pass of the store's sync loop.
// The connector only reads; everything else is decided here. Own collections (source NULL) are never touched.
import { ConnectorError, LocationsUnreadableError } from "@ludiary/contracts";
import type { CollectionImportContext, CollectionImportSnapshot, ResolvedLocation, StoreConnector, StoreId } from "@ludiary/contracts";
import { connectorLogger } from "./contexts";
import type { Env } from "./env";
import { toErrorInfo } from "./errors";
import { COLLECTION_MAX_LENGTH, LIMITS, normalizeLabel } from "./labels";
import {
  MIRROR_SKIPPED_KEYS,
  type CollectionMirrorCounts,
  type CollectionMirrorInput,
  type MirrorSkippedKey,
  type StoreCollectionsStatus,
} from "./model";
import { collectionsKey, effectiveLocale, readSettings, readStoreCollections } from "./settings";
import { withTimeout } from "./timeout";

export const MIRROR_TIMEOUT_MS = 30_000;
/** ADR 87 points 5 and 13: barriers for the (untrusted) snapshot, not limits of Ludiary. */
const MAX_SNAPSHOT_COLLECTIONS = 1000;
const MAX_IDS_PER_LIST = 10_000;
const MAX_DISTINCT_IDS = 100_000;
const ID_RE = /^[\x21-\x7e]{1,64}$/;
/** Connector counters we accept (anything else is ignored). */
const CONNECTOR_COUNTERS: readonly MirrorSkippedKey[] = ["dynamic", "deleted", "hidden", "invalid", "limitSnapshot", "limitIds"];

export interface MirrorState {
  /** The store's mirrors with ALL their links, shown or not, in link order. */
  mirrors: readonly { id: string; sourceId: string; name: string; nameKey: string; members: readonly string[] }[];
  /** Canonical ids that are shown right now. */
  shown: ReadonlySet<string>;
  /** Canonical ids that are favorite right now. */
  favorites: ReadonlySet<string>;
  /** Store ids of the favorites already applied (ADR 88 point 7). */
  favoritesSeen: ReadonlySet<string>;
}

export interface CollectionMirrorPlan {
  create: { sourceId: string; name: string; key: string; gameIds: string[] }[];
  /** `rename`/`gameIds` only when they change; `gameIds` is the whole wanted list, in order. */
  update: { id: string; rename?: { name: string; key: string }; gameIds?: string[] }[];
  remove: string[];
  /** Canonical games to mark as favorite. */
  favorites: string[];
  /** The new `favoritesSeen`, or null if it does not change. */
  favoritesSeen: string[] | null;
  counts: CollectionMirrorCounts;
}

const sameList = (a: readonly string[], b: readonly string[]): boolean => a.length === b.length && a.every((x, i) => x === b[i]);

export const emptyMirrorCounts = (): CollectionMirrorCounts => ({
  off: false, collectionsCreated: 0, collectionsRenamed: 0, collectionsDeleted: 0, gamesAdded: 0, gamesRemoved: 0,
  favoritesAdded: 0, favoritesPending: 0, emptySnapshotKept: 0, gone: 0, empty: 0, limitCollections: 0, limitGames: 0,
});

/** Pure. The db layer runs it INSIDE its transaction on what it read there (ADR 88 points 9.3 and 15). */
export function planCollectionMirror(input: CollectionMirrorInput, state: MirrorState): CollectionMirrorPlan {
  const counts = emptyMirrorCounts();
  const plan: CollectionMirrorPlan = { create: [], update: [], remove: [], favorites: [], favoritesSeen: null, counts };
  const bySource = new Map(state.mirrors.map((m) => [m.sourceId, m]));
  const present = new Set<string>(input.protectedSourceIds);
  let total = state.mirrors.length;
  for (const imp of input.collections) {
    const alive = imp.gameIds.filter((id) => state.shown.has(id));
    counts.gone += imp.gameIds.length - alive.length;
    const wanted = alive.slice(0, LIMITS.gamesPerCollection);
    counts.limitGames += alive.length - wanted.length;
    const existing = bySource.get(imp.sourceId);
    if (wanted.length === 0) {
      if (!existing) counts.empty++; // an existing one is deleted below, like one that Steam no longer has
      continue;
    }
    if (!existing) {
      if (total >= LIMITS.collections) {
        counts.limitCollections++;
        continue;
      }
      total++;
      present.add(imp.sourceId);
      plan.create.push({ sourceId: imp.sourceId, name: imp.name, key: imp.key, gameIds: wanted });
      counts.collectionsCreated++;
      counts.gamesAdded += wanted.length;
      continue;
    }
    present.add(imp.sourceId);
    const renamed = existing.name !== imp.name || existing.nameKey !== imp.key;
    const changed = !sameList(existing.members, wanted);
    if (!renamed && !changed) continue;
    plan.update.push({ id: existing.id, ...(renamed ? { rename: { name: imp.name, key: imp.key } } : {}), ...(changed ? { gameIds: wanted } : {}) });
    if (renamed) counts.collectionsRenamed++;
    if (changed) {
      const had = new Set(existing.members);
      const will = new Set(wanted);
      counts.gamesAdded += wanted.filter((id) => !had.has(id)).length;
      counts.gamesRemoved += existing.members.filter((id) => !will.has(id)).length;
    }
  }
  const stale = state.mirrors.filter((m) => !present.has(m.sourceId));
  if (input.blockDeletes) {
    if (input.emptySnapshot && stale.length > 0) counts.emptySnapshotKept = 1;
  } else {
    plan.remove = stale.map((m) => m.id);
    counts.collectionsDeleted = stale.length;
  }

  // Favorites (point 7): only the ones new in the store, only added, never removed.
  const current = new Set(input.favorites.map((f) => f.storeGameId));
  if (!input.favoritesAllowed) {
    counts.favoritesPending = input.favorites.filter((f) => !state.favoritesSeen.has(f.storeGameId)).length;
  } else {
    const applied = new Set<string>();
    const mark = new Set<string>();
    for (const f of input.favorites) {
      if (state.favoritesSeen.has(f.storeGameId) || f.canonicalId === null || !state.shown.has(f.canonicalId)) continue;
      applied.add(f.storeGameId);
      if (!state.favorites.has(f.canonicalId)) mark.add(f.canonicalId);
    }
    plan.favorites = [...mark];
    counts.favoritesAdded = mark.size;
    // On a blocked pass the file is not trusted: the list only grows, so a favorite the user removed cannot come back later.
    const kept = input.blockDeletes ? [...state.favoritesSeen] : [...state.favoritesSeen].filter((id) => current.has(id));
    const next = [...kept, ...applied].slice(0, LIMITS.gamesPerCollection);
    if (!sameList([...state.favoritesSeen], next)) plan.favoritesSeen = next;
  }
  return plan;
}

const zeroSkipped = (): Record<MirrorSkippedKey, number> => Object.fromEntries(MIRROR_SKIPPED_KEYS.map((k) => [k, 0])) as Record<MirrorSkippedKey, number>;

/** Everything the connector returned is checked here: types, caps and counters. Never trusts its shape. */
function readSnapshot(
  raw: unknown,
  skipped: Record<MirrorSkippedKey, number>,
): { collections: { sourceId: string; name: string; ids: string[] }[]; favorites: string[]; verified: boolean } {
  const snap = raw as Partial<CollectionImportSnapshot> | null;
  if (!snap || typeof snap !== "object" || !Array.isArray(snap.collections) || !Array.isArray(snap.favorites) || (snap.accountSource !== "connected" && snap.accountSource !== "single-folder")) {
    throw new ConnectorError("store.unexpected-response", "importCollections returned an invalid snapshot");
  }
  const ids = (list: unknown): string[] => {
    if (!Array.isArray(list)) {
      skipped.invalid++;
      return [];
    }
    if (list.length > MAX_IDS_PER_LIST) skipped.limitSnapshot += list.length - MAX_IDS_PER_LIST;
    const out: string[] = [];
    for (const id of list.slice(0, MAX_IDS_PER_LIST) as unknown[]) {
      if (typeof id === "string" && ID_RE.test(id)) out.push(id);
      else skipped.invalid++;
    }
    return out;
  };
  if (snap.collections.length > MAX_SNAPSHOT_COLLECTIONS) skipped.limitSnapshot += snap.collections.length - MAX_SNAPSHOT_COLLECTIONS;
  const collections: { sourceId: string; name: string; ids: string[] }[] = [];
  const seen = new Set<string>();
  for (const c of snap.collections.slice(0, MAX_SNAPSHOT_COLLECTIONS) as unknown[]) {
    const o = c as { sourceId?: unknown; name?: unknown; storeGameIds?: unknown } | null;
    if (!o || typeof o !== "object" || typeof o.name !== "string" || typeof o.sourceId !== "string" || !ID_RE.test(o.sourceId) || seen.has(o.sourceId)) skipped.invalid++;
    else {
      seen.add(o.sourceId);
      collections.push({ sourceId: o.sourceId, name: o.name, ids: ids(o.storeGameIds) });
    }
  }
  const counters = (snap.skipped && typeof snap.skipped === "object" ? snap.skipped : {}) as Record<string, unknown>;
  for (const k of CONNECTOR_COUNTERS) {
    const v = Object.hasOwn(counters, k) ? counters[k] : 0;
    if (typeof v === "number" && Number.isSafeInteger(v) && v >= 0) skipped[k] += v;
  }
  return { collections, favorites: ids(snap.favorites), verified: snap.accountSource === "connected" };
}

export interface CollectionMirrorService {
  /** The last step of a pass of the store's loop. Never throws: a failure stays here (ADR 88 point 9.4). */
  afterPass(c: StoreConnector): Promise<void>;
  /** undefined: the store has no such operation. */
  status(c: StoreConnector): Promise<StoreCollectionsStatus | undefined>;
  /** The user turned the setting off: the mirrors go and the status is 'off'. */
  disable(store: StoreId): Promise<void>;
}

export function createCollectionMirror(env: Env): CollectionMirrorService {
  const { deps } = env;
  const states = new Map<StoreId, StoreCollectionsStatus>();
  const fresh = (): StoreCollectionsStatus => ({ status: "idle", lastSuccessAt: null, accountVerified: null, favoritesPending: 0, error: null });
  const set = (store: StoreId, patch: Partial<StoreCollectionsStatus>): void => void states.set(store, { ...(states.get(store) ?? fresh()), ...patch });
  /** Convention: a connector names its file errors `connectors.<id>.collections.notFound`, `.ambiguous` and `.accountNotFound` (ADR 88). */
  const keyOf = (e: unknown): string | undefined => (e instanceof ConnectorError ? e.details.messageKey : undefined);

  /** Resolved 'scan' locations (ADR 79: absent proves nothing, unreadable is an error), local paths only. */
  async function scanLocations(c: StoreConnector): Promise<ResolvedLocation[]> {
    const resolver = deps.locations!;
    const found: ResolvedLocation[] = [];
    let unreadable = false;
    for (const decl of c.locations.filter((l) => l.purpose === "scan")) {
      try {
        found.push(...(await resolver.resolve(decl)));
      } catch (e) {
        unreadable = true;
        if (e instanceof LocationsUnreadableError) found.push(...e.partial);
        deps.log.warn("Could not resolve a location", { connector: c.id, location: decl.id, error: e instanceof Error ? e.name : "unknown" });
      }
    }
    const local = found.filter((l) => deps.files.isAbsolute(l.path) && deps.files.isLocalPath(l.path));
    if (local.length === 0 && unreadable) throw new ConnectorError("scan.discovery-unavailable", "The locations could not be read");
    return local;
  }

  async function pass(c: StoreConnector, importCollections: NonNullable<StoreConnector["importCollections"]>): Promise<void> {
    const store = c.id;
    if (!deps.locations) return set(store, { status: "unavailable" });
    const cfg = await readStoreCollections(env, store);
    if (!cfg.enabled) return set(store, { status: "off" });
    if ((await readSettings(env)).detection !== "auto-and-manual") return set(store, { status: "needs-detection" });
    const locations = await scanLocations(c);
    if (locations.length === 0) return set(store, { status: "store-missing" });

    // The reader is confined to <location>/<importCollectionsRoot> (ADR 87 point 13); the connector gets the original locations.
    const base = deps.files.scoped(locations.map((l) => l.path));
    const sub = (c.importCollectionsRoot ?? "").split(/[\\/]/);
    const signal = deps.clock.timeout(MIRROR_TIMEOUT_MS);
    const vault = env.vaultFor(store);
    const ctx: CollectionImportContext = {
      signal,
      log: connectorLogger(env, store),
      locale: await effectiveLocale(env),
      locations,
      fs: deps.files.scoped(locations.map((l) => base.join(l.path, ...sub))),
      secrets: { get: (name) => vault.get(name) }, // read-only view: no set, no delete
    };
    const t0 = deps.clock.now();
    const skipped = zeroSkipped();
    const snapshot = readSnapshot(await withTimeout(signal, () => importCollections.call(c, ctx)), skipped);

    // appids -> canonical games, from ONE read (ADR 87 point 13).
    const known = await deps.library.findVisibleCanonicals(store);
    const distinct = new Set<string>();
    const dlc = new Set<string>();
    const missing = new Set<string>();
    const translate = (list: readonly string[]): string[] => {
      const out = new Set<string>();
      for (const id of list) {
        if (!distinct.has(id)) {
          if (distinct.size >= MAX_DISTINCT_IDS) {
            skipped.limitIds++;
            continue;
          }
          distinct.add(id);
        }
        const canonical = known.games.get(id);
        if (canonical !== undefined) out.add(canonical);
        else if (known.dlc.has(id)) dlc.add(id);
        else missing.add(id);
      }
      return [...out];
    };

    const collections: CollectionMirrorInput["collections"][number][] = [];
    const protectedIds: string[] = [];
    for (const col of snapshot.collections) {
      const chars = [...col.name];
      let label;
      try {
        label = normalizeLabel(chars.slice(0, COLLECTION_MAX_LENGTH).join(""), COLLECTION_MAX_LENGTH);
      } catch {
        skipped.invalidName++;
        protectedIds.push(col.sourceId); // skipped this pass: it stays as it was
        continue;
      }
      if (chars.length > COLLECTION_MAX_LENGTH) skipped.nameTruncated++;
      collections.push({ sourceId: col.sourceId, name: label.name, key: label.key, gameIds: translate(col.ids) });
    }
    const favorites = [...new Set(snapshot.favorites)].map((storeGameId) => ({ storeGameId, canonicalId: known.games.get(storeGameId) ?? null }));
    const emptySnapshot = snapshot.collections.length === 0 && skipped.deleted === 0;
    const input: CollectionMirrorInput = {
      collections,
      protectedSourceIds: protectedIds,
      favorites,
      favoritesAllowed: snapshot.verified || cfg.unverifiedFavorites,
      accountSource: snapshot.verified ? "connected" : "single-folder",
      blockDeletes: emptySnapshot || known.games.size === 0 || skipped.invalid > 0 || skipped.limitSnapshot > 0 || skipped.limitIds > 0,
      emptySnapshot,
    };
    const counts = await deps.userData.applyCollectionMirror(store, input, deps.clock.now());
    if (counts.off) return set(store, { status: "off" }); // turned off while the pass was running: nothing was written
    skipped.empty += counts.empty;
    skipped.limitCollections += counts.limitCollections;
    skipped.limitGames += counts.limitGames;
    set(store, { status: "idle", lastSuccessAt: deps.clock.now(), accountVerified: snapshot.verified, favoritesPending: counts.favoritesPending, error: null });
    // Counters only: no names, ids, account numbers or paths (ADR 88 point 9.6).
    deps.log.info("Collections mirror finished", {
      connector: store,
      durationMs: deps.clock.now() - t0,
      accountVerified: snapshot.verified,
      collectionsCreated: counts.collectionsCreated,
      collectionsRenamed: counts.collectionsRenamed,
      collectionsDeleted: counts.collectionsDeleted,
      gamesAdded: counts.gamesAdded,
      gamesRemoved: counts.gamesRemoved,
      favoritesAdded: counts.favoritesAdded,
      favoritesPending: counts.favoritesPending,
      emptySnapshotKept: counts.emptySnapshotKept,
      notInLibrary: missing.size,
      dlc: dlc.size,
      gone: counts.gone,
      ...Object.fromEntries(MIRROR_SKIPPED_KEYS.map((k) => [`skipped_${k}`, skipped[k]])),
    });
  }

  async function fail(c: StoreConnector, e: unknown): Promise<void> {
    const store = c.id;
    // Code or exception name only: the message of an unknown error may quote file text.
    if (e instanceof ConnectorError) deps.log.warn("Collections mirror failed", { connector: store, code: e.code });
    else deps.log.error("Collections mirror failed", { connector: store, error: e instanceof Error ? e.name : "unknown" });
    const key = keyOf(e);
    if (key === `connectors.${store}.collections.ambiguous`) return set(store, { status: "ambiguous" });
    if (key === `connectors.${store}.collections.notFound` || key === `connectors.${store}.collections.accountNotFound`) {
      set(store, { status: "store-missing" });
      // ADR 88 point 15: the mirrors came from the only folder found, and the connected account has no file: they were someone else's.
      // Only the connector's explicit accountNotFound proves it; notFound alone never deletes.
      if (key.endsWith(".accountNotFound") && (await deps.settings.get(collectionsKey(store, "mirrorAccountSource"))) === "single-folder") {
        const n = await deps.userData.deleteCollectionMirrors(store);
        deps.log.info("Collections mirror cleared: the connected account has no collections file", { connector: store, collectionsDeleted: n });
      }
      return;
    }
    set(store, { status: "error", error: toErrorInfo(e) });
  }

  return {
    async afterPass(c) {
      const importCollections = c.importCollections;
      if (!importCollections) return;
      try {
        await pass(c, importCollections);
      } catch (e) {
        try {
          await fail(c, e);
        } catch {
          /* the database is gone: the step has nothing else to say */
        }
      }
    },
    async status(c) {
      if (!c.importCollections) return undefined;
      const cur = states.get(c.id) ?? fresh();
      if (!deps.locations) return { ...cur, status: "unavailable" };
      const enabled = (await readStoreCollections(env, c.id)).enabled;
      if (!enabled) return { ...cur, status: "off" };
      return cur.status === "off" ? { ...cur, status: "idle" } : cur; // turned on, the next pass has not run yet
    },
    async disable(store) {
      await deps.userData.deleteCollectionMirrors(store);
      set(store, { status: "off", favoritesPending: 0 });
    },
  };
}
