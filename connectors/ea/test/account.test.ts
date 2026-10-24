// EA account (ADR 82): wizard, session, library, covers and Install. Invented values only; no network.
import { fakeHttp, launchContext, sentHeaders, syncContext, wizardContext, type MemoryVault } from "@ludiary/connector-testkit";
import { ConnectorError, type StoredProperty } from "@ludiary/contracts";
import { describe, expect, it } from "vitest";
import { createEaConnector } from "../src";
import { CAPTURE_URL, TOKEN_TTL_MS } from "../src/auth";
import { BATCH } from "../src/library";
import { INSTALL_URI_RE } from "../src/launch";

const c = createEaConnector();
const wiz = c.connection!;
const TOKEN = "ea-test-access-token-" + "a".repeat(48);
const NOW = Date.parse("2026-10-23T12:00:00Z");
const NAME = "TestUser";
type Answer = { status: number; body?: unknown; headers?: Record<string, string> };
const failure = async (p: Promise<unknown>): Promise<ConnectorError> => {
  const e = await p.then(() => null, (x: unknown) => x);
  expect(e).toBeInstanceOf(ConnectorError);
  return e as ConnectorError;
};
const stored = (ctx: { secrets: unknown }) => (ctx.secrets as MemoryVault).values;
const embedded = (v = TOKEN) => ({ kind: "fields", values: { token: v } }) as const;

