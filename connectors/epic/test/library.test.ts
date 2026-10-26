import { fakeHttp, sentHeaders, syncContext, type MemoryVault } from "@ludiary/connector-testkit";
import { ConnectorError } from "@ludiary/contracts";
import { describe, expect, it } from "vitest";
import { createEpicConnector } from "../src";
import { ACCESS, CAT, ID, NS, readJson, REFRESH, REFRESH_2 } from "./helpers";

const c = createEpicConnector();
const catalog = readJson("catalog", "bulk-items.json");
const page1 = readJson("library", "page-1.json");
const page2 = readJson("library", "page-2.json");
type Answer = { status: number; body?: unknown; headers?: Record<string, string> };
const HOSTS = c.apiHosts;
const tokenOk: Answer = { status: 200, body: { access_token: ACCESS, refresh_token: REFRESH_2, expires_in: 28800 } };

function epic(o: { token?: Answer; library?: (cursor: string | null) => Answer; catalog?: (url: URL) => Answer } = {}) {
  return fakeHttp((r) => {
    if (r.url.includes("/oauth/token")) return o.token ?? tokenOk;
    if (r.url.includes("library-service")) {
      const cursor = r.query?.["cursor"] === undefined ? null : String(r.query["cursor"]);
      return o.library ? o.library(cursor) : { status: 200, body: cursor === null ? page1 : page2 };
    }
    return o.catalog ? o.catalog(new URL(r.url)) : { status: 200, body: catalog };
  }, { hosts: HOSTS });
}
const run = (http: ReturnType<typeof epic>, secrets: Record<string, string> = { refreshToken: REFRESH }) => {
  const ctx = syncContext({ http, secrets });
  return { ctx, result: c.listLibrary!(ctx) };
};
const failure = async (p: Promise<unknown>): Promise<ConnectorError> => {
  const e = await p.then(() => null, (x: unknown) => x);
  expect(e).toBeInstanceOf(ConnectorError);
  return e as ConnectorError;
};
const rec = (n: number, ns = NS) => ({ namespace: ns, catalogItemId: (0xa0000000 + n).toString(16).padStart(32, "0"), appName: `G${n}` });

