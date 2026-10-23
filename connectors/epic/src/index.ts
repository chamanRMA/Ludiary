import type { StoreConnector } from "@ludiary/contracts";
import { listEpicLibrary } from "./library";
import { resolveEpicAction } from "./launch";
import { EPIC_LOCATIONS, EPIC_NAME_KEY } from "./manifest";
import { EPIC_API_HOSTS, EPIC_MEDIA_HOSTS } from "./media";
import { discoverEpicRoots, scanEpicInstalled } from "./scan";
import { epicConnection } from "./wizard";

/**
 * Epic connector: installed games from the launcher's manifests, Jugar/Instalar by the launcher's URI, and the account
 * cut (ADR 78). resolveMedia is NOT wired: with an application token the public catalog answers 200 but without
 * keyImages for third-party games (assumption E7 checked 22-10-2026), so covers come from listLibrary only.
 * To re-enable it, add `resolveMedia: resolveEpicMedia` (src/media.ts keeps the tested implementation).
 */
export function createEpicConnector(): StoreConnector {
  return {
    contractVersion: 1,
    id: "epic",
    nameKey: EPIC_NAME_KEY,
    access: "unofficial-api",
    capabilities: {
      library: true,
      scan: true,
      dlc: "none",
      actions: ["play", "install"],
      launchKinds: ["uri"],
      uriSchemes: ["com.epicgames.launcher"],
      storePlaytime: false,
      price: false,
    },
    minSyncIntervalMs: 1_800_000,
    authHosts: ["www.epicgames.com"],
    apiHosts: [...EPIC_API_HOSTS, "library-service.live.use1a.on.epicgames.com"],
    mediaHosts: EPIC_MEDIA_HOSTS,
    locations: EPIC_LOCATIONS,
    externalTools: [],
    connection: epicConnection,
    listLibrary: listEpicLibrary,
    scanInstalled: scanEpicInstalled,
    discoverRoots: discoverEpicRoots,
    resolveAction: resolveEpicAction,
  };
}

export { epicConnection } from "./wizard";
export { listEpicLibrary } from "./library";
export { EPIC_LOGIN_URL } from "./auth";
export { resolveEpicMedia, EPIC_API_HOSTS, EPIC_MEDIA_HOSTS } from "./media";