describe("wizard (ADR 82, point 2)", () => {
  const ident = (a: Answer = { status: 200, body: { data: { me: { player: { displayName: NAME } } } } }) => fakeHttp(() => a, { hosts: c.apiHosts });

  it("start: the exact open-external step with the token URL and a pasted json field", async () => {
    const step = await wiz.start(wizardContext());
    expect(step).toEqual({
      kind: "open-external",
      id: "login",
      titleKey: "connectors.ea.login.title",
      bodyKey: "connectors.ea.login.body",
      url: "https://accounts.ea.com/connect/auth?client_id=ORIGIN_JS_SDK&response_type=token&redirect_uri=nucleus:rest&prompt=none",
      awaits: "input",
      fields: [{ name: "token", labelKey: "connectors.ea.login.field", secret: true, paste: true, extract: "json-field:access_token", pattern: "^[A-Za-z0-9+/=_.-]{64,8192}$", maxLength: 4096 }],
    });
    expect(CAPTURE_URL).toBe((step as { url: string }).url);
    expect(c.authHosts).toContain(new URL(CAPTURE_URL).hostname);
  });

  it("a loose value that fits the pattern is accepted (trimmed)", async () => {
    const ctx = wizardContext({ http: ident(), now: NOW });
    expect(await wiz.submit(ctx, "login", embedded(`  ${TOKEN}
`))).toEqual({ kind: "done", accountLabel: NAME });
    expect(stored(ctx).get("accessToken")).toBe(TOKEN);
  });

  it.each(['{"error":"login_required"}', '{"access_token":"x"}', ""])("pasted %j: auth.invalid with error.token, no request, nothing stored", async (v) => {
    const http = ident();
    const ctx = wizardContext({ http });
    const e = await failure(wiz.submit(ctx, "login", embedded(v)));
    expect([e.code, e.details.messageKey]).toEqual(["auth.invalid", "connectors.ea.error.token"]);
    expect(http.requests).toHaveLength(0);
    expect(stored(ctx).size).toBe(0);
    expect(JSON.stringify([e.message, ctx.logs])).not.toMatch(/login_required|ea-test/);
  });

  it("identity with the Secret header, stores both values (now + 50 min) and returns the name", async () => {
    const http = ident();
    const ctx = wizardContext({ http, now: NOW });
    expect(await wiz.submit(ctx, "login", embedded())).toEqual({ kind: "done", accountLabel: NAME });
    expect([...stored(ctx)]).toEqual([["accessToken", TOKEN], ["accessTokenExpiresAt", String(NOW + 50 * 60_000)]]);
    expect(TOKEN_TTL_MS).toBe(3_000_000);
    const [req] = http.requests;
    expect([req!.method, req!.url]).toEqual(["POST", "https://service-aggregation-layer.juno.ea.com/graphql"]);
    expect(sentHeaders(req!)).toEqual({ authorization: `Bearer ${TOKEN}` });
    expect(JSON.stringify(req)).not.toMatch(/ea-test|Bearer/);
    expect(JSON.stringify(ctx.logs)).not.toMatch(/TestUser|ea-test/);
  });

  it.each([[undefined, { kind: "done" }], ["", { kind: "done" }], ["  \u0007Name\n ", { kind: "done", accountLabel: "Name" }], ["x".repeat(100), { kind: "done", accountLabel: "x".repeat(64) }]])(
    "account name %j is sanitised or omitted",
    async (n, expected) => {
      const http = ident({ status: 200, body: { data: { me: { player: { displayName: n } } } } });
      expect(await wiz.submit(wizardContext({ http }), "login", embedded())).toEqual(expected);
    },
  );

  it.each([401, 403])("a %i is auth.invalid with error.login and nothing is stored", async (status) => {
    const ctx = wizardContext({ http: ident({ status }) });
    const e = await failure(wiz.submit(ctx, "login", embedded()));
    expect([e.code, e.details.messageKey]).toEqual(["auth.invalid", "connectors.ea.error.login"]);
    expect(stored(ctx).size).toBe(0);
  });

  it("429 keeps Retry-After; other answers are unexpected-response; a network error keeps its code; nothing is stored", async () => {
    const e = await failure(wiz.submit(wizardContext({ http: ident({ status: 429, headers: { "retry-after": "90" } }) }), "login", embedded()));
    expect([e.code, e.details.retryAfterMs]).toEqual(["store.rate-limited", 90_000]);
    for (const a of [{ status: 500 }, { status: 200, body: [] }, { status: 200, body: { errors: [{ message: "x" }], data: {} } }, { status: 200, body: { data: {} } }] as Answer[]) {
      const ctx = wizardContext({ http: ident(a) });
      expect((await failure(wiz.submit(ctx, "login", embedded()))).code).toBe("store.unexpected-response");
      expect(stored(ctx).size).toBe(0);
    }
    const down = fakeHttp(() => {
      throw new ConnectorError("network.unavailable", "down");
    });
    expect((await failure(wiz.submit(wizardContext({ http: down }), "login", embedded()))).code).toBe("network.unavailable");
  });

  it("a me without player connects without a name", async () => {
    const http = ident({ status: 200, body: { data: { me: {} } } });
    expect(await wiz.submit(wizardContext({ http }), "login", embedded())).toEqual({ kind: "done" });
  });

  it("wrong step or input is internal; a token with a bad shape never reaches the network", async () => {
    const http = ident();
    expect((await failure(wiz.submit(wizardContext({ http }), "other", embedded()))).code).toBe("internal");
    expect((await failure(wiz.submit(wizardContext({ http }), "login", { kind: "continue" }))).code).toBe("internal");
    expect((await failure(wiz.submit(wizardContext({ http }), "login", embedded("short")))).code).toBe("auth.invalid");
    expect(http.requests).toHaveLength(0);
  });

  it("status: connected before the hour, expired after, expired without values; disconnect deletes both", async () => {
    const at = (t: number) => ({ ...syncContext({ secrets: { accessToken: TOKEN, accessTokenExpiresAt: String(NOW + 1000) } }), now: () => t });
    expect(await wiz.status(at(NOW + 999))).toEqual({ state: "connected" });
    expect(await wiz.status(at(NOW + 1000))).toEqual({ state: "expired" });
    expect(await wiz.status(syncContext({ secrets: { accessToken: TOKEN } }))).toEqual({ state: "expired" });
    expect(await wiz.status(syncContext())).toEqual({ state: "expired" });
    const ctx = at(NOW);
    await wiz.disconnect(ctx);
    expect(stored(ctx).size).toBe(0);
  });
});

