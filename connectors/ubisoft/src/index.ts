import type { StoreConnector } from "@ludiary/contracts";
import { resolveUbisoftAction } from "./launch";
import { UBISOFT_LOCATIONS, UBISOFT_NAME_KEY } from "./manifest";
import { discoverUbisoftRoots, scanUbisoftInstalled } from "./scan";

/** Ubisoft Connect: installed games from the registry and Play through uplay:// (ADR 79). No network. */
export function createUbisoftConnector(): StoreConnector {
  return {
    contractVersion: 1,
    id: "ubisoft",
    nameKey: UBISOFT_NAME_KEY,
    access: "local-only",
    capabilities: {
      library: false,
      scan: true,
      dlc: "none",
      actions: ["play"],
      launchKinds: ["uri"],
      uriSchemes: ["uplay"],
      storePlaytime: false,
      price: false,
    },
    minSyncIntervalMs: 60_000,
    authHosts: [],
    apiHosts: [],
    mediaHosts: [],
    locations: UBISOFT_LOCATIONS,
    externalTools: [],
    scanInstalled: scanUbisoftInstalled,
    discoverRoots: discoverUbisoftRoots,
    resolveAction: resolveUbisoftAction,
  };
}
