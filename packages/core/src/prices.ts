// Price comparison (ADR 86, points 7 and 15). The service describes and fetches; the core matches games, validates
// everything it returns as untrusted, caches, spends a budget and decides what the user sees.
import { ConnectorError } from "@ludiary/contracts";
import type { EntryMedia, HttpClient, PriceService, PriceServiceId, PriceSnapshot, StoreId, SyncContext } from "@ludiary/contracts";
import { epochOf, bumpEpoch, serviceContext, serviceKey, syncContext } from "./contexts";
import {
  PRICE_BATCH,
  PRICE_BATCH_ALL,
  PRICE_BUDGET,
  PRICE_BUDGET_WINDOW_MS,
  PRICE_CALL_MS,
  PRICE_LOOKUP_BATCH,
  PRICE_NOT_FOUND_RETRY_MS,
  PRICE_TTL_MS,
  MAX_MEDIA_RETRY_MS,
  SEARCH_KEEP,
  SEARCH_MAX_RESULTS,
  SEARCH_TTL_MS,
  LIBRARY_TIMEOUT_MS,
  WATCH_MAX,
  WISHLIST_IMPORT_FLOOR_MS,
  WISHLIST_MAX_ENTRIES,
  type Env,
} from "./env";
import { asKey, CoreError, STORE_NAMES, toCoreError } from "./errors";
import type {
  GamePrices,
  PriceBoard,
  PriceBoardState,
  PriceDealRecord,
  PriceKind,
  PriceLinkRecord,
  PriceLinkSource,
  PriceSearchResult,
  PriceShops,
  PriceSnapshotData,
  PriceSnapshotRecord,
  PriceWatchRecord,
  PricesView,
  ServiceState,
  ServiceStatus,
  WatchItem,
  WishlistImportResult,
} from "./model";
import { readPriceSettings } from "./settings";
import { MANUAL_SYNC_FLOOR_MS } from "./sync";
import { withTimeout } from "./timeout";
import { cleanTitle, isNonEmptyText, isStoreGameId, validateMedia } from "./validate";
import { serviceScope, serviceStatusKey } from "./vault";

const ID: PriceServiceId = "itad";
const LUDIARY_STORES: readonly StoreId[] = ["steam", "gog", "epic", "ubisoft", "ea"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CURRENCY = /^[A-Z]{3}$/;
const HOST_SHAPE = /^[a-z0-9][a-z0-9.-]{0,252}$/;
const CONTROL = /\p{Cc}/u;
const MAX_MINOR = 1_000_000_000;
const MAX_DEALS = 100;
const MAX_URL = 2048;
const MAX_DROPPED_HOSTS = 8;
const KINDS: readonly string[] = ["game", "dlc", "package"];
const MIB = 1024 * 1024;

const notConnected = (): CoreError => new CoreError("action-unavailable", "No price service is connected", { key: asKey("prices.errors.notConnected") });
const invalidKey = (): CoreError => new CoreError("auth.invalid", "The price service key is not valid", { key: asKey("connectors.itad.errors.invalid") });
const limited = (): CoreError => new CoreError("busy", "The price service limit was reached", { key: asKey("prices.errors.limited") });

/** Ends the work quietly: the service is limited, the key was refused, or the service was disconnected meanwhile. */
class Stop extends Error {
  constructor(readonly reason: "limited" | "invalid" | "gone") {
    super(`price work stopped: ${reason}`);
  }
}

const chunk = <T>(items: readonly T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
};

/** Not a security hash: it only tells whether the inputs of a lookup changed (ADR 86 point 7). Two FNV-1a lanes. */
function hashInputs(text: string): string {
  let a = 0x811c9dc5;
  let b = 0x9e3779b9;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193);
    b = Math.imul(b ^ c, 0x85ebca6b);
  }
  return (a >>> 0).toString(16).padStart(8, "0") + (b >>> 0).toString(16).padStart(8, "0");
}

const isMinor = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= MAX_MINOR;

/** Point 7: https, no credentials, default port, at most 2048 characters, host in `linkHosts`. */
function checkLink(raw: unknown, hosts: readonly string[], dropped: Set<string>): string | undefined {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > MAX_URL || CONTROL.test(raw)) return undefined;
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return undefined;
  }
  if (u.protocol !== "https:" || u.username !== "" || u.password !== "" || u.port !== "") return undefined;
  const host = u.hostname.toLowerCase();
  if (!hosts.includes(host)) {
    if (HOST_SHAPE.test(host) && dropped.size < MAX_DROPPED_HOSTS) dropped.add(host);
    return undefined;
  }
  return raw; // validated through URL, shown as received (ITAD9)
}

