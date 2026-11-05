import type { I18nKey, StoreConnector } from "@ludiary/contracts";
import { resolveGogAction } from "./launch";
import { GOG_GALAXY_CLIENT, GOG_LOCATIONS, GOG_NAME_KEY } from "./manifest";
import { listGogLibrary } from "./library";
import { gogConnection } from "./wizard";
import { describeGogWishlistItems, readGogWishlist } from "./wishlist";
import { GOG_API_HOSTS, GOG_MEDIA_HOSTS, resolveGogMedia } from "./media";
import { discoverGogRoots, scanGogInstalled } from "./scan";

/** GOG connector: installed games, GamesDB covers and direct exec launch (ADR 76), and the account cut (ADR 77). */
export function createGogConnector(): StoreConnector {
  return {
    contractVersion: 1,
    id: "gog",
    nameKey: GOG_NAME_KEY,
    access: "unofficial-api",
    capabilities: {
      library: true,
      scan: true,
      dlc: "library-and-scan",
      actions: ["play", "install"],
      launchKinds: ["exec", "uri"],
      uriSchemes: ["goggalaxy"],
      storePlaytime: false,
      price: false,
    },
    minSyncIntervalMs: 1_800_000,
    authHosts: ["auth.gog.com"],
    apiHosts: GOG_API_HOSTS,
    mediaHosts: GOG_MEDIA_HOSTS,
    locations: [...GOG_LOCATIONS, GOG_GALAXY_CLIENT],
    launchModes: [
      { id: "client", labelKey: "connectors.gog.launch.client" as I18nKey, hintKey: "connectors.gog.launch.clientHint" as I18nKey },
      { id: "direct", labelKey: "connectors.gog.launch.direct" as I18nKey, hintKey: "connectors.gog.launch.directHint" as I18nKey },
    ],
    externalTools: [],
    connection: gogConnection,
    listLibrary: listGogLibrary,
    scanInstalled: scanGogInstalled,
    discoverRoots: discoverGogRoots,
    resolveMedia: resolveGogMedia,
    readWishlist: readGogWishlist,
    describeWishlistItems: describeGogWishlistItems,
    resolveAction: resolveGogAction,
  };
}

export { gogConnection } from "./wizard";
export { listGogLibrary } from "./library";
export { GOG_LOGIN_URL, GOG_REDIRECT_URI } from "./auth";
export { splitWindowsArgs } from "./args";
export { parseGogInfo } from "./info";
export type { GogInfo, GogPlayTask } from "./info";
export { resolveGogMedia, GOG_API_HOSTS, GOG_MEDIA_HOSTS } from "./media";