describe("listLibrary (ADR 82, points 4 to 6, and 13)", () => {
  const oid = (n: number) => `Origin.OFR.50.${String(n).padStart(7, "0")}`;
  const cid = (n: number) => String(9000000 + n);
  const art = (n: number) => `https://drop-assets.ea.com/test/${cid(n)}.jpg`;

  interface Opts {
    /** pages of offer ids; "next" tokens p1, p2... */
    pages?: unknown[][];
    offers?: (ids: string[]) => { legacyOffers?: unknown; gameProducts?: unknown };
    status?: number;
    onlyGet?: boolean;
    postStatus?: number;
    /** whole body for getOffers */
    offersBody?: unknown;
  }
  // As Lutris (24-10-2026): the type comes with the entitlement; title and art under the product baseItem.
  const item = (n: number, gameType: unknown = "BASE_GAME", name?: string) => ({ originOfferId: oid(n), product: { ...(name === undefined ? {} : { name }), baseItem: gameType === null ? {} : { gameType } } }); // null: no type at all
  const legacy = (n: number, extra: Record<string, unknown> = {}) => ({ offerId: oid(n), contentId: cid(n), ...extra });
  const product = (n: number, extra: Record<string, unknown> = {}, base: Record<string, unknown> = {}) => ({
    id: `product-${n}`,
    originOfferId: oid(n),
    baseItem: { title: `Fake Game ${n}`, packArt: { largestImage: { path: art(n) } }, ...base },
    ...extra,
  });
  const defaultOffers = (ids: string[]) => ({
    legacyOffers: ids.map((id) => legacy(Number(id.slice(-7)))),
    gameProducts: { items: ids.map((id) => product(Number(id.slice(-7)))) },
  });

  function server(o: Opts = {}) {
    const pages = o.pages ?? [[item(1), item(2)]];
    return fakeHttp(
      (r) => {
        if (o.status !== undefined) return { status: o.status, headers: o.status === 429 ? { "retry-after": "60" } : {} };
        if (r.method === "POST" && o.postStatus !== undefined) return { status: o.postStatus };
        const vars = r.method === "POST" ? ((r.body as { json: { variables: Record<string, unknown>; query: string } }).json) : { variables: JSON.parse(new URL(r.url).searchParams.get("variables")!) as Record<string, unknown>, query: new URL(r.url).searchParams.get("query")! };
        if (vars.query.includes("getEntitlements")) {
          const next = vars.variables["next"] as string | undefined;
          const i = next === undefined ? 0 : Number(next.slice(1));
          const items = pages[i];
          return { status: 200, body: { data: { me: { ownedGameProducts: { next: i + 1 < pages.length ? `p${i + 1}` : null, items } } } } };
        }
        if (o.offersBody !== undefined) return { status: 200, body: o.offersBody };
        return { status: 200, body: { data: (o.offers ?? defaultOffers)(vars.variables["offerIds"] as string[]) } };
      },
      { hosts: c.apiHosts },
    );
  }
  const run = (o: Opts = {}, http = server(o), secrets: Record<string, string> = { accessToken: TOKEN, accessTokenExpiresAt: String(NOW + 60_000) }, t = NOW) => {
    const ctx = { ...syncContext({ http, secrets }), now: () => t };
    return { http, ctx, result: c.listLibrary!(ctx) };
  };
  const logged = (ctx: { logs: readonly { fields?: Readonly<Record<string, unknown>> | undefined }[] }, key: string) => ctx.logs.find((l) => l.fields?.[key] !== undefined)?.fields?.[key];

  it("maps owned games to contentId with the exact covers", async () => {
    const r = run();
    expect(await r.result).toEqual({
      complete: true,
      entries: [
        { storeGameId: cid(1), kind: "game", title: "Fake Game 1", media: { coverUrl: art(1) } },
        { storeGameId: cid(2), kind: "game", title: "Fake Game 2", media: { coverUrl: art(2) } },
      ],
    });
    const [e, o] = r.http.requests;
    expect([e!.method, e!.url, sentHeaders(e!)]).toEqual(["POST", "https://service-aggregation-layer.juno.ea.com/graphql", { authorization: `Bearer ${TOKEN}` }]);
    expect(JSON.stringify(o!.body)).toContain(oid(1));
    expect(JSON.stringify(r.http.requests)).not.toMatch(/ea-test|Bearer/);
  });

  it("without a token: auth.required; past the hour or without an expiry: auth.expired and no request", async () => {
    expect((await failure(run({}, server(), {}).result)).code).toBe("auth.required");
    for (const secrets of [{ accessToken: TOKEN, accessTokenExpiresAt: String(NOW) }, { accessToken: TOKEN }, { accessToken: TOKEN, accessTokenExpiresAt: "x" }]) {
      const r = run({}, server(), secrets);
      const e = await failure(r.result);
      expect([e.code, e.details.messageKey]).toEqual(["auth.expired", "connectors.ea.error.expired"]);
      expect(r.http.requests).toHaveLength(0);
    }
  });

  it.each([[401, "auth.expired"], [403, "auth.expired"], [429, "store.rate-limited"], [500, "store.unexpected-response"]])("status %i is %s and the secrets stay", async (status, code) => {
    const r = run({ status });
    const e = await failure(r.result);
    expect(e.code).toBe(code);
    if (status === 429) expect(e.details.retryAfterMs).toBe(60_000);
    expect(stored(r.ctx).size).toBe(2);
    expect(r.http.requests).toHaveLength(1);
  });

  it("a network error keeps its code", async () => {
    const down = fakeHttp(() => {
      throw new ConnectorError("network.timeout", "slow");
    });
    expect((await failure(run({}, down as never).result)).code).toBe("network.timeout");
  });

  it("falls back to GET with URLSearchParams when POST is refused, once, and keeps using GET", async () => {
    const r = run({ postStatus: 405 });
    expect((await r.result).entries).toHaveLength(2);
    expect(r.http.requests.map((q) => q.method)).toEqual(["POST", "GET", "GET"]);
    const get = r.http.requests[1]!;
    expect(get.body).toBeUndefined();
    const u = new URL(get.url);
    expect(u.origin + u.pathname).toBe("https://service-aggregation-layer.juno.ea.com/graphql");
    expect(u.searchParams.get("query")).toContain("getEntitlements");
    expect(JSON.stringify(r.ctx.logs)).not.toMatch(/graphql|getEntitlements/);
  });

  it("getEntitlements: several pages with next", async () => {
    const r = run({ pages: [[item(1)], [item(2)], [item(3)]] });
    expect((await r.result).entries.map((e) => e.storeGameId)).toEqual([cid(1), cid(2), cid(3)]);
    expect(logged(r.ctx, "pages")).toBe(3);
    expect(r.http.requests).toHaveLength(4); // 3 pages + 1 batch
  });

  it("a repeated next, 201 pages and 50 001 entitlements are unexpected-response", async () => {
    const cycle = fakeHttp(() => ({ status: 200, body: { data: { me: { ownedGameProducts: { next: "same", items: [] } } } } }), { hosts: c.apiHosts });
    expect((await failure(run({}, cycle).result)).code).toBe("store.unexpected-response");
    expect(cycle.requests).toHaveLength(2);
    let n = 0;
    const endless = fakeHttp(() => ({ status: 200, body: { data: { me: { ownedGameProducts: { next: `n${n++}`, items: [] } } } } }), { hosts: c.apiHosts });
    expect((await failure(run({}, endless).result)).code).toBe("store.unexpected-response");
    expect(endless.requests).toHaveLength(200);
    const big = fakeHttp(() => ({ status: 200, body: { data: { me: { ownedGameProducts: { next: null, items: Array.from({ length: 50_001 }, () => ({})) } } } } }), { hosts: c.apiHosts });
    expect((await failure(run({}, big).result)).code).toBe("store.unexpected-response");
    for (const body of [{ data: { me: {} } }, { data: { me: { ownedGameProducts: { items: [], next: 5 } } } }, { errors: [{ message: "x" }] }, []]) {
      expect((await failure(run({}, fakeHttp(() => ({ status: 200, body }), { hosts: c.apiHosts })).result)).code).toBe("store.unexpected-response");
    }
  });

  it("an invalid or repeated offer id is skipped and makes it partial", async () => {
    const r = run({ pages: [[item(1), item(1), { originOfferId: "bad id" }, { originOfferId: 7 }, null]] });
    const snap = await r.result;
    expect(snap.entries.map((e) => e.storeGameId)).toEqual([cid(1)]);
    expect(snap.complete).toBe(false);
    expect(logged(r.ctx, "badIds")).toBe(3);
  });

  it("getOffers goes in serial batches of exactly 50 and only reads the offers asked", async () => {
    const all = Array.from({ length: 120 }, (_, i) => item(i + 1));
    const r = run({ pages: [all] });
    expect((await r.result).entries).toHaveLength(120);
    const batches = r.http.requests.slice(1).map((q) => ((q.body as { json: { variables: { offerIds: string[] } } }).json.variables.offerIds.length));
    expect(batches).toEqual([BATCH, BATCH, 20]);
    // foreign offers are ignored and counted
    const r2 = run({ offers: (ids) => ({ legacyOffers: [...ids.map((i) => legacy(Number(i.slice(-7)))), legacy(99), "x"], gameProducts: { items: [product(99, {}, { title: "Foreign" })] } }) });
    const s2 = await r2.result;
    expect(s2.entries.map((e) => e.storeGameId)).toEqual([cid(1), cid(2)]);
    expect(s2.complete).toBe(true);
    expect(logged(r2.ctx, "foreign")).toBe(2);
  });

  it("the queries use Lutris' shapes: paging{limit,next}, the type with the entitlement, the title under baseItem (24-10-2026)", async () => {
    const r = run({});
    await r.result;
    const queries = r.http.requests.map((q) => (q.body as { json: { query: string } }).json.query);
    expect(queries[0]).toContain("paging:{limit:$limit,next:$next}");
    expect(queries[0]).toContain("product{name baseItem{gameType}}");
    expect(queries[1]).toContain("baseItem{title packArt");
  });

  it("a product matched by its id equal to the contentId (no originOfferId), as Lutris does", async () => {
    const r = run({ pages: [[item(1)]], offers: () => ({ legacyOffers: [legacy(1)], gameProducts: { items: [{ id: cid(1), baseItem: { title: "By content id" } }] } }) });
    expect((await r.result).entries.map((e) => e.title)).toEqual(["By content id"]);
  });

  it("if EA rejects product.name, the entitlements query runs again once without it", async () => {
    const base = server({});
    const refuse = fakeHttp(() => ({ status: 200, body: { errors: [{ message: "Cannot query field \"name\" on type \"GameProduct\"" }] } }), { hosts: c.apiHosts });
    let rejectedOnce = false;
    const http: typeof base = {
      ...base,
      request: async (r) => {
        if ((r.body as { json: { query: string } }).json.query.includes("product{name") && !rejectedOnce) {
          rejectedOnce = true;
          return refuse.request(r);
        }
        return base.request(r);
      },
    };
    const r = run({}, http);
    expect((await r.result).entries).toHaveLength(2);
    expect(logged(r.ctx, "nameFallback")).toBe(1);
  });

  it("GraphQL errors are logged by their first message only, trimmed", async () => {
    const http = fakeHttp(() => ({ status: 200, body: { errors: [{ message: "Unknown argument \"limit\" on field ownedGameProducts" }] } }), { hosts: c.apiHosts });
    const r = run({}, http);
    await expect(r.result).rejects.toMatchObject({ code: "store.unexpected-response" });
    expect(JSON.stringify(r.ctx.logs)).toContain("Unknown argument");
  });

  it("an offer that does not come back makes it partial", async () => {
    const r = run({ offers: (ids) => ({ legacyOffers: [legacy(Number(ids[0]!.slice(-7)))], gameProducts: { items: [] } }) });
    const snap = await r.result;
    expect(snap.entries).toHaveLength(1);
    expect(snap.complete).toBe(false);
    expect(logged(r.ctx, "missingOffers")).toBe(1);
  });

  it("add-on content and items without a type are out (as Lutris: only BASE_GAME)", async () => {
    const r = run({
      pages: [[item(1, "EXTRA_CONTENT"), item(2, null), item(3)]],
      offers: () => ({ legacyOffers: [legacy(1), legacy(2), legacy(3)], gameProducts: { items: [product(1), product(2), product(3)] } }),
    });
    const snap = await r.result;
    expect(snap.entries.map((e) => e.storeGameId)).toEqual([cid(3)]);
    expect(snap.complete).toBe(true);
    expect([logged(r.ctx, "notGame"), logged(r.ctx, "noType")]).toEqual([1, 1]);
  });

  it("an unknown type and known add-on types are out, each counted", async () => {
    const r = run({
      pages: [[item(1, "NEW_KIND"), item(2, "dlc"), item(3, "EXPANSION")]],
      offers: () => ({ legacyOffers: [legacy(1), legacy(2), legacy(3)], gameProducts: { items: [product(1), product(2), product(3)] } }),
    });
    expect((await r.result).entries.map((e) => e.storeGameId)).toEqual([]);
    expect([logged(r.ctx, "unknownType"), logged(r.ctx, "notGame")]).toEqual([1, 2]);
  });

  it("a malformed contentId is untranslated and makes it partial", async () => {
    const r = run({ offers: () => ({ legacyOffers: [legacy(1, { contentId: "a b" }), legacy(2, { contentId: 7 })], gameProducts: { items: [] } }) });
    const snap = await r.result;
    expect(snap.entries).toEqual([]);
    expect(snap.complete).toBe(false);
    expect(logged(r.ctx, "untranslated")).toBe(2);
  });

  it("without contentId the offer id is the storeGameId, counted, and stays complete", async () => {
    const r = run({ offers: () => ({ legacyOffers: [legacy(1, { contentId: undefined }), legacy(2, { contentId: null })], gameProducts: { items: [product(1)] } }) });
    const snap = await r.result;
    expect(snap.entries.map((e) => e.storeGameId)).toEqual([oid(1), oid(2)]);
    expect(snap.complete).toBe(true);
    expect([logged(r.ctx, "byOfferId"), logged(r.ctx, "untranslated")]).toEqual([2, 0]);
  });

  it("a contentId ending in _interestOnly is not owned: skipped, counted, complete untouched", async () => {
    const r = run({ offers: () => ({ legacyOffers: [legacy(1, { contentId: "1024944_interestOnly" }), legacy(2)], gameProducts: { items: [product(2)] } }) });
    const snap = await r.result;
    expect(snap.entries.map((e) => e.storeGameId)).toEqual([cid(2)]);
    expect(snap.complete).toBe(true);
    expect(logged(r.ctx, "interestOnly")).toBe(1);
  });

  it("the title falls back to the entitlement product name; EA <id> only with neither; noTitle counts", async () => {
    const r = run({
      pages: [[item(1, "BASE_GAME", "From Name"), item(2, "BASE_GAME", "Unused"), item(3)]],
      offers: () => ({ legacyOffers: [legacy(1), legacy(2), legacy(3)], gameProducts: { items: [product(1, {}, { title: undefined }), product(2), product(3, {}, { title: undefined })] } }),
    });
    const snap = await r.result;
    expect(snap.entries.map((e) => e.title)).toEqual(["From Name", "Fake Game 2", `EA ${cid(3)}`]);
    expect(logged(r.ctx, "noTitle")).toBe(1);
  });

  it("a cover from app-images.ea.com is accepted; another host is not", async () => {
    const good = "https://app-images.ea.com/x/a.jpg";
    const r = run({
      pages: [[item(1), item(2)]],
      offers: () => ({ legacyOffers: [legacy(1), legacy(2)], gameProducts: { items: [product(1, {}, { packArt: good }), product(2, {}, { packArt: "https://other.ea.com/a.jpg" })] } }),
    });
    const snap = await r.result;
    expect(snap.entries.map((e) => e.media?.coverUrl)).toEqual([good, undefined]);
    expect(logged(r.ctx, "invalidArt")).toBe(1);
  });

  it("two offers with the same contentId: the smaller offer id wins", async () => {
    const r = run({
      pages: [[item(2), item(1)]],
      offers: () => ({
        legacyOffers: [legacy(2, { contentId: "9000001" }), legacy(1, { contentId: "9000001" })],
        gameProducts: { items: [product(2, {}, { title: "Second" }), product(1, {}, { title: "First" })] },
      }),
    });
    const snap = await r.result;
    expect(snap.entries.map((e) => e.title)).toEqual(["First"]);
    expect(snap.complete).toBe(true);
    expect(logged(r.ctx, "duplicateContent")).toBe(1);
  });

  it("errors in the body or a missing offer list are unexpected-response", async () => {
    for (const offersBody of [{ errors: [{ message: "x" }], data: { legacyOffers: [] } }, { data: {} }, { data: { legacyOffers: "no" } }, []]) {
      expect((await failure(run({ offersBody }).result)).code).toBe("store.unexpected-response");
    }
  });

  it("covers: only https from the exact host; others are dropped, counted, and only their host is logged (8 at most)", async () => {
    const arts: unknown[] = [
      art(1),
      "http://drop-assets.ea.com/x.jpg",
      "https://user@drop-assets.ea.com/x.jpg",
      "https://drop-assets.ea.com:8443/x.jpg",
      "https://drop-assets.ea.com.evil.test/x.jpg",
      "https://drop-assets.ea.com/" + "x".repeat(1010),
      { path: "https://drop-assets.ea.com/x.jpg" },
      7,
      ...Array.from({ length: 10 }, (_, i) => `https://cdn${i}.example.test/a.jpg`),
    ];
    const n = arts.length;
    const r = run({
      pages: [Array.from({ length: n }, (_, i) => item(i + 1))],
      offers: (ids) => ({
        legacyOffers: ids.map((id) => legacy(Number(id.slice(-7)))),
        gameProducts: { items: ids.map((id) => { const i = Number(id.slice(-7)); return { originOfferId: id, baseItem: { title: "T", packArt: arts[i - 1] } }; }) },
      }),
    });
    const snap = await r.result;
    expect(snap.entries.filter((e) => e.media !== undefined).map((e) => e.media!.coverUrl)).toEqual([art(1)]);
    expect(logged(r.ctx, "invalidArt")).toBe(n - 1);
    const hosts = String(logged(r.ctx, "invalidArtHosts")).split(",");
    expect(hosts).toHaveLength(8);
    expect(hosts.every((h) => /^[a-z0-9.-]+$/.test(h))).toBe(true);
    expect(JSON.stringify(r.ctx.logs)).not.toMatch(/https:|user@|x\.jpg/);
  });

  it("the plain packArt string is accepted too (shape unverified, EAA9)", async () => {
    const r = run({ pages: [[item(1)]], offers: () => ({ legacyOffers: [legacy(1)], gameProducts: { items: [{ originOfferId: oid(1), baseItem: { title: "T", packArt: art(1) } }] } }) });
    expect((await r.result).entries[0]!.media).toEqual({ coverUrl: art(1) });
  });

  it("titles are cleaned, cut to 300 and defaulted", async () => {
    const r = run({
      pages: [[item(1), item(2)]],
      offers: () => ({ legacyOffers: [legacy(1), legacy(2)], gameProducts: { items: [product(1, {}, { title: "A\u0000\nB" + "x".repeat(400) }), product(2, {}, { title: 5 })] } }),
    });
    const snap = await r.result;
    expect(snap.entries[0]!.title).toMatch(/^A {2}Bx+$/);
    expect(snap.entries[0]!.title).toHaveLength(300);
    expect(snap.entries[1]!.title).toBe(`EA ${cid(2)}`);
  });

  it("logs hold counters only: no token, name, offer id, title or path", async () => {
    const r = run();
    await r.result;
    expect(JSON.stringify(r.ctx.logs)).not.toMatch(/ea-test|Fake Game|Origin\.OFR|9000001|C:\\|TestUser/);
  });
});