/** Point 7: everything the service returned is untrusted. A deal that does not comply is dropped; the data is never altered. */
function validateSnapshot(raw: PriceSnapshot, hosts: readonly string[], dropped: Set<string>, counts: { links: number }): PriceSnapshotData {
  const deals: PriceDealRecord[] = [];
  for (const d of Array.isArray(raw.deals) ? raw.deals.slice(0, MAX_DEALS) : []) {
    if (!d || typeof d !== "object" || !d.shop || typeof d.shop !== "object") continue;
    if (!isNonEmptyText(d.shop.name, 300) || !isMinor(d.amountMinor) || !isMinor(d.regularMinor)) continue;
    if (typeof d.currency !== "string" || !CURRENCY.test(d.currency)) continue;
    if (typeof d.cut !== "number" || !Number.isInteger(d.cut) || d.cut < 0 || d.cut > 100) continue;
    const url = checkLink(d.url, hosts, dropped);
    if (url === undefined) counts.links++;
    const expires = typeof d.expiresAt === "string" ? Date.parse(d.expiresAt) : Number.NaN;
    deals.push({
      shop: { storeId: LUDIARY_STORES.includes(d.shop.storeId as StoreId) ? (d.shop.storeId as StoreId) : null, name: d.shop.name },
      amountMinor: d.amountMinor,
      regularMinor: d.regularMinor,
      currency: d.currency,
      cut: d.cut,
      voucher: isNonEmptyText(d.voucher, 300) ? d.voucher : null,
      ...(url !== undefined ? { url } : {}),
      ...(Number.isFinite(expires) ? { expiresAt: expires } : {}),
    });
  }
  const low = raw.historyLow;
  const historyLow = low && isMinor(low.amountMinor) && typeof low.currency === "string" && CURRENCY.test(low.currency) ? { amountMinor: low.amountMinor, currency: low.currency } : null;
  return { deals, historyLow };
}

/** Lookup answers: a Map whose keys were asked for and whose values are UUIDs; anything else is ignored. */
function validateLookup(answer: unknown, asked: ReadonlySet<string>): Map<string, string> {
  if (!(answer instanceof Map)) throw new ConnectorError("store.unexpected-response", "The lookup did not return a Map");
  const out = new Map<string, string>();
  for (const [k, v] of answer as Map<unknown, unknown>) {
    if (typeof k === "string" && asked.has(k) && typeof v === "string" && UUID.test(v)) out.set(k, v.toLowerCase());
  }
  return out;
}

interface Subject {
  id: string;
  title: string;
  /** Steam first, then GOG. */
  props: { store: "steam" | "gog"; storeGameId: string }[];
  hash: string;
}

interface SearchEntry {
  serviceGameId: string;
  title: string;
  type: PriceKind | null;
  /** Validated against the service's mediaHosts; copied to the follow list from here and never from the web (point 17.5). */
  media?: EntryMedia;
  at: number;
}

export interface PriceFeature {
  listServices(): Promise<readonly ServiceStatus[]>;
  disconnect(service: PriceServiceId): Promise<void>;
  gamePrices(canonicalId: string): Promise<GamePrices>;
  board(): Promise<PriceBoard>;
  refresh(req: { canonicalIds?: readonly string[]; watchIds?: readonly string[]; manual?: boolean }): Promise<void>;
  setExclusion(canonicalId: string, excluded: boolean): Promise<void>;
  search(title: string): Promise<readonly PriceSearchResult[]>;
  watch(resultId: string): Promise<{ item: WatchItem; created: boolean }>;
  unwatch(id: string): Promise<void>;
  /** ADR 91 and its point 13. Follows the store's wishlist; see the function for the rules. */
  importWishlist(store: StoreId): Promise<WishlistImportResult>;
}

/** Budget and 429 wait of the service, shared by the queries and the key check of the wizard (ADR 86 point 7). */
export interface PriceGate {
  /** false while a 429 wait lasts or the budget is spent; otherwise counts one request. */
  spend(): boolean;
  limitedUntil(): number | undefined;
  wait(until: number): void;
  /** The wizard's HttpClient: every request spends budget, respects the wait and records a 429. */
  guard(http: HttpClient): HttpClient;
}

export function createPriceGate(env: Env): PriceGate {
  const { deps } = env;
  /** Requests spent, per user, in memory (point 7). */
  const budgets = new Map<string, number[]>();
  /** One wait for the service after a 429. Kept across disconnects. */
  let waitUntil = 0;
  const spent = (): number[] => {
    const now = deps.clock.now();
    const list = (budgets.get(env.userId) ?? []).filter((t) => now - t < PRICE_BUDGET_WINDOW_MS);
    budgets.set(env.userId, list);
    return list;
  };
  const limitedUntil = (): number | undefined => {
    const list = spent();
    const until = Math.max(waitUntil, list.length >= PRICE_BUDGET ? list[0]! + PRICE_BUDGET_WINDOW_MS : 0);
    return until > deps.clock.now() ? until : undefined;
  };
  const gate: PriceGate = {
    spend() {
      if (waitUntil > deps.clock.now()) return false;
      const list = spent();
      if (list.length >= PRICE_BUDGET) return false;
      list.push(deps.clock.now());
      return true;
    },
    limitedUntil,
    wait: (until) => void (waitUntil = until),
    guard: (http) => ({
      async request(req) {
        if (!gate.spend()) {
          throw new ConnectorError("store.rate-limited", "The price request limit is spent", { messageKey: asKey("prices.errors.limited"), retryAfterMs: Math.max(0, (limitedUntil() ?? deps.clock.now()) - deps.clock.now()) });
        }
        try {
          return await http.request(req);
        } catch (e) {
          if (e instanceof ConnectorError && e.code === "store.rate-limited") gate.wait(deps.clock.now() + Math.min(e.details.retryAfterMs ?? PRICE_BUDGET_WINDOW_MS, MAX_MEDIA_RETRY_MS));
          throw e;
        }
      },
    }),
  };
  return gate;
}

