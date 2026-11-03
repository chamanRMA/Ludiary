import type { PriceService } from "@ludiary/contracts";
import { ITAD_API_HOST, itadLookupByStore, itadLookupByTitle, itadPrices, itadSearch } from "./client";
import { itadConnection } from "./wizard";

export { ITAD_SHOP_IDS } from "./shops";

/** IsThereAnyDeal price service (ADR 86). The only export the runtime needs. */
export const itadService: PriceService = {
  id: "itad",
  nameKey: "connectors.itad.name" as PriceService["nameKey"],
  apiHosts: [ITAD_API_HOST],
  authHosts: ["isthereanydeal.com"],
  // ITAD12: the host of the deal links is unverified; offers on other hosts are shown without a link.
  linkHosts: ["itad.link", "isthereanydeal.com", "next.isthereanydeal.com"],
  connection: itadConnection,
  lookupByStore: itadLookupByStore,
  lookupByTitle: itadLookupByTitle,
  search: itadSearch,
  prices: itadPrices,
};
