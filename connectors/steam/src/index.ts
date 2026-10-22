import type { StoreConnector } from "@ludiary/contracts";
import { resolveSteamAction } from "./launch";
import { listSteamLibrary } from "./library";
import { STEAM_LOCATIONS, STEAM_NAME_KEY } from "./manifest";
import { resolveSteamMedia, STEAM_API_HOSTS, STEAM_MEDIA_HOSTS } from "./media";
import { discoverSteamRoots, scanSteamInstalled } from "./scan";
import { steamConnection } from "./wizard";

/** Steam connector: installed games (ADR 72) and the account cut (ADR 74): wizard and GetOwnedGames. */
export function createSteamConnector(): StoreConnector {
  return {
    contractVersion: 1,
    id: "steam",
    nameKey: STEAM_NAME_KEY,
    access: "official-api",
    capabilities: {
      library: true,
      scan: true,
      dlc: "none",
      actions: ["play", "install"],
      launchKinds: ["uri"],
      uriSchemes: ["steam"],
      storePlaytime: true,
      price: false,
    },
    minSyncIntervalMs: 600_000,
    authHosts: ["steamcommunity.com"],
    mediaHosts: STEAM_MEDIA_HOSTS,
    apiHosts: STEAM_API_HOSTS,
    locations: STEAM_LOCATIONS,
    externalTools: [],
    connection: steamConnection,
    listLibrary: listSteamLibrary,
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
export { buildLoginUrl, verifyAssertion, OPENID_ENDPOINT } from "./openid";
export { steamConnection } from "./wizard";
export { listSteamLibrary, fetchOwnedGames } from "./library";
