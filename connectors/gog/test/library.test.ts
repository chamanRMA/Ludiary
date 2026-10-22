import { fakeHttp, sentHeaders, sentQuery, syncContext, type MemoryVault } from "@ludiary/connector-testkit";
import { ConnectorError } from "@ludiary/contracts";
import { describe, expect, it } from "vitest";
import { createGogConnector } from "../src";
import { ACCESS, readJson, REFRESH, REFRESH_2, tokenBody } from "./helpers";

const c = createGogConnector();
const catalog = readJson("products", "products-catalog.json");
type Answer = { status: number; body?: unknown; headers?: Record<string, string> };
const HOSTS = ["auth.gog.com", "embed.gog.com", "api.gog.com"];

/** `products` may be a function of the asked ids. */
function gog(o: { token?: Answer; owned?: Answer; products?: Answer | ((ids: string[]) => Answer) } = {}) {
  return fakeHttp((r) => {
    if (r.url.startsWith("https://auth.gog.com/token")) return o.token ?? { status: 200, body: tokenBody() };
    if (r.url.startsWith("https://embed.gog.com/user/data/games")) return o.owned ?? { status: 200, body: readJson("account", "owned-games.json") };
    const ids = sentQuery(r)["ids"]!.split(",");
    const p = o.products ?? { status: 200, body: catalog };
    return typeof p === "function" ? p(ids) : p;
  }, { hosts: HOSTS });
}
const run = (http: ReturnType<typeof gog>, secrets: Record<string, string> = { refreshToken: REFRESH }) => {
  const ctx = syncContext({ http, secrets });
  return { ctx, result: c.listLibrary!(ctx) };
};
const failure = async (p: Promise<unknown>): Promise<ConnectorError> => {
  const e = await p.then(() => null, (x: unknown) => x);
  expect(e).toBeInstanceOf(ConnectorError);
  return e as ConnectorError;
};
const numbered = (n: number) => Array.from({ length: n }, (_, i) => 2_000_000_000 + i);
const productsFor = (ids: string[]): Answer => ({ status: 200, body: ids.map((id) => ({ id: Number(id), title: `Game ${id}`, game_type: "game" })) });