describe("listLibrary (ADR 78, point 8)", () => {
  it("maps the fixtures: games and DLC with their base, applications/stubs skipped, ue skipped, repeats removed, a malformed record makes it partial", async () => {
    const { ctx, result } = run(epic());
    const snap = await result;
    expect(snap.complete).toBe(false); // NOT-HEX
    expect(snap.entries).toEqual([
      {
        storeGameId: ID,
        kind: "game",
        title: "Test Game One",
        media: {
          coverUrl: `https://cdn1.epicgames.com/offer/${NS}/test-cover_1200x1600-0000`,
          heroUrl: "https://cdn2.unrealengine.com/test-hero_2560x1440-0000",
        },
      },
      { storeGameId: `${NS}:${"0".repeat(31)}2:TestDlc01`, kind: "dlc", baseStoreGameId: ID, title: "Test DLC" },
    ]);
    expect(ctx.logs.length).toBeGreaterThan(0);
  });

  it("paginates with the cursor passed in `query`, platform and includeMetadata; bearer on every call", async () => {
    const http = epic();
    await run(http).result;
    const lib = http.requests.filter((r) => r.url.includes("library-service"));
    expect(lib.map((r) => r.query)).toEqual([{ includeMetadata: "true", platform: "Windows" }, { includeMetadata: "true", platform: "Windows", cursor: "cursor-two" }]);
    expect(lib.every((r) => !r.url.includes("?"))).toBe(true);
    for (const r of http.requests.filter((x) => !x.url.includes("/oauth/token"))) expect(sentHeaders(r)["authorization"]).toBe(`bearer ${ACCESS}`);
  });

  it("a clean library is complete", async () => {
    const snap = await run(epic({ library: () => ({ status: 200, body: { records: [page1 && (page1 as { records: unknown[] }).records[0]], responseMetadata: {} } }) })).result;
    expect(snap.complete).toBe(true);
    expect(snap.entries).toHaveLength(1);
  });

  it("renews first and saves the rotated token BEFORE the first library request", async () => {
    const order: string[] = [];
    const http = epic();
    const ctx = syncContext({ http, secrets: { refreshToken: REFRESH } });
    const vault = ctx.secrets as MemoryVault;
    const set = vault.set.bind(vault);
    vault.set = async (n, v) => {
      order.push(`set:${n}`);
      return set(n, v);
    };
    const inner = http.request.bind(http);
    http.request = async (r) => {
      order.push(r.url.includes("oauth") ? "token" : r.url.includes("library") ? "library" : "catalog");
      return inner(r);
    };
    await c.listLibrary!(ctx);
    expect(order.slice(0, 3)).toEqual(["token", "set:refreshToken", "library"]);
    expect(vault.values.get("refreshToken")).toBe(REFRESH_2);
    expect(ctx.logs.find((l) => l.msg === "Epic session renewed")?.fields).toEqual({ refreshExpires: -1, accessExpires: 28800 });
  });

  it("a failed save stops everything", async () => {
    const http = epic();
    const ctx = syncContext({ http, secrets: { refreshToken: REFRESH } });
    (ctx.secrets as MemoryVault).set = async () => {
      throw new ConnectorError("internal", "vault is down");
    };
    await expect(c.listLibrary!(ctx)).rejects.toThrow("vault is down");
    expect(http.requests.filter((r) => r.url.includes("library"))).toEqual([]);
  });

  it("renewal: 400, 401 and 403 are auth.expired; 429 rate-limited; no token is auth.required", async () => {
    for (const status of [400, 401, 403]) {
      expect(await failure(run(epic({ token: { status } })).result)).toMatchObject({ code: "auth.expired", details: { messageKey: "connectors.epic.error.expired" } });
    }
    expect(await failure(run(epic({ token: { status: 429, headers: { "Retry-After": "7" } } })).result)).toMatchObject({ code: "store.rate-limited", details: { retryAfterMs: 7000 } });
    expect(await failure(run(epic(), {}).result)).toMatchObject({ code: "auth.required" });
  });

  it("library: 401/403 expired, 429, 500 and a body without records are errors", async () => {
    for (const status of [401, 403]) expect(await failure(run(epic({ library: () => ({ status }) })).result)).toMatchObject({ code: "auth.expired" });
    expect(await failure(run(epic({ library: () => ({ status: 429 }) })).result)).toMatchObject({ code: "store.rate-limited" });
    for (const a of [{ status: 500 }, { status: 200, body: { x: 1 } }, { status: 200, body: { records: {} } }]) {
      expect(await failure(run(epic({ library: () => a })).result)).toMatchObject({ code: "store.unexpected-response" });
    }
  });

  it("a repeated cursor, an invalid cursor and too many pages are unexpected-response", async () => {
    const page = (next: unknown) => ({ status: 200, body: { records: [], responseMetadata: { nextCursor: next } } });
    expect(await failure(run(epic({ library: () => page("same") })).result)).toMatchObject({ code: "store.unexpected-response" });
    for (const bad of ["a\nb", "x".repeat(2049), 5]) {
      expect(await failure(run(epic({ library: () => page(bad) })).result)).toMatchObject({ code: "store.unexpected-response" });
    }
    let n = 0;
    expect(await failure(run(epic({ library: () => page(`c${n++}`) })).result)).toMatchObject({ code: "store.unexpected-response" });
    expect(n).toBe(200);
  });

  it("more than 50 000 records is unexpected-response", async () => {
    const big = { records: Array.from({ length: 50_001 }, () => ({})), responseMetadata: {} };
    expect(await failure(run(epic({ library: () => ({ status: 200, body: big }) })).result)).toMatchObject({ code: "store.unexpected-response" });
  });

  it("catalog: 401/403 expired, 429, 500, a body that is not an object -> the sync fails", async () => {
    for (const status of [401, 403]) expect(await failure(run(epic({ catalog: () => ({ status }) })).result)).toMatchObject({ code: "auth.expired" });
    expect(await failure(run(epic({ catalog: () => ({ status: 429 }) })).result)).toMatchObject({ code: "store.rate-limited" });
    for (const a of [{ status: 500 }, { status: 404 }, { status: 200, body: [] }]) {
      expect(await failure(run(epic({ catalog: () => a })).result)).toMatchObject({ code: "store.unexpected-response" });
    }
  });

  it("an id the catalog does not return is not listed and does not make it partial; a missing title uses Epic <appName>", async () => {
    const lib = { records: [rec(1), rec(2)], responseMetadata: {} };
    const body = { [rec(1).catalogItemId]: { categories: [{ path: "games" }] } };
    const snap = await run(epic({ library: () => ({ status: 200, body: lib }), catalog: () => ({ status: 200, body }) })).result;
    expect(snap).toEqual({ complete: true, entries: [{ storeGameId: `${NS}:${rec(1).catalogItemId}:G1`, kind: "game", title: "Epic G1" }] });
  });

  it("titles are cleaned and capped at 300", async () => {
    const body = { [rec(1).catalogItemId]: { title: "A\u0000" + "x".repeat(400), categories: [{ path: "games" }] } };
    const snap = await run(epic({ library: () => ({ status: 200, body: { records: [rec(1)], responseMetadata: {} } }), catalog: () => ({ status: 200, body }) })).result;
    expect(snap.entries[0]!.title).toHaveLength(300);
    expect(snap.entries[0]!.title.startsWith("A x")).toBe(true);
  });

  it("catalog requests: 50 ids at most, 6 at a time, one namespace each", async () => {
    let now = 0;
    let max = 0;
    const records = Array.from({ length: 130 }, (_, i) => rec(i));
    const http = fakeHttp(async (r) => {
      if (r.url.includes("/oauth/token")) return tokenOk;
      if (r.url.includes("library-service")) return { status: 200, body: { records, responseMetadata: {} } };
      max = Math.max(max, ++now);
      await new Promise((x) => setTimeout(x, 5));
      now--;
      return { status: 200, body: {} };
    }, { hosts: HOSTS });
    await run(http).result;
    const sizes = http.requests.filter((r) => r.url.includes("/bulk/items")).map((r) => new URL(r.url).searchParams.getAll("id").length);
    expect(sizes.sort((a, b) => a - b)).toEqual([30, 50, 50]);
    expect(max).toBeLessThanOrEqual(6);
  });

  it("at most 2000 namespaces per sync: the rest is dropped without requests and the snapshot is partial", async () => {
    const records = Array.from({ length: 2005 }, (_, i) => rec(i, `ns${i}`));
    const http = epic({ library: () => ({ status: 200, body: { records, responseMetadata: {} } }), catalog: () => ({ status: 200, body: {} }) });
    const snap = await run(http).result;
    expect(snap.complete).toBe(false);
    expect(http.requests.filter((r) => r.url.includes("/bulk/items"))).toHaveLength(2000);
  });

  it("the log and errors carry no tokens, titles or Epic ids", async () => {
    const { ctx, result } = run(epic());
    await result;
    const log = JSON.stringify(ctx.logs);
    for (const s of [ACCESS, REFRESH, REFRESH_2, CAT, NS, "Test Game One"]) expect(log).not.toContain(s);
  });

  describe("DLC base (ADR 83, points 8 and 13)", () => {
    const cat = (n: number) => (0xb0000000 + n).toString(16).padStart(32, "0");
    const OTHER = "0000000000000000000000000000b2b2";
    const run2 = async (records: unknown[], items: Record<string, unknown>) => {
      const { ctx, result } = run(epic({ library: () => ({ status: 200, body: { records, responseMetadata: {} } }), catalog: () => ({ status: 200, body: items }) }));
      return { ctx, snap: await result };
    };
    const game = (n: number) => ({ id: cat(n), title: `G${n}`, categories: [{ path: "games" }] });
    const r = (n: number, app = `A${n}`, ns = NS) => ({ namespace: ns, catalogItemId: cat(n), appName: app });
    const key = (n: number, app = `A${n}`, ns = NS) => `${ns}:${cat(n)}:${app}`;

    it("base owned (batch namespace, own namespace, list); not owned; self; DLC never base of a DLC", async () => {
      const { snap, ctx } = await run2([r(1), r(2), r(3), r(4), r(5), r(6), r(7, "A7", OTHER)], {
        [cat(1)]: game(1),
        [cat(2)]: { id: cat(2), title: "D2", categories: [{ path: "addons" }], mainGameItem: { id: cat(1) } },
        [cat(3)]: { id: cat(3), title: "D3", categories: [{ path: "addons" }], mainGameItem: { id: cat(7), namespace: OTHER } },
        [cat(4)]: { id: cat(4), title: "D4", mainGameItemList: [{ nope: 1 }, { id: cat(1) }] },
        [cat(5)]: { id: cat(5), title: "D5", categories: [{ path: "addons" }], mainGameItem: { id: cat(99) } },
        [cat(6)]: { id: cat(6), title: "D6", categories: [{ path: "addons" }], mainGameItem: { id: cat(2) } }, // base is a DLC
        [cat(7)]: game(7),
      });
      const by = Object.fromEntries(snap.entries.map((e) => [e.storeGameId, e]));
      expect(by[key(2)]).toMatchObject({ kind: "dlc", baseStoreGameId: key(1) });
      expect(by[key(3)]).toMatchObject({ kind: "dlc", baseStoreGameId: key(7, "A7", OTHER) });
      expect(by[key(4)]).toMatchObject({ kind: "dlc", baseStoreGameId: key(1) });
      expect(by[key(5)]).toEqual({ storeGameId: key(5), kind: "dlc", title: "D5" });
      expect(by[key(6)]!.baseStoreGameId).toBeUndefined();
      expect(JSON.stringify(ctx.logs)).not.toMatch(/D2|D5/);
    });

    it("the base is found even when its batch comes after the DLC (two namespaces) and with several app names the lowest wins", async () => {
      const { snap } = await run2([r(1, "Zed"), r(1, "Alpha"), r(2, "D", OTHER)], {
        [cat(1)]: game(1),
        [cat(2)]: { id: cat(2), title: "D", categories: [{ path: "addons" }], mainGameItem: { id: cat(1), namespace: NS } },
      });
      expect(snap.entries.find((e) => e.kind === "dlc")?.baseStoreGameId).toBe(key(1, "Alpha"));
    });
  });
});
