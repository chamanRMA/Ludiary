import { fakeHttp, sentQuery, syncContext } from "@ludiary/connector-testkit";
import { ConnectorError } from "@ludiary/contracts";
import { describe, expect, it } from "vitest";
import { createSteamConnector } from "../src";
import { API_KEY, readJson, STEAM_ID } from "./helpers";

const c = createSteamConnector();
const list = readJson("wishlist", "wishlist.json");
const CDN = "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps";
type Answer = { status: number; headers?: Record<string, string>; body?: unknown };

const run = (answer: Answer, secrets: Record<string, string> = { steamId: STEAM_ID, apiKey: API_KEY }) => {
  const http = fakeHttp(() => answer, { hosts: ["api.steampowered.com"] });
  return { http, ctx: syncContext({ http, secrets }) };
};
const failure = async (p: Promise<unknown>): Promise<ConnectorError> => {
  const e = await p.then(() => null, (x: unknown) => x);
  expect(e).toBeInstanceOf(ConnectorError);
  return e as ConnectorError;
};

describe("readWishlist (ADR 91, Steam)", () => {
  it("lists ids in order with the date; out-of-range and repeated ones are skipped and make it partial", async () => {
    const { http, ctx } = run({ status: 200, body: list });
    const snap = await c.readWishlist!(ctx);
    expect(snap).toEqual({
      complete: false,
      entries: [
        { storeGameId: "620", addedAt: "2026-09-21T14:13:20.000Z" },
        { storeGameId: "730", addedAt: "2026-09-22T18:00:00.000Z" },
        { storeGameId: "440" },
      ],
    });
    expect(http.requests).toHaveLength(1);
    expect(http.requests[0]!.url).toBe("https://api.steampowered.com/IWishlistService/GetWishlist/v1/");
    expect(sentQuery(http.requests[0]!)).toEqual({ steamid: STEAM_ID }); // no API key anywhere
    expect(JSON.stringify(http.requests[0])).not.toContain(API_KEY);
  });

  it("a clean list is complete", async () => {
    const { ctx } = run({ status: 200, body: { response: { items: [{ appid: 620, priority: 1, date_added: 1790000000 }] } } });
    expect((await c.readWishlist!(ctx)).complete).toBe(true);
  });

  it("empty or hidden ({}): not complete, no entries", async () => {
    const { ctx } = run({ status: 200, body: readJson("wishlist", "wishlist-hidden.json") });
    expect(await c.readWishlist!(ctx)).toEqual({ complete: false, entries: [] });
  });

  it.each([401, 403])("%i: unexpected-response with the wishlist text, never auth", async (status) => {
    const e = await failure(c.readWishlist!(run({ status }).ctx));
    expect(e.code).toBe("store.unexpected-response");
    expect(e.details.messageKey).toBe("connectors.steam.error.wishlist");
  });

  it("429 keeps Retry-After", async () => {
    const e = await failure(c.readWishlist!(run({ status: 429, headers: { "Retry-After": "90" } }).ctx));
    expect(e.code).toBe("store.rate-limited");
    expect(e.details.retryAfterMs).toBe(90_000);
  });

  it("5xx is network.unavailable", async () => {
    expect((await failure(c.readWishlist!(run({ status: 503 }).ctx))).code).toBe("network.unavailable");
  });

  it("a strange body fails with a fixed message that does not carry it", async () => {
    const secret = "strange-body-marker-" + "x".repeat(20);
    for (const body of [secret, { response: secret }, { response: { items: secret } }]) {
      const { ctx } = run({ status: 200, body });
      const e = await failure(c.readWishlist!(ctx));
      expect(e.code).toBe("store.unexpected-response");
      expect(e.message).not.toContain(secret);
      expect(e.cause).toBeUndefined();
      expect(JSON.stringify(ctx.logs)).not.toContain(secret);
    }
  });

  it("without a stored SteamID there is no request and no auth error", async () => {
    const { http, ctx } = run({ status: 200, body: list }, {});
    expect((await failure(c.readWishlist!(ctx))).code).toBe("store.unexpected-response");
    expect(http.requests).toHaveLength(0);
  });
});

describe("describeWishlistItems (ADR 91, Steam)", () => {
  it("titles from GetItems, fallback title when missing, CDN media, no invalid ids", async () => {
    const http = fakeHttp(() => ({ status: 200, body: readJson("getitems", "getitems-english.json") }), { hosts: ["api.steampowered.com"] });
    const out = await c.describeWishlistItems!(["620", "228980", "../x"], syncContext({ http }));
    expect([...out.keys()]).toEqual(["620", "228980"]);
    expect(out.get("620")).toEqual({ title: "Portal 2", media: { coverUrl: `${CDN}/620/library_600x900.jpg`, heroUrl: `${CDN}/620/header.jpg` } });
    expect(out.get("228980")?.title).toBe("Steam 228980");
    expect(http.requests).toHaveLength(1);
  });

  it("120 ids go in batches of 50", async () => {
    const http = fakeHttp(() => ({ status: 200, body: { response: { store_items: [] } } }), { hosts: ["api.steampowered.com"] });
    const ids = Array.from({ length: 120 }, (_, i) => String(1000 + i));
    const out = await c.describeWishlistItems!(ids, syncContext({ http }));
    const sizes = http.requests.map((r) => (JSON.parse(sentQuery(r)["input_json"]!) as { ids: unknown[] }).ids.length);
    expect(sizes).toEqual([50, 50, 20]);
    expect(out.size).toBe(120);
  });

  it("a failing batch fails the whole call", async () => {
    const http = fakeHttp(() => ({ status: 429, headers: { "retry-after": "5" } }), { hosts: ["api.steampowered.com"] });
    expect((await failure(c.describeWishlistItems!(["620"], syncContext({ http })))).code).toBe("store.rate-limited");
  });
});
