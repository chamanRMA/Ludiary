// Media URLs built from the AppID (ADR 71).
import type { EntryMedia } from "@ludiary/contracts";

export const STEAM_MEDIA_HOSTS: readonly string[] = [
  "shared.akamai.steamstatic.com",
  "shared.cloudflare.steamstatic.com",
  "shared.steamstatic.com",
];

const BASE = "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps";

/** coverUrl: vertical 600x900. heroUrl is the fallback (header.jpg, 460x215). appId must be validated already. */
export function steamMedia(appId: string): EntryMedia {
  return { coverUrl: `${BASE}/${appId}/library_600x900.jpg`, heroUrl: `${BASE}/${appId}/header.jpg` };
}