/** `cancelWizards` drops the open wizard of the service (disconnect). */
export function createPriceFeature(
  env: Env,
  gate: PriceGate,
  cancelWizards: (key: ReturnType<typeof serviceKey>) => void,
  /** `SyncService.exclusive` (ADR 91 point 13, M1). */
  exclusive: <T>(store: StoreId, fn: () => Promise<T>) => Promise<T>,
): PriceFeature {
  const { deps } = env;
  const key = serviceKey(ID);
  const repo = () => deps.prices;
  const limitedUntil = gate.limitedUntil;
  let lastManualAt = -Infinity;
  const inflight = new Map<string, Promise<void>>();
  /** ADR 91: when each store was last imported (memory only). */
  const lastImport = new Map<StoreId, number>();
  /** Recent search results, per user: resultId -> what the server saw (point 15, M6). */
  const searches = new Map<string, Map<string, SearchEntry>>();

  async function state(): Promise<ServiceState> {
    if (!env.services.has(ID) || !(await deps.secrets.get(serviceScope(ID), "apiKey"))) return "disconnected";
    const st = await deps.settings.get(serviceStatusKey(ID));
    return st === "invalid" || st === "expired" ? st : "connected";
  }

  /** For the routes that need a working key. */
  async function ready(): Promise<PriceService> {
    const svc = env.services.get(ID);
    if (!svc || !repo()) throw notConnected();
    const st = await state();
    if (st === "disconnected") throw notConnected();
    if (st !== "connected") throw invalidKey();
    return svc;
  }

  /** One request to the service: epoch, wait, budget, time limit and the error rules of point 15 (M2). */
  async function query<T>(epoch: number, svc: PriceService, maxBytes: number, work: (ctx: SyncContext) => Promise<T>): Promise<T> {
    if (epochOf(env, key) !== epoch) throw new Stop("gone");
    if (!gate.spend()) throw new Stop("limited");
    const signal = deps.clock.timeout(PRICE_CALL_MS);
    try {
      return await withTimeout(signal, async () => work(await serviceContext(env, svc, signal, { maxBytes })));
    } catch (e) {
      if (e instanceof ConnectorError) {
        deps.log.warn("Price service call failed", { service: ID, code: e.code });
        if (e.code === "auth.required") throw new Stop("gone");
        if (e.code === "auth.invalid") {
          if (epochOf(env, key) === epoch) await deps.settings.set(serviceStatusKey(ID), "invalid");
          throw new Stop("invalid");
        }
        if (e.code === "store.rate-limited") {
          gate.wait(deps.clock.now() + Math.min(e.details.retryAfterMs ?? PRICE_BUDGET_WINDOW_MS, MAX_MEDIA_RETRY_MS));
          throw new Stop("limited");
        }
      }
      throw e;
    }
  }

  const view = (r: PriceSnapshotRecord): PricesView => ({
    country: r.country,
    fetchedAt: r.fetchedAt,
    stale: deps.clock.now() - r.fetchedAt >= PRICE_TTL_MS,
    deals: r.data.deals,
    historyLow: r.data.historyLow,
  });

  async function boardState(): Promise<PriceBoardState & { country: string | null; shops: PriceShops }> {
    const [service, { country, shops }] = await Promise.all([state(), readPriceSettings(env)]);
    const until = limitedUntil();
    return { service, needsCountry: country === null, country, shops, ...(until !== undefined ? { limitedUntil: until } : {}) };
  }
  const publicState = ({ service, needsCountry, limitedUntil: until }: PriceBoardState): PriceBoardState => ({ service, needsCountry, ...(until !== undefined ? { limitedUntil: until } : {}) });

  async function subjectOf(id: string): Promise<Subject | null> {
    const game = await deps.library.getGame(id);
    if (!game) return null;
    const targets = await deps.library.getLaunchTargets(id);
    const props: Subject["props"] = [];
    for (const t of targets) {
      const p = t.property;
      if (p.kind === "game" && p.removedAt === null && p.storeGameId !== null && (p.store === "steam" || p.store === "gog")) props.push({ store: p.store, storeGameId: p.storeGameId });
    }
    props.sort((a, b) => (a.store === b.store ? (a.storeGameId < b.storeGameId ? -1 : 1) : a.store === "steam" ? -1 : 1));
    return { id, title: game.title, props, hash: hashInputs(`${game.title}\n${props.map((p) => `${p.store}:${p.storeGameId}`).join(",")}`) };
  }

  const needsLookup = (s: Subject, link: PriceLinkRecord | undefined, now: number): boolean => {
    if (!link) return true;
    if (link.status === "excluded") return false;
    if (link.inputsHash !== s.hash) return true;
    return link.status === "not-found" && now - link.lookedUpAt >= PRICE_NOT_FOUND_RETRY_MS;
  };

  /** Steam, then GOG, then the title (point 7). Two different ids from the stores: conflict. */
  async function resolveLinks(epoch: number, svc: PriceService, subjects: readonly Subject[]): Promise<void> {
    const store = repo()!;
    const found = new Map<string, Map<string, string>>(); // store -> storeGameId -> service id
    for (const st of ["steam", "gog"] as const) {
      const ids = [...new Set(subjects.flatMap((s) => s.props.filter((p) => p.store === st).map((p) => p.storeGameId)))];
      const results = new Map<string, string>();
      for (const batch of chunk(ids, PRICE_LOOKUP_BATCH)) {
        const answer = await query(epoch, svc, MIB, (ctx) => svc.lookupByStore(st, batch, ctx));
        for (const [k, v] of validateLookup(answer, new Set(batch))) results.set(k, v);
      }
      found.set(st, results);
    }
    const write = async (s: Subject, status: PriceLinkRecord["status"], serviceGameId: string | null, source: PriceLinkSource | null) => {
      if (epochOf(env, key) !== epoch) throw new Stop("gone");
      await store.putLink({ canonicalGameId: s.id, service: ID, serviceGameId, status, source, inputsHash: s.hash, lookedUpAt: deps.clock.now() });
    };
    const rest: Subject[] = [];
    for (const s of subjects) {
      const hits = s.props.flatMap((p) => {
        const id = found.get(p.store)?.get(p.storeGameId);
        return id ? [{ source: p.store, id }] : [];
      });
      const distinct = new Set(hits.map((h) => h.id));
      if (distinct.size > 1) await write(s, "conflict", null, null);
      else if (hits[0]) await write(s, "found", hits[0].id, hits[0].source);
      else rest.push(s);
    }
    const titles = [...new Set(rest.map((s) => s.title))];
    const byTitle = new Map<string, string>();
    for (const batch of chunk(titles, PRICE_LOOKUP_BATCH)) {
      const answer = await query(epoch, svc, MIB, (ctx) => svc.lookupByTitle(batch, ctx));
      for (const [k, v] of validateLookup(answer, new Set(batch))) byTitle.set(k, v);
    }
    for (const s of rest) {
      const id = byTitle.get(s.title);
      await (id ? write(s, "found", id, "title") : write(s, "not-found", null, null));
    }
  }

  async function fetchPrices(epoch: number, svc: PriceService, ids: readonly string[], country: string, shops: PriceShops, manual: boolean): Promise<void> {
    const store = repo()!;
    const have = await store.getSnapshots(ID, ids, country, shops);
    const now = deps.clock.now();
    const todo = ids.filter((id) => manual || !have.has(id) || now - have.get(id)!.fetchedAt >= PRICE_TTL_MS);
    const dropped = new Set<string>();
    const counts = { links: 0 };
    let deals = 0;
    for (const batch of chunk(todo, shops === "all" ? PRICE_BATCH_ALL : PRICE_BATCH)) {
      const answer = await query(epoch, svc, 4 * MIB, (ctx) => svc.prices(batch, { country, shops: shops === "all" ? "all" : LUDIARY_STORES }, ctx));
      if (!Array.isArray(answer)) throw new ConnectorError("store.unexpected-response", "prices did not return a list");
      const asked = new Set(batch);
      const byId = new Map<string, PriceSnapshotData>();
      for (const snap of answer as PriceSnapshot[]) {
        const id = typeof snap?.id === "string" ? snap.id.toLowerCase() : "";
        if (asked.has(id)) byId.set(id, validateSnapshot(snap, svc.linkHosts, dropped, counts));
      }
      // An id the service did not answer is cached as "no data", so it is not asked again before the TTL.
      const fetchedAt = deps.clock.now();
      const records = batch.map((id): PriceSnapshotRecord => ({ service: ID, serviceGameId: id, country, shops, data: byId.get(id) ?? { deals: [], historyLow: null }, fetchedAt }));
      for (const r of records) deals += r.data.deals.length;
      if (epochOf(env, key) !== epoch) throw new Stop("gone");
      await store.putSnapshots(records);
    }
    if (todo.length > 0) deps.log.info("Prices refreshed", { service: ID, requested: todo.length, deals });
    if (counts.links > 0) deps.log.warn("Deal links dropped", { service: ID, linksDropped: counts.links, droppedLinkHosts: [...dropped].join(",") });
  }

  const textOk = (v: unknown): v is string => typeof v === "string" && v !== "";
  const idList = (v: unknown, what: string): readonly string[] => {
    if (v === undefined) return [];
    if (!Array.isArray(v) || v.length > 200 || !v.every(textOk)) throw new CoreError("invalid-input", `${what} must be a list of ids`);
    return [...new Set(v as string[])];
  };

  /** ADR 86 point 17: a game of the library shows its own cover; otherwise the saved one, if its host is still allowed by img-src. */
  async function coversOf(
    ownedId: string | undefined,
    saved: { coverUrl?: string | undefined; coverFallbackUrl?: string | undefined },
    library?: ReadonlyMap<string, { coverUrl?: string; coverFallbackUrl?: string }>,
  ): Promise<{ coverUrl?: string; coverFallbackUrl?: string }> {
    if (ownedId) {
      const g = library ? library.get(ownedId) : await deps.library.getGame(ownedId);
      return { ...(g?.coverUrl ? { coverUrl: g.coverUrl } : {}), ...(g?.coverFallbackUrl ? { coverFallbackUrl: g.coverFallbackUrl } : {}) };
    }
    const hosts = [...env.connectors.values(), ...env.services.values()].flatMap((c) => c.mediaHosts);
    const m = validateMedia({ coverUrl: saved.coverUrl, heroUrl: saved.coverFallbackUrl }, hosts);
    return { ...(m?.coverUrl ? { coverUrl: m.coverUrl } : {}), ...(m?.heroUrl ? { coverFallbackUrl: m.heroUrl } : {}) };
  }

  async function itemOf(
    w: PriceWatchRecord,
    snaps: ReadonlyMap<string, PriceSnapshotRecord>,
    owned: ReadonlyMap<string, string>,
    library?: ReadonlyMap<string, { coverUrl?: string; coverFallbackUrl?: string }>,
  ): Promise<WatchItem> {
    const snap = snaps.get(w.serviceGameId);
    const ownedId = owned.get(w.serviceGameId);
    return { id: w.id, title: w.title, type: w.type, ...(ownedId ? { ownedGameId: ownedId } : {}), ...(await coversOf(ownedId, w, library)), origin: w.origin, prices: snap ? view(snap) : null };
  }

  /**
   * ADR 91 point 5 and 13. Reads the store's wishlist (ids), looks the new ids up in the service in the store's order until the
   * follow list is full, asks the store for the title and image of only those, and writes everything in ONE transaction at the end:
   * a failed batch writes nothing. Only rows with this store as origin are ever deleted, and only after a complete, non-empty list.
   */
  async function importWishlist(storeRaw: StoreId): Promise<WishlistImportResult> {
    const svc = await ready();
    const c = typeof storeRaw === "string" ? env.connectors.get(storeRaw) : undefined;
    if (!c || !c.readWishlist || !c.describeWishlistItems || (c.id !== "steam" && c.id !== "gog")) throw new CoreError("action-unavailable", "This store has no wishlist import");
    const readWishlist = c.readWishlist.bind(c);
    const describe = c.describeWishlistItems.bind(c);
    const origin: "steam" | "gog" = c.id;
    const connected = async () => (await deps.connections.get(c.id))?.status === "connected";
    if (!(await connected())) throw new CoreError("auth.required", "The store is not connected");
    const now = deps.clock.now();
    const next = (lastImport.get(c.id) ?? -Infinity) + WISHLIST_IMPORT_FLOOR_MS;
    if (now < next) throw new CoreError("store.rate-limited", "The wishlist was imported a moment ago", { key: asKey("prices.errors.wishlistFloor"), params: { minutes: Math.ceil((next - now) / 60_000) } });
    lastImport.set(c.id, now);
    const store = repo()!;

    return exclusive(c.id, async () => {
      const storeEpoch = epochOf(env, c.id);
      const svcEpoch = epochOf(env, key);
      const signal = deps.clock.timeout(LIBRARY_TIMEOUT_MS);
      try {
        if (!(await connected())) throw new CoreError("auth.required", "The store is not connected");
        // 1. The ids, in store order. The context lets GOG rotate its token (it is not a sync: the lock above is what keeps two renewals apart).
        const snapshot = await withTimeout(signal, async () => readWishlist(await syncContext(env, c, signal, { epoch: "guard" })));
        if (!snapshot || typeof snapshot !== "object" || !Array.isArray(snapshot.entries)) throw new ConnectorError("store.unexpected-response", "readWishlist returned no list");
        const ids: string[] = [];
        const seen = new Set<string>();
        let lossy = snapshot.entries.length > WISHLIST_MAX_ENTRIES;
        for (const e of snapshot.entries.slice(0, WISHLIST_MAX_ENTRIES)) {
          const id = (e as { storeGameId?: unknown } | null)?.storeGameId;
          if (!isStoreGameId(id)) lossy = true;
          else if (!seen.has(id)) {
            seen.add(id);
            ids.push(id);
          }
        }
        const complete = snapshot.complete === true && !lossy;
        const result: WishlistImportResult = { added: 0, removed: 0, alreadyWatched: 0, notFound: 0, overLimit: 0, hiddenOrEmpty: ids.length === 0 };
        if (ids.length === 0) return result; // hidden or empty: nothing is added and, above all, nothing is deleted

        // 2. What is already followed.
        const watch = await store.listWatch(ID);
        const bySgid = new Map(watch.map((w) => [w.serviceGameId, w]));
        const known = new Set(watch.filter((w) => w.origin === origin).map((w) => w.originStoreGameId));
        const stale = complete ? watch.filter((w) => w.origin === origin && w.originStoreGameId !== null && !seen.has(w.originStoreGameId)) : [];
        const staleIds = new Set(stale.map((w) => w.id));
        const fresh = ids.filter((id) => !known.has(id));
        result.alreadyWatched = ids.length - fresh.length;
        // As if every stale row went; a row that stays (below) takes its slot back.
        const hole = Math.max(0, WATCH_MAX - (watch.length - stale.length));

        // 3. Lookup in batches of 200, in store order, until the finds fill the hole. A failed batch ends everything with nothing written.
        const found: { id: string; sgid: string }[] = [];
        const taken = new Set<string>();
        const rekey = new Map<string, string>(); // watch id -> new origin id (point 13, low (b), same store)
        let looked = 0;
        for (const batch of chunk(fresh, PRICE_LOOKUP_BATCH)) {
          if (found.length >= hole) break;
          const answer = validateLookup(await query(svcEpoch, svc, MIB, (ctx) => svc.lookupByStore(origin, batch, ctx)), new Set(batch));
          looked += batch.length;
          for (const id of batch) {
            const sgid = answer.get(id);
            if (!sgid) result.notFound++;
            else if (taken.has(sgid)) result.alreadyWatched++; // two ids of the store are one game of the service
            else {
              taken.add(sgid);
              const w = bySgid.get(sgid);
              if (!w) found.push({ id, sgid });
              else {
                result.alreadyWatched++;
                if (staleIds.has(w.id)) {
                  staleIds.delete(w.id);
                  rekey.set(w.id, id);
                }
              }
            }
          }
        }
        result.overLimit += fresh.length - looked; // never looked up: there was no room

        // 4. Titles and images of only the ones that will be added.
        const capacity = Math.max(0, WATCH_MAX - (watch.length - staleIds.size));
        const add = found.slice(0, capacity);
        result.overLimit += found.length - add.length;
        let info: ReadonlyMap<string, { title?: unknown; media?: unknown }> = new Map();
        if (add.length > 0) {
          const answer = await withTimeout(signal, async () => describe(add.map((a) => a.id), await syncContext(env, c, signal)));
          if (!(answer instanceof Map)) throw new ConnectorError("store.unexpected-response", "describeWishlistItems did not return a Map");
          info = answer as ReadonlyMap<string, { title?: unknown; media?: unknown }>;
        }
        const at = deps.clock.now();
        const records: PriceWatchRecord[] = add.map((a) => {
          const i = info.get(a.id);
          const media = validateMedia(i?.media, c.mediaHosts);
          return {
            id: deps.newId(),
            service: ID,
            serviceGameId: a.sgid,
            title: cleanTitle(i?.title) ?? `${STORE_NAMES[origin]} ${a.id}`,
            type: null,
            ...(media?.coverUrl ? { coverUrl: media.coverUrl } : {}),
            ...(media?.heroUrl ? { coverFallbackUrl: media.heroUrl } : {}),
            addedAt: at,
            origin,
            originStoreGameId: a.id,
          };
        });

        // 5. One transaction, only if neither the store nor the service changed meanwhile (point 5.5).
        if (epochOf(env, c.id) !== storeEpoch) throw new CoreError("auth.required", "The store connection changed during the import");
        if (epochOf(env, key) !== svcEpoch) throw notConnected();
        const done = await store.applyWishlistImport({ remove: [...staleIds], rekey: [...rekey].map(([id, originStoreGameId]) => ({ id, originStoreGameId })), add: records }, WATCH_MAX);
        result.added = done.added;
        result.removed = done.removed;
        result.alreadyWatched += records.length - done.added; // followed by hand while the import ran
        deps.log.info("Wishlist imported", { store: origin, requested: fresh.length, found: found.length, notFound: result.notFound, added: result.added, removed: result.removed });
        return result;
      } catch (e) {
        if (e instanceof Stop) throw e.reason === "limited" ? limited() : e.reason === "invalid" ? invalidKey() : notConnected();
        // Point 13 M2: a failure never touches the connection, but a rejected GOG renewal is an expired session, as in the sync (ADR 77).
        if (e instanceof ConnectorError && e.code === "auth.expired" && epochOf(env, c.id) === storeEpoch) await deps.connections.setStatus(c.id, "expired");
        // Audit of ADR 91: no answer from the store (network or timeout) does not spend the floor; anything else does.
        if (e instanceof ConnectorError && (e.code === "network.unavailable" || e.code === "network.timeout") && lastImport.get(c.id) === now) lastImport.delete(c.id);
        deps.log.warn("Wishlist import failed", { store: origin, code: e instanceof ConnectorError || e instanceof CoreError ? e.code : "internal" });
        throw toCoreError(e);
      }
    });
  }

  return {
    async listServices() {
      return Promise.all(
        [...env.services.keys()].map(async (service): Promise<ServiceStatus> => {
          const status = await state();
          return { service, purpose: "prices", available: true, configured: status !== "disconnected", status };
        }),
      );
    },

    async disconnect(service) {
      const svc = env.services.get(service);
      if (!svc) throw new CoreError("not-found", "Unknown service");
      cancelWizards(key);
      bumpEpoch(env, key); // a refresh in flight can no longer write
      const signal = deps.clock.timeout(30_000);
      try {
        await withTimeout(signal, async () => svc.connection.disconnect(await serviceContext(env, svc, signal)));
      } catch (e) {
        deps.log.warn("The service could not disconnect cleanly", { service, code: e instanceof ConnectorError ? e.code : "internal" });
      }
      await deps.secrets.deleteScope(serviceScope(service));
      await deps.settings.delete(serviceStatusKey(service));
      await repo()?.clearService(service);
      searches.delete(env.userId);
      bumpEpoch(env, key);
    },

    async gamePrices(canonicalId) {
      if (typeof canonicalId !== "string" || canonicalId === "") throw new CoreError("invalid-input", "Missing game id");
      if (!(await deps.library.getGame(canonicalId))) throw new CoreError("not-found", "The game is not shown");
      const st = await boardState();
      const base = publicState(st);
      const store = repo();
      const link = store ? (await store.getLinks(ID, [canonicalId])).get(canonicalId) : undefined;
      let prices: PricesView | null = null;
      if (store && link?.status === "found" && link.serviceGameId && st.country) {
        const snap = (await store.getSnapshots(ID, [link.serviceGameId], st.country, st.shops)).get(link.serviceGameId);
        prices = snap ? view(snap) : null;
      }
      return { ...base, link: link?.status ?? "pending", prices };
    },

    async board() {
      const st = await boardState();
      const store = repo();
      if (!store) return { ...publicState(st), items: [], wishlistStores: [] };
      const watch = await store.listWatch(ID);
      const ids = watch.map((w) => w.serviceGameId);
      const [snaps, owned] = await Promise.all([st.country ? store.getSnapshots(ID, ids, st.country, st.shops) : new Map<string, PriceSnapshotRecord>(), store.findOwned(ID, ids)]);
      // One library read for the whole board instead of one getGame per owned game.
      const library = owned.size > 0 ? new Map((await deps.library.listLibrary()).map((g) => [g.id, g])) : undefined;
      const items = await Promise.all(watch.map((w) => itemOf(w, snaps, owned, library)));
      const connected = new Set((await deps.connections.list()).filter((r) => r.status === "connected").map((r) => r.store));
      const wishlistStores = [...env.connectors.values()].filter((c) => c.readWishlist && connected.has(c.id)).map((c) => c.id);
      const best = (i: WatchItem) => Math.max(-1, ...(i.prices?.deals.map((d) => d.cut) ?? []));
      // Largest discount first; Array.sort is stable, so equal ones keep the order they were added.
      return { ...publicState(st), items: items.sort((a, b) => best(b) - best(a)), wishlistStores };
    },

    async refresh(req) {
      if (!req || typeof req !== "object") throw new CoreError("invalid-input", "Invalid refresh request");
      const canonicalIds = idList(req.canonicalIds, "canonicalIds");
      const watchIds = idList(req.watchIds, "watchIds");
      const manual = req.manual === true;
      const svc = await ready();
      const { country, shops } = await readPriceSettings(env);
      if (country === null) throw new CoreError("invalid-input", "No country chosen", { key: asKey("prices.errors.countryMissing") });
      if (manual) {
        if (deps.clock.now() < lastManualAt + MANUAL_SYNC_FLOOR_MS) return;
        lastManualAt = deps.clock.now();
      }
      const epoch = epochOf(env, key);
      // One query at a time per game (or follow-list item), country and shops: whoever comes second waits (point 15, M3).
      const tag = `${country}|${shops}`;
      const mineGames = canonicalIds.filter((id) => !inflight.has(`g:${id}|${tag}`));
      const mineWatch = watchIds.filter((id) => !inflight.has(`w:${id}|${tag}`));
      const waiting = [...canonicalIds.filter((id) => inflight.has(`g:${id}|${tag}`)).map((id) => inflight.get(`g:${id}|${tag}`)!), ...watchIds.filter((id) => inflight.has(`w:${id}|${tag}`)).map((id) => inflight.get(`w:${id}|${tag}`)!)];
      let release: () => void = () => undefined;
      const done = new Promise<void>((resolve) => (release = resolve));
      const keys = [...mineGames.map((id) => `g:${id}|${tag}`), ...mineWatch.map((id) => `w:${id}|${tag}`)];
      for (const k of keys) inflight.set(k, done);
      try {
        const store = repo()!;
        const subjects = (await Promise.all(mineGames.map(subjectOf))).filter((s): s is Subject => s !== null);
        const links = await store.getLinks(ID, subjects.map((s) => s.id));
        const now = deps.clock.now();
        const stale = subjects.filter((s) => needsLookup(s, links.get(s.id), now));
        if (stale.length > 0) await resolveLinks(epoch, svc, stale);
        const after = stale.length > 0 ? await store.getLinks(ID, subjects.map((s) => s.id)) : links;
        const ids = new Set<string>();
        for (const s of subjects) {
          const l = after.get(s.id);
          if (l?.status === "found" && l.serviceGameId) ids.add(l.serviceGameId);
        }
        for (const w of await Promise.all(mineWatch.map((id) => store.getWatch(id)))) if (w) ids.add(w.serviceGameId);
        await fetchPrices(epoch, svc, [...ids], country, shops, manual);
      } catch (e) {
        if (!(e instanceof Stop)) throw e;
      } finally {
        for (const k of keys) inflight.delete(k);
        release();
      }
      await Promise.all(waiting);
    },

    async setExclusion(canonicalId, excluded) {
      const store = repo();
      if (!store || !env.services.has(ID)) throw notConnected();
      if (typeof canonicalId !== "string" || canonicalId === "") throw new CoreError("invalid-input", "Missing game id");
      if (!(await deps.library.getGame(canonicalId))) throw new CoreError("not-found", "The game is not shown");
      if (excluded) await store.putLink({ canonicalGameId: canonicalId, service: ID, serviceGameId: null, status: "excluded", source: null, inputsHash: "", lookedUpAt: deps.clock.now() });
      else await store.deleteLink(ID, canonicalId);
    },

    async search(titleRaw) {
      const title = typeof titleRaw === "string" ? titleRaw.trim() : "";
      if (title.length < 2 || title.length > 100 || CONTROL.test(title)) throw new CoreError("invalid-input", "The search text must have 2 to 100 characters");
      const svc = await ready();
      const epoch = epochOf(env, key);
      let raw: Awaited<ReturnType<PriceService["search"]>>;
      try {
        raw = await query(epoch, svc, 512 * 1024, (ctx) => svc.search(title, ctx));
      } catch (e) {
        if (e instanceof Stop) throw e.reason === "limited" ? limited() : e.reason === "invalid" ? invalidKey() : notConnected();
        throw e;
      }
      if (!Array.isArray(raw)) throw new ConnectorError("store.unexpected-response", "search did not return a list");
      const seen = new Set<string>();
      const good: { id: string; title: string; type: PriceKind | null; media?: EntryMedia }[] = [];
      for (const r of raw) {
        if (good.length >= SEARCH_MAX_RESULTS) break;
        if (!r || typeof r.id !== "string" || !UUID.test(r.id) || !isNonEmptyText(r.title, 300)) continue;
        const id = r.id.toLowerCase();
        if (seen.has(id)) continue;
        seen.add(id);
        const media = validateMedia(r.media, svc.mediaHosts);
        good.push({ id, title: r.title, type: KINDS.includes(r.type as string) ? (r.type as PriceKind) : null, ...(media ? { media } : {}) });
      }
      const mine = searches.get(env.userId) ?? new Map<string, SearchEntry>();
      searches.set(env.userId, mine);
      const now = deps.clock.now();
      for (const [k, v] of mine) if (now - v.at >= SEARCH_TTL_MS) mine.delete(k);
      const store = repo()!;
      const [owned, watch] = await Promise.all([store.findOwned(ID, good.map((g) => g.id)), store.listWatch(ID)]);
      const watched = new Set(watch.map((w) => w.serviceGameId));
      const out = await Promise.all(good.map(async (g): Promise<PriceSearchResult> => {
        const resultId = deps.newId();
        const ownedId = owned.get(g.id);
        // A game of the library neither asks for nor saves the service's image (point 17.1).
        const media = ownedId ? undefined : g.media;
        mine.set(resultId, { serviceGameId: g.id, title: g.title, type: g.type, ...(media ? { media } : {}), at: now });
        const covers = await coversOf(ownedId, { coverUrl: media?.coverUrl, coverFallbackUrl: media?.heroUrl });
        return { resultId, title: g.title, type: g.type, ...(ownedId ? { ownedGameId: ownedId } : {}), ...covers, watched: watched.has(g.id) };
      }));
      while (mine.size > SEARCH_KEEP) mine.delete(mine.keys().next().value!);
      return out;
    },

    async watch(resultId) {
      await ready();
      const entry = typeof resultId === "string" ? searches.get(env.userId)?.get(resultId) : undefined;
      if (!entry || deps.clock.now() - entry.at >= SEARCH_TTL_MS) throw new CoreError("not-found", "Unknown or expired search result");
      const store = repo()!;
      const { record, created } = await store.addWatch({ id: deps.newId(), service: ID, serviceGameId: entry.serviceGameId, title: entry.title, type: entry.type, ...(entry.media?.coverUrl ? { coverUrl: entry.media.coverUrl } : {}), ...(entry.media?.heroUrl ? { coverFallbackUrl: entry.media.heroUrl } : {}), addedAt: deps.clock.now(), origin: "manual", originStoreGameId: null }, WATCH_MAX);
      const { country, shops } = await readPriceSettings(env);
      const snaps = country ? await store.getSnapshots(ID, [record.serviceGameId], country, shops) : new Map<string, PriceSnapshotRecord>();
      return { item: await itemOf(record, snaps, await store.findOwned(ID, [record.serviceGameId])), created };
    },

    importWishlist,

    async unwatch(id) {
      if (typeof id !== "string" || id === "") throw new CoreError("invalid-input", "Missing id");
      const store = repo();
      if (!store) throw notConnected();
      await store.deleteWatch(id);
    },
  };
}
