// Owned games: getEntitlements (paged) then getOffers (batches); offer -> contentId (ADR 82, points 5 and 6, and 13).
import { ConnectorError, type EntryMedia, type LibrarySnapshot, type StoreEntry, type SyncContext } from "@ludiary/contracts";
import { EaGraphql, expiredError, isObject, k, readSession } from "./auth";
import { inferBaseGame, indexBaseTitles } from "./dlc";
import { ID_RE } from "./installerdata";

// shortcut: storefronts is [EA] only; EA games bought on Steam or Epic do not come through EA until STEAM/EPIC are confirmed as valid values in the manual test.
const ENTITLEMENTS_QUERY =
  'query getEntitlements($limit:Int,$next:String){me{ownedGameProducts(locale:"DEFAULT",entitlementEnabled:true,storefronts:[EA],platforms:[PC],type:[DIGITAL_FULL_GAME,PACKAGED_FULL_GAME],paging:{limit:$limit,next:$next}){next items{originOfferId product{name baseItem{gameType}}}}}}';
// product.name comes from an older Lutris and is unverified: if EA rejects the query, it runs again once without it.
const ENTITLEMENTS_QUERY_NO_NAME = ENTITLEMENTS_QUERY.replace("product{name baseItem", "product{baseItem");
// Field names as in Lutris ea_app.py (checked 24-10-2026, assumption EAA9): paging{limit,next}; the game type comes with the entitlement
// (product.baseItem.gameType); title and art are under gameProducts.items.baseItem.
const OFFERS_QUERY =
  'query getOffers($offerIds:[String!]!){legacyOffers(offerIds:$offerIds,locale:"DEFAULT"){offerId:id contentId} gameProducts(offerIds:$offerIds,locale:"DEFAULT"){items{id originOfferId baseItem{title packArt{largestImage{path}}}}}}';
export const PAGE_LIMIT = 100;
export const MAX_PAGES = 200;
export const MAX_ENTITLEMENTS = 50_000;
export const BATCH = 50;
const MAX_TITLE = 300;
const MAX_ART = 1024;
const MAX_ART_HOSTS = 8;
export const MEDIA_HOSTS = ["app-images.ea.com", "drop-assets.ea.com"]; // seen in the real test 24-10-2026 (app-images); must equal manifest mediaHosts
// Known add-on values (Lutris uses EXTRA_CONTENT); any other type is left out and counted.
const ADDON_TYPES = new Set(["EXTRA_CONTENT", "EXPANSION", "ADDON", "DLC"]);
const GAME_TYPES = new Set(["BASE_GAME"]);

const bad = (msg: string): ConnectorError => new ConnectorError("store.unexpected-response", msg);

/** https, exact host, no user or port (the prefix fixes the authority), no whitespace or control characters, 1024 at most. */
// eslint-disable-next-line no-control-regex
const validArt = (v: unknown): v is string => typeof v === "string" && v.length <= MAX_ART && MEDIA_HOSTS.some((h) => v.startsWith(`https://${h}/`)) && !/[\s\u0000-\u001f\u007f]/.test(v);

/** Only the host of a rejected art URL, for the log (to adjust EAA11). */
function hostOf(v: unknown): string | null {
  if (typeof v !== "string") return null;
  try {
    const h = new URL(v).hostname;
    return /^[a-z0-9.-]{1,100}$/.test(h) ? h : null;
  } catch {
    return null;
  }
}

interface Owned {
  readonly type: unknown;
  readonly name: unknown;
}

/** Owned offer ids with the game type and product name the entitlement carries (undefined when absent). */
async function entitlementIds(api: EaGraphql, n: Record<string, number>): Promise<Map<string, Owned>> {
  const ids = new Map<string, Owned>();
  const seen = new Set<string>();
  let next: string | null = null;
  let query = ENTITLEMENTS_QUERY;
  for (;;) {
    if (n["pages"]! >= MAX_PAGES) throw bad("EA entitlements have too many pages");
    n["pages"]!++;
    const vars = next === null ? { limit: PAGE_LIMIT } : { limit: PAGE_LIMIT, next };
    let data: Record<string, unknown>;
    try {
      data = await api.query(query, vars, "EA entitlements");
    } catch (e) {
      // Only a GraphQL rejection of the query (EaGraphql's "errors or no data"), never a status error.
      if (query === ENTITLEMENTS_QUERY_NO_NAME || !(e instanceof ConnectorError) || !e.message.endsWith("answer has errors or no data")) throw e;
      query = ENTITLEMENTS_QUERY_NO_NAME;
      n["nameFallback"] = 1;
      data = await api.query(query, vars, "EA entitlements");
    }
    const me = data["me"];
    const owned = isObject(me) ? me["ownedGameProducts"] : undefined;
    const items = isObject(owned) ? owned["items"] : undefined;
    if (!isObject(owned) || !Array.isArray(items)) throw bad("EA entitlements answer has no item list");
    n["entitlements"]! += items.length;
    if (n["entitlements"]! > MAX_ENTITLEMENTS) throw bad("EA entitlements are too many");
    for (const it of items) {
      const id = isObject(it) ? it["originOfferId"] : undefined;
      const product = isObject(it) && isObject(it["product"]) ? it["product"] : undefined;
      const base = product !== undefined && isObject(product["baseItem"]) ? product["baseItem"] : undefined;
      if (typeof id === "string" && ID_RE.test(id)) {
        if (!ids.has(id)) ids.set(id, { type: base?.["gameType"], name: product?.["name"] });
      }
      else n["badIds"]!++;
    }
    const nx = owned["next"];
    if (nx === undefined || nx === null) return ids;
    if (typeof nx !== "string" || nx === "" || seen.has(nx)) throw bad("EA entitlements next page is invalid or repeated");
    seen.add(nx);
    next = nx;
  }
}

