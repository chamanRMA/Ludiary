// Price comparison (ADR 86, points 7 and 15). The service describes and fetches; the core matches games, validates
// everything it returns as untrusted, caches, spends a budget and decides what the user sees.
import { ConnectorError } from "@ludiary/contracts";
import type { PriceService, PriceServiceId, PriceSnapshot, StoreId, SyncContext } from "@ludiary/contracts";
import { epochOf, bumpEpoch, serviceContext, serviceKey } from "./contexts";
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
  WATCH_MAX,
  type Env,
} from "./env";
import { asKey, CoreError } from "./errors";
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
} from "./model";
import { readPriceSettings } from "./settings";
import { MANUAL_SYNC_FLOOR_MS } from "./sync";
import { withTimeout } from "./timeout";
import { isNonEmptyText } from "./validate";
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
  return u.href;
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
}

/** `cancelWizards` drops the open wizard of the service (disconnect). */
export function createPriceFeature(env: Env, cancelWizards: (key: ReturnType<typeof serviceKey>) => void): PriceFeature {
  const { deps } = env;
  const key = serviceKey(ID);
  const repo = () => deps.prices;
  /** Requests spent, per user, in memory (point 7). */
  const budgets = new Map<string, number[]>();
  /** One wait for the service after a 429. */
  let waitUntil = 0;
  let lastManualAt = -Infinity;
  const inflight = new Map<string, Promise<void>>();
  /** Recent search results, per user: resultId -> what the server saw (point 15, M6). */
  const searches = new Map<string, Map<string, SearchEntry>>();

  const spent = (): number[] => {
    const now = deps.clock.now();
    const list = (budgets.get(env.userId) ?? []).filter((t) => now - t < PRICE_BUDGET_WINDOW_MS);
    budgets.set(env.userId, list);
    return list;
  };
  const spend = (): boolean => {
    const list = spent();
    if (list.length >= PRICE_BUDGET) return false;
    list.push(deps.clock.now());
    return true;
  };
  const limitedUntil = (): number | undefined => {
    const list = spent();
    const until = Math.max(waitUntil, list.length >= PRICE_BUDGET ? list[0]! + PRICE_BUDGET_WINDOW_MS : 0);
    return until > deps.clock.now() ? until : undefined;
  };

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
    if (waitUntil > deps.clock.now() || !spend()) throw new Stop("limited");
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
          waitUntil = deps.clock.now() + Math.min(e.details.retryAfterMs ?? PRICE_BUDGET_WINDOW_MS, MAX_MEDIA_RETRY_MS);
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

  async function itemOf(w: PriceWatchRecord, snaps: ReadonlyMap<string, PriceSnapshotRecord>, owned: ReadonlyMap<string, string>): Promise<WatchItem> {
    const snap = snaps.get(w.serviceGameId);
    const ownedId = owned.get(w.serviceGameId);
    return { id: w.id, title: w.title, type: w.type, ...(ownedId ? { ownedGameId: ownedId } : {}), prices: snap ? view(snap) : null };
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
      waitUntil = 0;
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
      if (!store) return { ...publicState(st), items: [] };
      const watch = await store.listWatch(ID);
      const ids = watch.map((w) => w.serviceGameId);
      const [snaps, owned] = await Promise.all([st.country ? store.getSnapshots(ID, ids, st.country, st.shops) : new Map<string, PriceSnapshotRecord>(), store.findOwned(ID, ids)]);
      const items = await Promise.all(watch.map((w) => itemOf(w, snaps, owned)));
      const best = (i: WatchItem) => Math.max(-1, ...(i.prices?.deals.map((d) => d.cut) ?? []));
      // Largest discount first; Array.sort is stable, so equal ones keep the order they were added.
      return { ...publicState(st), items: items.sort((a, b) => best(b) - best(a)) };
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
      const good: { id: string; title: string; type: PriceKind | null }[] = [];
      for (const r of raw) {
        if (good.length >= SEARCH_MAX_RESULTS) break;
        if (!r || typeof r.id !== "string" || !UUID.test(r.id) || !isNonEmptyText(r.title, 300)) continue;
        const id = r.id.toLowerCase();
        if (seen.has(id)) continue;
        seen.add(id);
        good.push({ id, title: r.title, type: KINDS.includes(r.type as string) ? (r.type as PriceKind) : null });
      }
      const mine = searches.get(env.userId) ?? new Map<string, SearchEntry>();
      searches.set(env.userId, mine);
      const now = deps.clock.now();
      for (const [k, v] of mine) if (now - v.at >= SEARCH_TTL_MS) mine.delete(k);
      const store = repo()!;
      const [owned, watch] = await Promise.all([store.findOwned(ID, good.map((g) => g.id)), store.listWatch(ID)]);
      const watched = new Set(watch.map((w) => w.serviceGameId));
      const out = good.map((g): PriceSearchResult => {
        const resultId = deps.newId();
        mine.set(resultId, { serviceGameId: g.id, title: g.title, type: g.type, at: now });
        const ownedId = owned.get(g.id);
        return { resultId, title: g.title, type: g.type, ...(ownedId ? { ownedGameId: ownedId } : {}), watched: watched.has(g.id) };
      });
      while (mine.size > SEARCH_KEEP) mine.delete(mine.keys().next().value!);
      return out;
    },

    async watch(resultId) {
      await ready();
      const entry = typeof resultId === "string" ? searches.get(env.userId)?.get(resultId) : undefined;
      if (!entry || deps.clock.now() - entry.at >= SEARCH_TTL_MS) throw new CoreError("not-found", "Unknown or expired search result");
      const store = repo()!;
      const { record, created } = await store.addWatch({ id: deps.newId(), service: ID, serviceGameId: entry.serviceGameId, title: entry.title, type: entry.type, addedAt: deps.clock.now() }, WATCH_MAX);
      const { country, shops } = await readPriceSettings(env);
      const snaps = country ? await store.getSnapshots(ID, [record.serviceGameId], country, shops) : new Map<string, PriceSnapshotRecord>();
      return { item: await itemOf(record, snaps, await store.findOwned(ID, [record.serviceGameId])), created };
    },

    async unwatch(id) {
      if (typeof id !== "string" || id === "") throw new CoreError("invalid-input", "Missing id");
      const store = repo();
      if (!store) throw notConnected();
      await store.deleteWatch(id);
    },
  };
}
