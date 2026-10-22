// Owned games from IPlayerService/GetOwnedGames (ADR 74, point 7). The API key travels in x-webapi-key as a Secret.
import { ConnectorError, type HttpClient, type I18nKey, type LibrarySnapshot, type Secret, type StoreEntry, type SyncContext } from "@ludiary/contracts";
import { steamMedia, retryAfterMs } from "./media";
import { EXCLUDED_APP_IDS } from "./scan";

const OWNED_URL = "https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/";
const MAX_APPID = 2 ** 32 - 1;
const MAX_PLAYTIME = 100_000_000;
const MAX_TITLE = 500;

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isInt = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v);

/** Throws for the statuses every Steam Web API call treats the same way. */
export function throwForStatus(res: { status: number; headers: Readonly<Record<string, string>> }, what: string): void {
  if (res.status === 200) return;
  if (res.status === 401 || res.status === 403) {
    throw new ConnectorError("auth.invalid", `${what} answered ${res.status}`, { messageKey: "connectors.steam.error.key" as I18nKey });
  }
  if (res.status === 429) {
    const ms = retryAfterMs(res.headers);
    throw new ConnectorError("store.rate-limited", `${what} answered 429`, ms === undefined ? {} : { retryAfterMs: ms });
  }
  throw new ConnectorError("store.unexpected-response", `${what} answered ${res.status}`);
}

/** Returns the `response` object. Without `game_count` the profile is private (or Steam sent an empty one, S5). */
export async function fetchOwnedGames(
  http: HttpClient,
  steamId: Secret,
  apiKey: Secret,
  includeAppInfo: boolean,
): Promise<Record<string, unknown>> {
  const res = await http.request({
    method: "GET",
    url: OWNED_URL,
    headers: { "x-webapi-key": apiKey },
    query: {
      steamid: steamId,
      include_appinfo: String(includeAppInfo),
      include_played_free_games: "true",
      skip_unvetted_apps: "false",
      format: "json",
    },
  });
  throwForStatus(res, "GetOwnedGames");
  const body = await res.json();
  const response = isObject(body) ? body["response"] : undefined;
  if (!isObject(response)) throw new ConnectorError("store.unexpected-response", "GetOwnedGames answer has no response object");
  return response;
}

export const isPrivateResponse = (r: Record<string, unknown>): boolean => !isInt(r["game_count"]);

export async function listSteamLibrary(ctx: SyncContext): Promise<LibrarySnapshot> {
  const [steamId, apiKey] = [await ctx.secrets.get("steamId"), await ctx.secrets.get("apiKey")];
  if (!steamId || !apiKey) throw new ConnectorError("auth.required", "Steam is not connected");
  const response = await fetchOwnedGames(ctx.http, steamId, apiKey, true);
  if (isPrivateResponse(response)) {
    throw new ConnectorError("account.private-profile", "GetOwnedGames returned no game_count", {
      messageKey: "connectors.steam.error.privateProfile" as I18nKey,
    });
  }
  const count = response["game_count"] as number;
  const games = Array.isArray(response["games"]) ? (response["games"] as unknown[]) : [];

  const entries: StoreEntry[] = [];
  const seen = new Set<string>();
  let skipped = 0;
  for (const g of games) {
    const appid = isObject(g) ? g["appid"] : undefined;
    if (!isObject(g) || !isInt(appid) || appid < 1 || appid > MAX_APPID) {
      skipped++;
      continue;
    }
    const id = String(appid);
    if (EXCLUDED_APP_IDS.has(id) || seen.has(id)) continue;
    seen.add(id);
    const name = typeof g["name"] === "string" ? g["name"].trim().slice(0, MAX_TITLE) : "";
    const played = g["playtime_forever"];
    const last = g["rtime_last_played"];
    const lastDate = isInt(last) && last > 0 ? new Date(last * 1000) : null;
    entries.push({
      storeGameId: id,
      kind: "game",
      title: name || `Steam ${id}`,
      externalIds: { steamAppId: id },
      media: steamMedia(id),
      ...(isInt(played) && played >= 0 && played <= MAX_PLAYTIME ? { storePlaytimeMinutes: played } : {}),
      ...(lastDate && !Number.isNaN(lastDate.getTime()) ? { storeLastPlayedAt: lastDate.toISOString() } : {}),
    });
  }
  if (skipped > 0) ctx.log.info("Some owned games were skipped", { skipped });
  // A skipped malformed entry makes the snapshot partial: otherwise the core would retire games the user still owns.
  return { complete: skipped === 0 && games.length === count, entries };
}