interface Offer {
  readonly offerId: string;
  readonly contentId: unknown;
  readonly title: unknown;
  readonly type: unknown;
  readonly name: unknown;
  readonly art: unknown;
}

/** One batch. Only offers of the batch count; the rest are ignored and counted. */
async function offersOf(api: EaGraphql, batch: readonly string[], types: ReadonlyMap<string, Owned>, n: Record<string, number>): Promise<Offer[]> {
  const data = await api.query(OFFERS_QUERY, { offerIds: batch }, "EA offers");
  const legacy = data["legacyOffers"];
  if (!Array.isArray(legacy)) throw bad("EA offers answer has no offer list");
  const gp = data["gameProducts"];
  const products = isObject(gp) && Array.isArray(gp["items"]) ? gp["items"] : [];
  const asked = new Set(batch);
  // As Lutris: a product matches by originOfferId, else by its own id equal to the contentId or the offer id.
  const byOffer = new Map<string, Record<string, unknown>>();
  const byProductId = new Map<string, Record<string, unknown>>();
  for (const p of products) {
    if (!isObject(p)) continue;
    const oid = p["originOfferId"];
    if (typeof oid === "string" && asked.has(oid) && !byOffer.has(oid)) byOffer.set(oid, p);
    const pid = p["id"];
    if (typeof pid === "string" && !byProductId.has(pid)) byProductId.set(pid, p);
  }
  const out = new Map<string, Offer>();
  for (const o of legacy) {
    const id = isObject(o) ? o["offerId"] : undefined;
    if (!isObject(o) || typeof id !== "string" || !asked.has(id)) {
      n["foreign"]!++;
      continue;
    }
    if (out.has(id)) continue;
    const cid = o["contentId"];
    const p = byOffer.get(id) ?? (typeof cid === "string" ? byProductId.get(cid) : undefined) ?? byProductId.get(id);
    const base = p !== undefined && isObject(p["baseItem"]) ? p["baseItem"] : undefined;
    const pa = base?.["packArt"];
    out.set(id, {
      offerId: id,
      contentId: o["contentId"],
      title: base?.["title"],
      type: types.get(id)?.type,
      name: types.get(id)?.name,
      art: isObject(pa) ? (isObject(pa["largestImage"]) ? pa["largestImage"]["path"] : undefined) : pa,
    });
  }
  n["missingOffers"]! += batch.length - out.size;
  return [...out.values()];
}

