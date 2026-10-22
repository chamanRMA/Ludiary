import type { StoreConnector } from "@ludiary/contracts";
import { resolveGogAction } from "./launch";
import { GOG_LOCATIONS, GOG_NAME_KEY } from "./manifest";
import { GOG_API_HOSTS, GOG_MEDIA_HOSTS, resolveGogMedia } from "./media";
import { discoverGogRoots, scanGogInstalled } from "./scan";

/** GOG connector, first cut (ADR 76): installed games, GamesDB covers and direct exec launch. No account yet. */
export function createGogConnector(): StoreConnector {
  return {
    contractVersion: 1,
    id: "gog",
    nameKey: GOG_NAME_KEY,
    access: "unofficial-api",
    capabilities: {
      library: false,
      scan: true,
      dlc: "none",
      actions: ["play"],
      launchKinds: ["exec"],
      uriSchemes: [],
      storePlaytime: false,
      price: false,
    },
    minSyncIntervalMs: 1_800_000,
    authHosts: [],
    apiHosts: GOG_API_HOSTS,
    mediaHosts: GOG_MEDIA_HOSTS,
    locations: GOG_LOCATIONS,
    externalTools: [],
    scanInstalled: scanGogInstalled,
    discoverRoots: discoverGogRoots,
    resolveMedia: resolveGogMedia,
    resolveAction: resolveGogAction,
  };
}

export { splitWindowsArgs } from "./args";
export { parseGogInfo } from "./info";
export type { GogInfo, GogPlayTask } from "./info";
export { resolveGogMedia, GOG_API_HOSTS, GOG_MEDIA_HOSTS } from "./media";
