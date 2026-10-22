import { fakeHttp, sentHeaders, sentQuery, syncContext } from "@ludiary/connector-testkit";
import { ConnectorError } from "@ludiary/contracts";
import { describe, expect, it } from "vitest";
import { createSteamConnector } from "../src";
import { API_KEY, readJson, STEAM_ID } from "./helpers";

const c = createSteamConnector();
const owned = readJson("owned", "owned-games.json");
const CDN = "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps";

const connected = { steamId: STEAM_ID, apiKey: API_KEY };
const run = (answer: { status: number; headers?: Record<string, string>; body?: unknown }, secrets: Record<string, string> = connected) => {
  const http = fakeHttp(() => answer, { hosts: ["api.steampowered.com"] });
  const ctx = syncContext({ http, secrets });
  return { http, ctx, result: c.listLibrary!(ctx) };
};
const failure = async (p: Promise<unknown>): Promise<ConnectorError> => {
  const e = await p.then(() => null, (x: unknown) => x);
  expect(e).toBeInstanceOf(ConnectorError);
  return e as ConnectorError;
};

describe("listLibrary (ADR 74, point 7)", () => {
  it("maps a recorded library: excluded, out-of-range, missing name, never played, trimmed title", async () => {
    const { result } = run({ status: 200, body: owned });
    const snap = await result;
    expect(snap.entries.map((e) => e.storeGameId)).toEqual(["620", "10", "440", "730"]);
    // The fixture has an out-of-range appid: skipping it must not let the core retire owned games.
    expect(snap.complete).toBe(false);
    const [portal, cs, noName, cs2] = snap.entries;
    expect(portal).toEqual({
      storeGameId: "620",
      kind: "game",
      title: "Portal 2",
      externalIds: { steamAppId: "620" },
      media: { coverUrl: `${CDN}/620/library_600x900.jpg`, heroUrl: `${CDN}/620/header.jpg` },
      storePlaytimeMinutes: 754,
      storeLastPlayedAt: "2026-09-21T14:13:20.000Z",
    });
    expect(cs?.storePlaytimeMinutes).toBe(0);
    expect(cs).not.toHaveProperty("storeLastPlayedAt"); // rtime_last_played 0 is "never"
    expect(noName?.title).toBe("Steam 440");
    expect(noName).not.toHaveProperty("storeLastPlayedAt");
    expect(cs2?.title).toBe("Counter-Strike 2");
  });

  it("sends one GET with the key in x-webapi-key and the steamid, not the key, in the query", async () => {
    const { http, result } = run({ status: 200, body: owned });
    await result;
    expect(http.requests).toHaveLength(1);
    const r = http.requests[0]!;
    expect(r.method).toBe("GET");
    expect(r.url).toBe("https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/");
    expect(sentHeaders(r)).toEqual({ "x-webapi-key": API_KEY });
    expect(sentQuery(r)).toEqual({
      steamid: STEAM_ID,
      include_appinfo: "true",
      include_played_free_games: "true",
      skip_unvetted_apps: "false",
      format: "json",
    });
    expect(JSON.stringify(r)).not.toContain(API_KEY); // Secret: toJSON is "[redacted]"
    expect(r.url).not.toContain(API_KEY);
  });

  it("game_count different from the number of games is complete:false", async () => {
    const { result } = run({ status: 200, body: { response: { game_count: 3, games: [{ appid: 1, name: "A" }] } } });
    expect(await result).toMatchObject({ complete: false, entries: [{ storeGameId: "1" }] });
  });

  it("a clean library whose count matches is complete", async () => {
    const body = { response: { game_count: 1, games: [{ appid: 620, name: "Portal 2" }] } };
    expect(await run({ status: 200, body }).result).toMatchObject({ complete: true, entries: [{ storeGameId: "620" }] });
  });

  it("an empty public library is complete with no entries", async () => {
    expect(await run({ status: 200, body: readJson("owned", "owned-games-empty.json") }).result).toEqual({ complete: true, entries: [] });
  });

  it("drops invalid values field by field without losing the game", async () => {
    const games = [
      { appid: 7, name: "A", playtime_forever: -1, rtime_last_played: 1e15 },
      { appid: 8, name: "B", playtime_forever: 1.5, rtime_last_played: "x" },
      { appid: 7, name: "Duplicate" },
      { appid: 0, name: "Zero" },
      { appid: "9", name: "String id" },
      "junk",
      null,
    ];
    const snap = await run({ status: 200, body: { response: { game_count: 7, games } } }).result;
    expect(snap.entries.map((e) => [e.storeGameId, e.title])).toEqual([["7", "A"], ["8", "B"]]);
    for (const e of snap.entries) {
      expect(e).not.toHaveProperty("storePlaytimeMinutes");
      expect(e).not.toHaveProperty("storeLastPlayedAt");
    }
  });

  it("{} is account.private-profile", async () => {
    const e = await failure(run({ status: 200, body: readJson("owned", "owned-games-private.json") }).result);
    expect(e.code).toBe("account.private-profile");
    expect(e.details.messageKey).toBe("connectors.steam.error.privateProfile");
  });

  it.each([401, 403])("%i is auth.invalid", async (status) => {
    const e = await failure(run({ status }).result);
    expect(e.code).toBe("auth.invalid");
    expect(e.details.messageKey).toBe("connectors.steam.error.key");
  });

  it("429 is store.rate-limited with Retry-After", async () => {
    const e = await failure(run({ status: 429, headers: { "Retry-After": "90" } }).result);
    expect(e.code).toBe("store.rate-limited");
    expect(e.details.retryAfterMs).toBe(90_000);
  });

  it.each([
    ["500", { status: 500, body: "boom" }],
    ["not JSON", { status: 200, body: "<html>" }],
    ["JSON without response", { status: 200, body: { games: [] } }],
  ])("%s is store.unexpected-response", async (_n, answer) => {
    expect((await failure(run(answer).result)).code).toBe("store.unexpected-response");
  });

  it("without steamId or apiKey it is auth.required and makes no call", async () => {
    for (const secrets of [{}, { steamId: STEAM_ID }, { apiKey: API_KEY }]) {
      const { http, result } = run({ status: 200, body: owned }, secrets);
      expect((await failure(result)).code).toBe("auth.required");
      expect(http.requests).toHaveLength(0);
    }
  });

  it("logs neither the key, the SteamID nor game data", async () => {
    const { ctx, result } = run({ status: 200, body: owned });
    await result;
    const log = JSON.stringify(ctx.logs);
    expect(log).not.toContain(API_KEY);
    expect(log).not.toContain(STEAM_ID);
    expect(log).not.toMatch(/Portal/);
  });
});