describe("Install (ADR 82, point 7)", () => {
  const APP = "C:\\Program Files\\Electronic Arts\\EA Desktop\\EA Desktop";
  const prop = (id: string | null): StoredProperty => ({ storeGameId: id, installed: false, installPath: null, launchData: null });
  const ctx = (app = true) => launchContext({ launchers: [{ declarationId: "ea-desktop", path: APP }], tree: { [`${APP}\\`]: "", ...(app ? { [`${APP}\\EADesktop.exe`]: "" } : {}) } });

  it("builds the exact URI from the stored id, without reading installerdata", async () => {
    expect(await c.resolveAction(prop("9000001"), "install", ctx())).toEqual({ kind: "uri", uri: "origin2://game/launch?offerIds=9000001&autoDownload=1" });
  });
  it("a null id gives nothing; an invalid id is action.unsupported", async () => {
    expect(await c.resolveAction(prop(null), "install", ctx())).toBeNull();
    for (const id of ["1&autoDownload=1", "a,b", "a b", "../x", ""]) {
      await expect(c.resolveAction(prop(id), "install", ctx())).rejects.toMatchObject({ code: "action.unsupported", details: { messageKey: "connectors.ea.errors.invalidId" } });
    }
  });
  it("without the EA app: launch.launcher-missing; unresolved launchers do not block", async () => {
    await expect(c.resolveAction(prop("1"), "install", ctx(false))).rejects.toMatchObject({ code: "launch.launcher-missing", details: { messageKey: "connectors.ea.errors.launcherMissing" } });
    const off = launchContext({ launchersResolved: false });
    expect(await c.resolveAction(prop("1"), "install", off)).toEqual({ kind: "uri", uri: "origin2://game/launch?offerIds=1&autoDownload=1" });
  });
  it("the final assertion accepts one id only", () => {
    expect(INSTALL_URI_RE.test("origin2://game/launch?offerIds=1&autoDownload=1")).toBe(true);
    for (const bad of ["origin2://game/launch?offerIds=1,2&autoDownload=1", "origin2://game/launch?offerIds=1", "origin2://game/launch?offerIds=1&autoDownload=1&x=1", "origin2://game/launch?offerIds=&autoDownload=1"]) {
      expect(INSTALL_URI_RE.test(bad)).toBe(false);
    }
  });
});