describe("listLibrary (ADR 77, point 6)", () => {
  it("maps the recorded catalog: games only, DLC skipped, repeats removed, bad ids make it partial", async () => {
    const { ctx, result } = run(gog());
    expect(await result).toEqual({
      complete: false, // "not-a-number" was skipped
      entries: [
        { storeGameId: "1207658695", kind: "game", title: "Beneath a Steel Sky (1994)" },
        { storeGameId: "1512372112", kind: "game", title: "Cold Waters" },
      ],
    });
    expect(ctx.logs.length).toBeGreaterThan(0); // 1000000001 is not in the catalog and the DLC: counted in the log
  });

  it("a clean library is complete; an id missing from the catalog alone does not make it partial", async () => {
    const owned = { status: 200, body: { owned: [1512372112, "1000000001"] } };
    const snap = await run(gog({ owned })).result;
    expect(snap.complete).toBe(true);
    expect(snap.entries.map((e) => e.storeGameId)).toEqual(["1512372112"]);
  });

  it("empty owned: complete, no catalog request", async () => {
    const http = gog({ owned: { status: 200, body: { owned: [] } } });
    expect(await run(http).result).toEqual({ complete: true, entries: [] });
    expect(http.requests.filter((r) => r.url.includes("products"))).toHaveLength(0);
  });

  it("renews first and saves the rotated token BEFORE asking embed.gog.com", async () => {
    const order: string[] = [];
    const http = gog();
    const ctx = syncContext({ http, secrets: { refreshToken: REFRESH } });
    const vault = ctx.secrets as MemoryVault;
    const set = vault.set.bind(vault);
    vault.set = async (n, v) => {
      order.push(`set:${n}`);
      return set(n, v);
    };
    const inner = http.request.bind(http);
    http.request = async (r) => {
      order.push(new URL(r.url).hostname);
      return inner(r);
    };
    await c.listLibrary!(ctx);
    expect(order.slice(0, 3)).toEqual(["auth.gog.com", "set:refreshToken", "embed.gog.com"]);
    expect(vault.values.get("refreshToken")).toBe(REFRESH_2);
    expect(sentQuery(http.requests[0]!)).toMatchObject({ grant_type: "refresh_token", refresh_token: REFRESH });
  });

  it("the authorization header goes only to embed.gog.com, as a Secret; the catalog gets no headers", async () => {
    const http = gog();
    await run(http).result;
    const embed = http.requests.filter((r) => r.url.startsWith("https://embed.gog.com"));
    expect(embed).toHaveLength(1);
    expect(sentHeaders(embed[0]!)).toEqual({ authorization: `Bearer ${ACCESS}` });
    expect(JSON.stringify(embed[0])).not.toContain(ACCESS);
    const products = http.requests.filter((r) => r.url.startsWith("https://api.gog.com"));
    expect(products.length).toBeGreaterThan(0);
    for (const r of products) {
      expect(r.headers).toBeUndefined();
      expect(r.url).toBe("https://api.gog.com/products");
    }
  });

  it("batches of exactly 50, in series", async () => {
    let inFlight = 0;
    let max = 0;
    const sizes: number[] = [];
    const http = gog({ owned: { status: 200, body: { owned: numbered(120) } }, products: (ids) => (sizes.push(ids.length), productsFor(ids)) });
    const inner = http.request.bind(http);
    http.request = async (r) => {
      max = Math.max(max, ++inFlight);
      try {
        return await inner(r);
      } finally {
        inFlight--;
      }
    };
    const snap = await run(http).result;
    expect(sizes).toEqual([50, 50, 20]);
    expect(max).toBe(1);
    expect(snap.complete).toBe(true);
    expect(snap.entries).toHaveLength(120);
  });

  it("game_type dlc, pack and missing are skipped; an id outside the batch is ignored; the title falls back", async () => {
    const products = {
      status: 200,
      body: [
        { id: 1, title: "Ba\tse", game_type: "game" },
        { id: 2, title: "Add-on", game_type: "dlc" },
        { id: 3, title: "Bundle", game_type: "pack" },
        { id: 4, title: "Odd" },
        { id: "5", game_type: "game" },
        { id: 999, title: "Not asked", game_type: "game" },
        { id: 1, title: "Repeated", game_type: "game" },
        { id: 6, title: `  ${"x".repeat(600)}  `, game_type: "game" },
        "junk",
      ],
    };
    const owned = { status: 200, body: { owned: [1, 2, 3, 4, "5", 6] } };
    const snap = await run(gog({ owned, products })).result;
    expect(snap.entries.map((e) => [e.storeGameId, e.title.length > 20 ? e.title.length : e.title])).toEqual([["1", "Ba se"], ["5", "GOG 5"], ["6", 300]]); // control chars and length within the core limits
    expect(snap.complete).toBe(true);
  });

  it("owned ids: unsafe, zero, negative, fractional and too long are skipped and make it partial", async () => {
    const owned = { status: 200, body: { owned: [2 ** 60, 0, -5, 1.5, "1".repeat(21), "0x10", null, 7] } };
    const snap = await run(gog({ owned, products: productsFor })).result;
    expect(snap.entries.map((e) => e.storeGameId)).toEqual(["7"]);
    expect(snap.complete).toBe(false);
  });

  it("too many owned ids and a non-list owned are unexpected", async () => {
    for (const body of [{ owned: numbered(50_001) }, { owned: "x" }, {}, []]) {
      expect((await failure(run(gog({ owned: { status: 200, body } })).result)).code).toBe("store.unexpected-response");
    }
  });

  it("renewal: 400, 401 and 403 are auth.expired; the stored secret is kept", async () => {
    for (const status of [400, 401, 403]) {
      const { ctx, result } = run(gog({ token: { status } }));
      const e = await failure(result);
      expect([e.code, e.details.messageKey]).toEqual(["auth.expired", "connectors.gog.error.expired"]);
      expect((ctx.secrets as MemoryVault).values.get("refreshToken")).toBe(REFRESH);
    }
  });

  it("renewal: a network error is not auth.*; 429 and 500 keep their kind; no secret is auth.required", async () => {
    const down = fakeHttp(() => {
      throw new ConnectorError("network.unavailable", "down");
    });
    expect((await failure(run(down).result)).code).toBe("network.unavailable");
    expect((await failure(run(gog({ token: { status: 429, headers: { "retry-after": "5" } } })).result)).details.retryAfterMs).toBe(5000);
    expect((await failure(run(gog({ token: { status: 500 } })).result)).code).toBe("store.unexpected-response");
    const none = gog();
    expect((await failure(run(none, {}).result)).code).toBe("auth.required");
    expect(none.requests).toHaveLength(0);
  });

  it("user/data/games: 401 and 403 are auth.expired; 3xx and 500 unexpected; 429 rate-limited", async () => {
    for (const s of [401, 403]) expect((await failure(run(gog({ owned: { status: s } })).result)).code).toBe("auth.expired");
    for (const s of [302, 500]) expect((await failure(run(gog({ owned: { status: s } })).result)).code).toBe("store.unexpected-response");
    expect((await failure(run(gog({ owned: { status: 429 } })).result)).code).toBe("store.rate-limited");
  });

  it("a failed catalog batch fails the whole sync (never a partial retire)", async () => {
    const cases: [Answer, string][] = [
      [{ status: 401 }, "store.unexpected-response"],
      [{ status: 302 }, "store.unexpected-response"],
      [{ status: 500 }, "store.unexpected-response"],
      [{ status: 429, headers: { "retry-after": "9" } }, "store.rate-limited"],
      [{ status: 200, body: { not: "a list" } }, "store.unexpected-response"],
    ];
    for (const [products, code] of cases) expect((await failure(run(gog({ products })).result)).code).toBe(code);
  });

  it("no ConnectorError carries a token, the code or the name", async () => {
    for (const o of [{ token: { status: 401 } }, { owned: { status: 500 } }, { products: { status: 500 } }]) {
      const e = await failure(run(gog(o)).result);
      expect(JSON.stringify([e.message, e.details])).not.toMatch(/gog-test|TestUser/);
    }
  });
});
