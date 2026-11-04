import { fakeHttp, sentHeaders, sentQuery, syncContext } from "@ludiary/connector-testkit";
import { ConnectorError } from "@ludiary/contracts";
import { describe, expect, it } from "vitest";
import { createGogConnector } from "../src";
import { ACCESS, readJson, REFRESH, REFRESH_2, tokenBody } from "./helpers";

const c = createGogConnector();
type Answer = { status: number; body?: unknown; headers?: Record<string, string> };
const HOSTS = ["auth.gog.com", "embed.gog.com", "api.gog.com"];

function gog(o: { token?: Answer; wishlist?: Answer; products?: Answer | ((ids: string[]) => Answer) } = {}) {
  return fakeHttp((r) => {
    if (r.url.startsWith("https://auth.gog.com/token")) return o.token ?? { status: 200, body: tokenBody() };
    if (r.url.startsWith("https://embed.gog.com/user/wishlist.json")) return o.wishlist ?? { status: 200, body: readJson("wishlist", "wishlist.json") };
    const ids = sentQuery(r)["ids"]!.split(",");
    const p = o.products ?? { status: 200, body: readJson("wishlist", "products-wishlist.json") };
    return typeof p === "function" ? p(ids) : p;
  }, { hosts: HOSTS });
}
const ctxOf = (http: ReturnType<typeof gog>) => syncContext({ http, secrets: { refreshToken: REFRESH } });
const failure = async (p: Promise<unknown>): Promise<ConnectorError> => {
  const e = await p.then(() => null, (x: unknown) => x);
  expect(e).toBeInstanceOf(ConnectorError);
  return e as ConnectorError;
};

describe("readWishlist (ADR 91, GOG)", () => {
  it("renews the session first, keeps only true ids and is partial with a key that is not an id", async () => {
    const http = gog();
    const ctx = ctxOf(http);
    expect(await c.readWishlist!(ctx)).toEqual({ complete: false, entries: [{ storeGameId: "1207658695" }, { storeGameId: "1512372112" }] });
    expect(http.requests.map((r) => new URL(r.url).pathname)).toEqual(["/token", "/user/wishlist.json"]);
    expect(sentHeaders(http.requests[1]!)).toEqual({ authorization: `Bearer ${ACCESS}` });
    expect(await ctx.secrets.get("refreshToken")).not.toBeNull();
    expect((await ctx.secrets.get("refreshToken"))?.reveal()).toBe(REFRESH_2); // rotated token saved
  });

  it("empty list is complete with no entries", async () => {
    const http = gog({ wishlist: { status: 200, body: { wishlist: {}, checksum: "0" } } });
    expect(await c.readWishlist!(ctxOf(http))).toEqual({ complete: true, entries: [] });
  });

  it.each([401, 403])("%i is unexpected-response with its own text, never auth.expired (point 13 M2)", async (status) => {
    const e = await failure(c.readWishlist!(ctxOf(gog({ wishlist: { status } }))));
    expect([e.code, e.details.messageKey]).toEqual(["store.unexpected-response", "connectors.gog.error.wishlist"]);
  });

  it("429 keeps Retry-After; 5xx is unexpected-response", async () => {
    const limited = await failure(c.readWishlist!(ctxOf(gog({ wishlist: { status: 429, headers: { "Retry-After": "30" } } }))));
    expect([limited.code, limited.details.retryAfterMs]).toEqual(["store.rate-limited", 30_000]);
    expect((await failure(c.readWishlist!(ctxOf(gog({ wishlist: { status: 502 } }))))).code).toBe("store.unexpected-response");
  });

  it("a strange body fails with a fixed message that does not carry it", async () => {
    const secret = "strange-body-marker-" + "x".repeat(20);
    for (const body of [secret, { wishlist: secret }, [secret]]) {
      const ctx = ctxOf(gog({ wishlist: { status: 200, body } }));
      const e = await failure(c.readWishlist!(ctx));
      expect(e.code).toBe("store.unexpected-response");
      expect(e.message).not.toContain(secret);
      expect(e.cause).toBeUndefined();
      expect(JSON.stringify(ctx.logs)).not.toContain(secret);
    }
  });

  it("a rejected renewal is auth.expired", async () => {
    expect((await failure(c.readWishlist!(ctxOf(gog({ token: { status: 400 } }))))).code).toBe("auth.expired");
  });
});

describe("describeWishlistItems (ADR 91, GOG)", () => {
  it("titles cleaned, media only from a valid background hash, missing product absent, no token sent", async () => {
    const http = gog();
    const out = await c.describeWishlistItems!(["1207658695", "1512372112", "1000000001", "../x"], ctxOf(http));
    expect([...out.keys()]).toEqual(["1207658695", "1512372112"]);
    expect(out.get("1207658695")).toEqual({ title: "Beneath a Steel Sky (1994)", media: { heroUrl: `https://images.gog.com/${"ab".repeat(32)}.jpg` } });
    expect(out.get("1512372112")).toEqual({ title: "Cold Waters" }); // control char removed, foreign host rejected
    expect(http.requests).toHaveLength(1);
    expect(http.requests[0]!.headers).toBeUndefined();
  });

  it("120 ids go in batches of 50", async () => {
    const http = gog({ products: (ids) => ({ status: 200, body: ids.map((id) => ({ id: Number(id), title: `Game ${id}` })) }) });
    const ids = Array.from({ length: 120 }, (_, i) => String(2_000_000_000 + i));
    const out = await c.describeWishlistItems!(ids, ctxOf(http));
    expect(http.requests.map((r) => sentQuery(r)["ids"]!.split(",").length)).toEqual([50, 50, 20]);
    expect(out.size).toBe(120);
  });

  it("an answer that is not a list, or a failing batch, fails the call", async () => {
    expect((await failure(c.describeWishlistItems!(["1"], ctxOf(gog({ products: { status: 200, body: { a: 1 } } }))))).code).toBe("store.unexpected-response");
    expect((await failure(c.describeWishlistItems!(["1"], ctxOf(gog({ products: { status: 429 } }))))).code).toBe("store.rate-limited");
  });
});
