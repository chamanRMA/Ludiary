// Price service contract (ADR 86, point 5 and point 15). Types plus the pure function checkPriceServiceManifest. No I/O.
// The service describes and fetches; the core validates, caches and decides.
import { HOST_RE } from "./connector";
import type { ConnectionWizard, EntryMedia, I18nKey, StoreId, SyncContext } from "./connector";

export type PriceServiceId = "itad";

export interface PriceService {
  readonly id: PriceServiceId;
  readonly nameKey: I18nKey;
  /** HTTPS hosts the HttpClient may call, e.g. ['api.isthereanydeal.com']. */
  readonly apiHosts: readonly string[];
  /** ADR 86 audit A1: hosts an `open-external` step may open, e.g. ['isthereanydeal.com']. */
  readonly authHosts: readonly string[];
  /** HTTPS hosts a deal link may point to (shown to the user, never fetched). ADR 86 point 15, M1. */
  readonly linkHosts: readonly string[];
  /** HTTPS hosts of the images the search returns (loaded by the browser; img-src is the union with the connectors'). ADR 86 point 17. May be empty. */
  readonly mediaHosts: readonly string[];
  /** Key wizard: same engine and step kinds as a store (ADR 40, 74). */
  readonly connection: ConnectionWizard;
  /** Store property -> service game id. Absent key in the result = not found. */
  lookupByStore(store: StoreId, storeGameIds: readonly string[], ctx: SyncContext): Promise<ReadonlyMap<string, string>>;
  /** Title -> service game id (exact match after the service's own preprocessing). Absent key = not found. */
  lookupByTitle(titles: readonly string[], ctx: SyncContext): Promise<ReadonlyMap<string, string>>;
  /** `media`: coverUrl (vertical) and heroUrl (horizontal), same rules as StoreEntry.media (ADR 86 point 17). */
  search(title: string, ctx: SyncContext): Promise<readonly { id: string; title: string; type: "game" | "dlc" | "package" | null; media?: EntryMedia }[]>;
  /** Current prices per shop plus the historical low: up to 200 ids, 50 with shops 'all' (point 15, M5). */
  prices(
    ids: readonly string[],
    q: { country: string; shops: readonly StoreId[] | "all" },
    ctx: SyncContext,
  ): Promise<readonly PriceSnapshot[]>;
}

export interface PriceSnapshot {
  readonly id: string;
  readonly deals: readonly {
    shop: { storeId: StoreId | null; serviceShopId: number; name: string };
    amountMinor: number;
    regularMinor: number;
    currency: string;
    cut: number;
    voucher: string | null;
    url: string;
    expiresAt: string | null;
  }[];
  readonly historyLow: { amountMinor: number; currency: string } | null;
}

const SERVICE_IDS: readonly string[] = ["itad"];

/** Lists what is wrong in a manifest (runtime refuses the service at startup if non-empty). English, for developers. */
export function checkPriceServiceManifest(s: PriceService): readonly string[] {
  const problems: string[] = [];
  if (!SERVICE_IDS.includes(s.id)) problems.push(`unknown price service id '${String(s.id)}'`);
  if (!s.nameKey) problems.push("nameKey is empty");
  for (const [field, hosts] of [["apiHosts", s.apiHosts], ["authHosts", s.authHosts], ["linkHosts", s.linkHosts]] as const) {
    if (hosts.length === 0) problems.push(`${field} must not be empty`);
    for (const h of hosts) if (!HOST_RE.test(h)) problems.push(`${field}: '${h}' is not a bare lower-case host name`);
  }
  for (const h of s.mediaHosts) if (!HOST_RE.test(h)) problems.push(`mediaHosts: '${h}' is not a bare lower-case host name`);
  if (!s.connection) problems.push("connection is missing");
  return problems;
}
