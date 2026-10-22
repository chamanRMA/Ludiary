import type { StoreConnector } from "@ludiary/contracts";
import { resolveSteamAction } from "./launch";
import { STEAM_LOCATIONS, STEAM_NAME_KEY } from "./manifest";
import { resolveSteamMedia, STEAM_API_HOSTS, STEAM_MEDIA_HOSTS } from "./media";
import { discoverSteamRoots, scanSteamInstalled } from "./scan";

/** Steam connector, "installed only" cut (ADR 72). library switches to true with the account cut. */
export function createSteamConnector(): StoreConnector {
  return {
    contractVersion: 1,
    id: "steam",
    nameKey: STEAM_NAME_KEY,
    access: "official-api",
    capabilities: {
      library: false,
      scan: true,
      dlc: "none",
      actions: ["play"],
      launchKinds: ["uri"],
      uriSchemes: ["steam"],
      storePlaytime: false,
      price: false,
    },
    minSyncIntervalMs: 600_000,
    authHosts: [],
    mediaHosts: STEAM_MEDIA_HOSTS,
    apiHosts: STEAM_API_HOSTS,
    locations: STEAM_LOCATIONS,
    externalTools: [],
    scanInstalled: scanSteamInstalled,
    discoverRoots: discoverSteamRoots,
    resolveMedia: resolveSteamMedia,
    resolveAction: resolveSteamAction,
  };
}

export { parseVdf, vdfObject, vdfString, VDF_LIMITS } from "./vdf";
export type { VdfObject, VdfValue } from "./vdf";
export { parseLibraryFolders } from "./libraryfolders";
export { parseAppManifest, APPID_RE } from "./appmanifest";
export type { AppManifest } from "./appmanifest";
export { EXCLUDED_APP_IDS } from "./scan";
export { steamMedia, resolveSteamMedia, STEAM_MEDIA_HOSTS, STEAM_API_HOSTS } from "./media";
