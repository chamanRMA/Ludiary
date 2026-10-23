import type { StoreConnector } from "@ludiary/contracts";
import { resolveUbisoftAction } from "./launch";
import { listUbisoftLibrary } from "./library";
import { UBISOFT_CACHE, UBISOFT_LOCATIONS, UBISOFT_NAME_KEY } from "./manifest";
import { ubisoftConnection } from "./wizard";
import { discoverUbisoftRoots, scanUbisoftInstalled } from "./scan";

/** Ubisoft Connect: installed games and Play (ADR 79); account with an embedded login, owned games and covers (ADR 80). */
export function createUbisoftConnector(): StoreConnector {
  return {
    contractVersion: 1,
    id: "ubisoft",
    nameKey: UBISOFT_NAME_KEY,
    access: "unofficial-api",
    capabilities: {
      library: true,
      scan: true,
      dlc: "none",
      actions: ["play", "install"],
      launchKinds: ["uri"],
      uriSchemes: ["uplay"],
      storePlaytime: false,
      price: false,
    },
    minSyncIntervalMs: 1_800_000,
    authHosts: ["connect.ubisoft.com"],
    apiHosts: ["public-ubiservices.ubi.com"],
    mediaHosts: ["static3.cdn.ubi.com"],
    locations: [...UBISOFT_LOCATIONS, UBISOFT_CACHE],
    externalTools: [],
    connection: ubisoftConnection,
    listLibrary: listUbisoftLibrary,
    scanInstalled: scanUbisoftInstalled,
    discoverRoots: discoverUbisoftRoots,
    resolveAction: resolveUbisoftAction,
  };
}

export { ubisoftConnection } from "./wizard";
export { listUbisoftLibrary } from "./library";
