import type { StoreConnector } from "@ludiary/contracts";
import { MEDIA_HOSTS, listEaLibrary } from "./library";
import { resolveEaAction } from "./launch";
import { EA_LOCATIONS, EA_NAME_KEY } from "./manifest";
import { discoverEaRoots, scanEaInstalled } from "./scan";
import { eaConnection } from "./wizard";

/** EA app (and Origin): installed games and Play/Install through origin2:// (ADR 81); account with a pasted browser token (ADR 82). */
export function createEaConnector(): StoreConnector {
  return {
    contractVersion: 1,
    id: "ea",
    nameKey: EA_NAME_KEY,
    access: "unofficial-api",
    capabilities: {
      library: true,
      scan: true,
      dlc: "none",
      actions: ["play", "install"],
      launchKinds: ["uri"],
      uriSchemes: ["origin2"],
      storePlaytime: false,
      price: false,
    },
    minSyncIntervalMs: 1_800_000,
    authHosts: ["accounts.ea.com"], // only the token URL opened in the browser (ADR 82)
    apiHosts: ["service-aggregation-layer.juno.ea.com"],
    mediaHosts: MEDIA_HOSTS,
    locations: EA_LOCATIONS,
    externalTools: [],
    connection: eaConnection,
    listLibrary: listEaLibrary,
    scanInstalled: scanEaInstalled,
    discoverRoots: discoverEaRoots,
    resolveAction: resolveEaAction,
  };
}

export { eaConnection } from "./wizard";
export { listEaLibrary } from "./library";
