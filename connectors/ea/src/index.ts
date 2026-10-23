import type { StoreConnector } from "@ludiary/contracts";
import { resolveEaAction } from "./launch";
import { EA_LOCATIONS, EA_NAME_KEY } from "./manifest";
import { scanEaInstalled } from "./scan";

/** EA app (and Origin): installed games from installerdata.xml and Play through origin2:// (ADR 81). No network. */
export function createEaConnector(): StoreConnector {
  return {
    contractVersion: 1,
    id: "ea",
    nameKey: EA_NAME_KEY,
    access: "local-only",
    capabilities: {
      library: false,
      scan: true,
      dlc: "none",
      actions: ["play"],
      launchKinds: ["uri"],
      uriSchemes: ["origin2"],
      storePlaytime: false,
      price: false,
    },
    minSyncIntervalMs: 60_000,
    authHosts: [],
    apiHosts: [],
    mediaHosts: [],
    locations: EA_LOCATIONS,
    externalTools: [],
    scanInstalled: scanEaInstalled,
    resolveAction: resolveEaAction,
  };
}