export async function listEaLibrary(ctx: SyncContext): Promise<LibrarySnapshot> {
  const session = await readSession(ctx);
  if (session === null) throw new ConnectorError("auth.required", "EA is not connected");
  // No request with a token that is past its time (ADR 82, point 4).
  if (ctx.now() >= session.expiresAt) throw new ConnectorError("auth.expired", "The EA session has expired", { messageKey: k("error.expired") });

  const api = new EaGraphql(ctx.http, session.token, () => expiredError("EA graphql"), ctx.log);
  const n: Record<string, number> = { pages: 0, entitlements: 0, badIds: 0, missingOffers: 0, foreign: 0, notGame: 0, noType: 0, unknownType: 0, untranslated: 0, interestOnly: 0, byOfferId: 0, noTitle: 0, duplicateContent: 0, invalidArt: 0, dlcBadId: 0 };
  const owned = await entitlementIds(api, n);
  const ids = [...owned.keys()];
  n["offers"] = 0;
  const offers: Offer[] = [];
  for (let i = 0; i < ids.length; i += BATCH) offers.push(...(await offersOf(api, ids.slice(i, i + BATCH), owned, n)));
  n["offers"] = offers.length;

  const entries = new Map<string, StoreEntry>();
  const artHosts = new Set<string>();
  // eslint-disable-next-line no-control-regex
  const clean = (v: unknown): string => (typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, MAX_TITLE) : "");
  const sorted = [...offers].sort((a, b) => (a.offerId < b.offerId ? -1 : a.offerId > b.offerId ? 1 : 0));
  /** contentId of an offer, or null when it is not an owned item (interest list, malformed). `strict`: a malformed one makes the snapshot partial. */
  const contentOf = (o: Offer, strict: boolean): string | null => {
    const raw = o.contentId;
    if (typeof raw === "string" && raw.endsWith("_interestOnly")) {
      n["interestOnly"]!++; // interest / wish list, not owned
      return null;
    }
    if (raw === undefined || raw === null || raw === "") {
      // shortcut: without a contentId the offer id is the key, so an installed game of this kind can show twice (its installerdata.xml gives the contentId); upgrade when EA gives the contentId or matching exists.
      n["byOfferId"]!++;
      return o.offerId;
    }
    if (typeof raw !== "string" || !ID_RE.test(raw)) {
      n[strict ? "untranslated" : "dlcBadId"]!++; // for a game a real anomaly: skipped and partial; an add-on is just left out
      return null;
    }
    return raw;
  };
  const candidates: { cid: string; title: string; typed: boolean }[] = [];
  for (const o of sorted) {
    // As Lutris (ea_app.py, 24-10-2026): only an entitlement whose product says BASE_GAME is a game. Add-on types, and items
    // with no type but with a title, are DLC candidates (ADR 83); no type and no title stays out as before.
    const type = typeof o.type === "string" ? o.type.toUpperCase() : null;
    if (type !== null && !GAME_TYPES.has(type)) {
      if (!ADDON_TYPES.has(type)) {
        n["unknownType"]!++;
        continue;
      }
    }
    if (type === null || type !== "BASE_GAME") {
      const title = clean(o.title) || clean(o.name);
      if (type === null && title === "") {
        n["noType"]!++;
        continue;
      }
      const cid = contentOf(o, false);
      if (cid !== null) candidates.push({ cid, title: title || `EA ${cid}`, typed: type !== null });
      continue;
    }
    const cid = contentOf(o, true);
    if (cid === null) continue;
    if (entries.has(cid)) {
      n["duplicateContent"]!++; // the smaller offer id came first
      continue;
    }
    let media: EntryMedia | undefined;
    if (validArt(o.art)) media = { coverUrl: o.art };
    else {
      n["invalidArt"]!++;
      const h = hostOf(o.art);
      if (h !== null && artHosts.size < MAX_ART_HOSTS) artHosts.add(h);
    }
    const title = clean(o.title) || clean(o.name);
    if (title === "") n["noTitle"]!++;
    entries.set(cid, { storeGameId: cid, kind: "game", title: title || `EA ${cid}`, ...(media ? { media } : {}) });
  }
  // Add-ons: base by title among the base games of this answer. An installed game never gets here as DLC: if the
  // library cannot know it, the core keeps it a game (precedence of the scan, ADR 83 A1).
  const index = indexBaseTitles([...entries.values()].filter((e) => e.title !== `EA ${e.storeGameId}`).map((e) => ({ id: e.storeGameId, title: e.title })));
  n["dlc"] = 0;
  n["dlcByTitle"] = 0;
  n["dlcNoBase"] = 0;
  const seenCandidates = new Set<string>();
  for (const d of candidates) {
    // Same contentId as a base game (it stays a game) or as an earlier candidate (the first wins).
    if (entries.has(d.cid) || seenCandidates.has(d.cid)) {
      n["duplicateContent"]!++;
      continue;
    }
    seenCandidates.add(d.cid);
    const base = inferBaseGame(d.title, index);
    if (base === undefined) {
      if (!d.typed) {
        n["noType"]!++; // not known to be an add-on: out, as before
        continue;
      }
      n["dlcNoBase"]!++;
    } else n["dlcByTitle"]!++;
    n["dlc"]!++;
    entries.set(d.cid, { storeGameId: d.cid, kind: "dlc", ...(base === undefined ? {} : { baseStoreGameId: base, storeMetadata: { dlcInferred: true as const } }), title: d.title });
  }
  ctx.log.info("EA library read", { ...n, invalidArtHosts: [...artHosts].join(",") });
  const complete = n["missingOffers"] === 0 && n["badIds"] === 0 && n["untranslated"] === 0;
  return { complete, entries: [...entries.values()] };
}
