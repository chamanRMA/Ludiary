import { fakeHttp, sentHeaders, sentQuery, syncContext, wizardContext } from "@ludiary/connector-testkit";
import { checkPriceServiceManifest, ConnectorError, type StoreId } from "@ludiary/contracts";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import en from "../locales/en.json";
import es from "../locales/es.json";
import { ITAD_SHOP_IDS, itadService as svc } from "../src";

// All answers below are invented with the shape of the documentation (ADR 86 point 10); no personal data.
const KEY = "TestKey_0123456789abcdef";
const U1 = "018d0000-0000-7000-8000-000000000001";
const U2 = "018d0000-0000-7000-8000-000000000002";
const HOSTS = { hosts: [...svc.apiHosts] };

type Answer = { status: number; headers?: Record<string, string>; body?: unknown };
function ctxWith(handler: (url: string) => Answer, secrets: Record<string, string> = { apiKey: KEY }) {
  const http = fakeHttp((r) => handler(r.url), HOSTS);
  return { http, ctx: syncContext({ http, secrets }) };
}
const failure = async (p: Promise<unknown>): Promise<ConnectorError> => {
  const e = await p.then(() => null, (x: unknown) => x);
  expect(e).toBeInstanceOf(ConnectorError);
  return e as ConnectorError;
};
const body = (r: { body?: unknown }) => (r.body as { json: unknown }).json;

describe("manifest", () => {
  it("conforms to checkPriceServiceManifest and uses the agreed hosts", () => {
    expect(checkPriceServiceManifest(svc)).toEqual([]);
    expect(svc.apiHosts).toEqual(["api.isthereanydeal.com"]);
    expect(svc.authHosts).toEqual(["isthereanydeal.com"]);
    expect(svc.linkHosts).toEqual(["itad.link", "isthereanydeal.com", "next.isthereanydeal.com"]);
    expect(svc.mediaHosts).toEqual(["assets.isthereanydeal.com", "dbxce1spal1df.cloudfront.net"]);
  });
  it("the store -> shop map matches the recorded service/shops/v1 answer", () => {
    const shops = JSON.parse(readFileSync(join(__dirname, "..", "fixtures", "shops-v1-ES.json"), "utf8")) as { id: number; title: string }[];
    const titles: Record<StoreId, string> = { steam: "Steam", gog: "GOG", epic: "Epic Game Store", ubisoft: "Ubisoft Store", ea: "EA Store" };
    for (const [store, id] of Object.entries(ITAD_SHOP_IDS)) {
      expect(shops.find((s) => s.id === id)?.title, store).toBe(titles[store as StoreId]);
    }
  });
  it("catalogs have the same keys, all under connectors.itad., and every key used exists", () => {
    expect(Object.keys(es).sort()).toEqual(Object.keys(en).sort());
    for (const k of Object.keys(en)) expect(k.startsWith("connectors.itad.")).toBe(true);
    const dir = join(__dirname, "..", "src");
    const used = new Set<string>();
    for (const f of readdirSync(dir)) {
      const src = readFileSync(join(dir, f), "utf8");
      for (const m of src.matchAll(/\bk\("([A-Za-z.]+)"\)/g)) used.add(`connectors.itad.${m[1]}`);
      for (const m of src.matchAll(/ek\("([A-Za-z]+)"\)/g)) used.add(`connectors.itad.errors.${m[1]}`);
    }
    for (const key of used) expect(key in en, key).toBe(true);
    for (const key of Object.keys(en)) if (key.includes(".errors.")) expect(used.has(key), key).toBe(true);
  });
});

describe("lookupByStore", () => {
  it("Steam: app/<id> to shop 61; GOG: the id as is to shop 35; null and absent are not found", async () => {
    const steam = ctxWith(() => ({ status: 200, body: { "app/220": U1, "app/999": null } }));
    const out = await svc.lookupByStore("steam", ["220", "999", "7"], steam.ctx);
    expect([...out]).toEqual([["220", U1]]);
    expect(steam.http.requests[0]!.url).toBe("https://api.isthereanydeal.com/lookup/id/shop/61/v1");
    expect(body(steam.http.requests[0]!)).toEqual(["app/220", "app/999", "app/7"]);

    const gog = ctxWith(() => ({ status: 200, body: { "1512372112": U2 } }));
    expect([...(await svc.lookupByStore("gog", ["1512372112"], gog.ctx))]).toEqual([["1512372112", U2]]);
    expect(gog.http.requests[0]!.url).toContain("/lookup/id/shop/35/v1");
    expect(body(gog.http.requests[0]!)).toEqual(["1512372112"]);
  });
  it("Epic, Ubisoft and EA make no request; ids with a bad format are not sent", async () => {
    const { http, ctx } = ctxWith(() => ({ status: 200, body: {} }));
    for (const s of ["epic", "ubisoft", "ea"] as const) expect((await svc.lookupByStore(s, ["abc"], ctx)).size).toBe(0);
    expect((await svc.lookupByStore("steam", ["../x", "app/1"], ctx)).size).toBe(0);
    expect(http.requests).toHaveLength(0);
  });
  it("accepts 200 ids and refuses 201", async () => {
    const ids = Array.from({ length: 200 }, (_, i) => String(i + 1));
    const { http, ctx } = ctxWith(() => ({ status: 200, body: {} }));
    await svc.lookupByStore("steam", ids, ctx);
    expect(http.requests).toHaveLength(1);
    expect((await failure(svc.lookupByStore("steam", [...ids, "201"], ctx))).code).toBe("internal");
  });
  it("a value that is not a UUID or null is an unexpected shape", async () => {
    const { ctx } = ctxWith(() => ({ status: 200, body: { "app/220": 5 } }));
    expect((await failure(svc.lookupByStore("steam", ["220"], ctx))).code).toBe("store.unexpected-response");
  });
  it("does not trust inherited keys of the answer", async () => {
    const { ctx } = ctxWith(() => ({ status: 200, body: "{}" }));
    expect((await svc.lookupByStore("steam", ["220"], ctx)).size).toBe(0);
  });
});

describe("lookupByTitle and search", () => {
  it("sends the titles as given and maps found ones", async () => {
    const { http, ctx } = ctxWith(() => ({ status: 200, body: { "Some Game": U1, "No Game": null } }));
    const out = await svc.lookupByTitle(["Some Game", "No Game", "Some Game"], ctx);
    expect([...out]).toEqual([["Some Game", U1]]);
    expect(http.requests[0]!.url).toBe("https://api.isthereanydeal.com/lookup/id/title/v1");
    expect(body(http.requests[0]!)).toEqual(["Some Game", "No Game"]);
  });
  it("search: title in the query, unknown types become null, bad entries are dropped", async () => {
    const { http, ctx } = ctxWith(() => ({
      status: 200,
      body: [
        { id: U1, slug: "a", title: "A", type: "game", mature: false },
        { id: U2, slug: "b", title: "B", type: "dlc" },
        { id: "018d0000-0000-7000-8000-000000000003", title: "C", type: "bundle" },
        { id: "not-a-uuid", title: "D", type: "game" },
        { id: "018d0000-0000-7000-8000-000000000004", title: "P", type: "package" },
        null,
      ],
    }));
    const out = await svc.search("a title", ctx);
    expect(out.map((r) => [r.title, r.type])).toEqual([["A", "game"], ["B", "dlc"], ["C", null], ["P", "package"]]);
    expect(http.requests[0]!.method).toBe("GET");
    expect(sentQuery(http.requests[0]!)["title"]).toBe("a title");
  });
  it("search media (ADR 86 point 17): boxart -> coverUrl, banner400 -> heroUrl; other sizes, hosts, schemes, ports and long URLs are dropped and counted", async () => {
    const A = "https://assets.isthereanydeal.com";
    const { ctx } = ctxWith(() => ({
      status: 200,
      body: [
        { id: U1, title: "A", type: "game", assets: { boxart: `${A}/a/boxart.jpg?t=1`, banner145: `${A}/a/145.jpg`, banner400: `${A}/a/400.jpg?t=1` } },
        { id: U2, title: "B", type: "game", assets: { banner400: `${A}/b/400.jpg` } },
        { id: "018d0000-0000-7000-8000-000000000003", title: "C", type: "game" },
        { id: "018d0000-0000-7000-8000-000000000004", title: "D", type: "game", assets: { boxart: "https://evil.example/x.jpg", banner400: `http://assets.isthereanydeal.com/d.jpg` } },
        { id: "018d0000-0000-7000-8000-000000000005", title: "E", type: "game", assets: { boxart: "https://assets.isthereanydeal.com:8443/e.jpg", banner400: `${A}/${"x".repeat(2100)}` } },
      ],
    }));
    const out = await svc.search("a", ctx);
    expect(out.map((r) => r.media)).toEqual([
      { coverUrl: `${A}/a/boxart.jpg?t=1`, heroUrl: `${A}/a/400.jpg?t=1` },
      { heroUrl: `${A}/b/400.jpg` },
      undefined,
      undefined,
      undefined,
    ]);
    const logs = JSON.stringify(ctx.logs);
    expect(logs).toContain('"mediaDropped":4');
    expect(logs).toContain("evil.example");
  });
  it("search with a non-array answer is unexpected", async () => {
    const { ctx } = ctxWith(() => ({ status: 200, body: { x: 1 } }));
    expect((await failure(svc.search("zz", ctx))).details.messageKey).toBe("connectors.itad.errors.unexpected");
  });
});

const priced = {
  id: U1,
  historyLow: { all: { amount: 4.99, amountInt: 499, currency: "EUR" }, y1: { amount: 9, amountInt: 900, currency: "EUR" } },
  deals: [
    {
      shop: { id: 61, name: "Steam" },
      price: { amount: 9.99, amountInt: 999, currency: "EUR" },
      regular: { amount: 19.99, amountInt: 1999, currency: "EUR" },
      cut: 50,
      voucher: null,
      url: "https://next.isthereanydeal.com/link/018d0000-0000-7000-8000-0000000000aa/",
      expiry: "2026-12-01T10:00:00+01:00",
    },
    {
      shop: { id: 999, name: "Other Shop" },
      price: { amount: 12, amountInt: 1200, currency: "EUR" },
      regular: { amount: 20, amountInt: 2000, currency: "EUR" },
      cut: 40,
      voucher: "CODE10",
      url: "https://itad.link/abc",
    },
    { shop: { id: 35, name: "GOG" }, price: { amountInt: "x", currency: "EUR" }, regular: {}, cut: 1, url: "https://x" },
  ],
};

describe("prices", () => {
  it("maps deals and the historical low; unknown shops get storeId null; malformed deals are dropped", async () => {
    const { http, ctx } = ctxWith(() => ({ status: 200, body: [priced] }));
    const out = await svc.prices([U1], { country: "ES", shops: ["steam", "gog", "epic", "ubisoft", "ea"] }, ctx);
    expect(out).toEqual([
      {
        id: U1,
        historyLow: { amountMinor: 499, currency: "EUR" },
        deals: [
          { shop: { storeId: "steam", serviceShopId: 61, name: "Steam" }, amountMinor: 999, regularMinor: 1999, currency: "EUR", cut: 50, voucher: null, url: priced.deals[0]!.url, expiresAt: "2026-12-01T10:00:00+01:00" },
          { shop: { storeId: null, serviceShopId: 999, name: "Other Shop" }, amountMinor: 1200, regularMinor: 2000, currency: "EUR", cut: 40, voucher: "CODE10", url: "https://itad.link/abc", expiresAt: null },
        ],
      },
    ]);
    const r = http.requests[0]!;
    expect(r.url).toBe("https://api.isthereanydeal.com/games/prices/v3");
    expect(sentQuery(r)).toEqual({ country: "ES", shops: "61,35,16,62,52" });
    expect(body(r)).toEqual([U1]);
  });
  it("shops 'all' omits the parameter; no historyLow gives null", async () => {
    const { http, ctx } = ctxWith(() => ({ status: 200, body: [{ id: U1, historyLow: null, deals: [] }] }));
    const out = await svc.prices([U1], { country: "US", shops: "all" }, ctx);
    expect(out[0]).toEqual({ id: U1, historyLow: null, deals: [] });
    expect(sentQuery(http.requests[0]!)).toEqual({ country: "US" });
  });
  it("batch limits: 200 ids, 50 with 'all'; bad country, bad ids and no shops are refused without a request", async () => {
    const ids = (n: number) => Array.from({ length: n }, (_, i) => `018d0000-0000-7000-8000-${String(i).padStart(12, "0")}`);
    const { http, ctx } = ctxWith(() => ({ status: 200, body: [] }));
    await svc.prices(ids(200), { country: "ES", shops: ["steam"] }, ctx);
    await svc.prices(ids(50), { country: "ES", shops: "all" }, ctx);
    expect(http.requests).toHaveLength(2);
    for (const bad of [
      svc.prices(ids(201), { country: "ES", shops: ["steam"] }, ctx),
      svc.prices(ids(51), { country: "ES", shops: "all" }, ctx),
      svc.prices(ids(1), { country: "es", shops: "all" }, ctx),
      svc.prices(["x"], { country: "ES", shops: "all" }, ctx),
      svc.prices(ids(1), { country: "ES", shops: [] }, ctx),
    ]) expect((await failure(bad)).code).toBe("internal");
    expect(http.requests).toHaveLength(2);
  });
  it("a non-array answer or a game without deals is an unexpected shape", async () => {
    for (const b of [{ a: 1 }, [{ id: U1 }], [null]]) {
      const { ctx } = ctxWith(() => ({ status: 200, body: b }));
      expect((await failure(svc.prices([U1], { country: "ES", shops: "all" }, ctx))).code).toBe("store.unexpected-response");
    }
  });
});

describe("key, errors and logs", () => {
  it("the key travels in the itad-api-key header and never in the URL, query or body", async () => {
    const { http, ctx } = ctxWith(() => ({ status: 200, body: [] }));
    await svc.search("zz", ctx);
    await svc.prices([U1], { country: "ES", shops: "all" }, ctx);
    for (const r of http.requests) {
      expect(sentHeaders(r)).toEqual({ "itad-api-key": KEY });
      expect(r.url).not.toContain(KEY);
      expect(JSON.stringify({ ...r, headers: undefined })).not.toContain(KEY);
      expect(JSON.stringify(r)).not.toContain(KEY); // Secret serialises as [redacted]
    }
  });
  it("without a stored key: auth.required and no request", async () => {
    const { http, ctx } = ctxWith(() => ({ status: 200 }), {});
    expect((await failure(svc.search("zz", ctx))).code).toBe("auth.required");
    expect(http.requests).toHaveLength(0);
  });
  it.each([
    [401, "auth.invalid", "invalid"],
    [403, "auth.invalid", "invalid"],
    [429, "store.rate-limited", "rateLimited"],
    [500, "network.unavailable", "unavailable"],
    [503, "network.unavailable", "unavailable"],
    [404, "store.unexpected-response", "unexpected"],
  ])("status %i -> %s with connectors.itad.errors.%s, fixed message, no cause", async (status, code, key) => {
    const { ctx } = ctxWith(() => ({ status, body: `secret-looking ${KEY} body` }));
    const e = await failure(svc.search("zz", ctx));
    expect([e.code, e.details.messageKey]).toEqual([code, `connectors.itad.errors.${key}`]);
    expect(e.message).not.toContain(KEY);
    expect(e.message).not.toContain("body");
    expect(e.details.cause).toBeUndefined();
  });
  it("429 carries retryAfterMs from Retry-After (any case) and none without it or with a date", async () => {
    const run = async (headers?: Record<string, string>) =>
      (await failure(svc.search("zz", ctxWith(() => ({ status: 429, ...(headers ? { headers } : {}) })).ctx))).details.retryAfterMs;
    expect(await run({ "Retry-After": "120" })).toBe(120_000);
    expect(await run({ "retry-after": "5" })).toBe(5_000);
    expect(await run()).toBeUndefined();
    expect(await run({ "retry-after": "Wed, 21 Oct 2026 07:28:00 GMT" })).toBeUndefined();
  });
  it("a body that is not JSON is unexpected and its text is not in the error", async () => {
    const { ctx } = ctxWith(() => ({ status: 200, body: `<html>${KEY}` }));
    const e = await failure(svc.search("zz", ctx));
    expect(e.code).toBe("store.unexpected-response");
    expect(e.message).not.toContain(KEY);
    expect(e.message).not.toContain("html");
  });
  it("a transport failure keeps its own error", async () => {
    const http = fakeHttp(() => { throw new ConnectorError("network.timeout", "slow"); }, HOSTS);
    expect((await failure(svc.search("zz", syncContext({ http, secrets: { apiKey: KEY } })))).code).toBe("network.timeout");
  });
  it("logs only counters", async () => {
    const { ctx } = ctxWith((url) => ({ status: 200, body: url.includes("prices") ? [priced] : url.includes("search") ? [{ id: U1, title: "Secret Title", type: "game" }] : { "Secret Title": U1, "app/220": U1 } }));
    await svc.lookupByStore("steam", ["220"], ctx);
    await svc.lookupByTitle(["Secret Title"], ctx);
    await svc.search("Secret Title", ctx);
    await svc.prices([U1], { country: "ES", shops: "all" }, ctx);
    const logs = JSON.stringify(ctx.logs);
    expect(logs).not.toMatch(new RegExp(`${KEY}|Secret Title|${U1}|220|isthereanydeal`));
    expect(ctx.logs.length).toBe(4);
  });
});

describe("wizard", () => {
  const wiz = svc.connection;
  const fields = (apiKey: string) => ({ kind: "fields", values: { apiKey } }) as const;
  const wctx = (handler: () => Answer) => wizardContext({ http: fakeHttp(handler, HOSTS) });

  it("walks info -> open-external with a secret field -> done, leaving the key in wizardState only", async () => {
    const ctx = wctx(() => ({ status: 200, body: { "app/220": null } }));
    const intro = await wiz.start(ctx);
    expect(intro).toMatchObject({ kind: "info", id: "intro" });
    const step = await wiz.submit(ctx, "intro", { kind: "continue" });
    expect(step).toMatchObject({
      kind: "open-external",
      id: "apikey",
      url: "https://isthereanydeal.com/apps/my/",
      awaits: "input",
      fields: [{ name: "apiKey", secret: true, paste: true }],
    });
    expect(new URL((step as { url: string }).url).hostname).toBe(svc.authHosts[0]);
    const pattern = new RegExp((step as unknown as { fields: { pattern: string }[] }).fields[0]!.pattern);
    expect(pattern.test(KEY)).toBe(true);

    expect(await wiz.submit(ctx, "apikey", fields(` ${KEY}\n`))).toEqual({ kind: "done" });
    expect(ctx.wizardState.values.get("apiKey")).toBe(KEY);
    expect(ctx.secrets.sets).toEqual([]); // the core stores it (ADR 86 point 15, A1)
    const http = ctx.http as ReturnType<typeof fakeHttp>;
    expect(http.requests).toHaveLength(1);
    expect(http.requests[0]!.url).toBe("https://api.isthereanydeal.com/lookup/id/shop/61/v1");
    expect(body(http.requests[0]!)).toEqual(["app/220"]);
    expect(sentHeaders(http.requests[0]!)).toEqual({ "itad-api-key": KEY });
    expect(JSON.stringify(ctx.logs)).not.toContain(KEY);
  });
  it("every step keeps its texts under connectors.itad. and keys exist in both catalogs", async () => {
    const ctx = wctx(() => ({ status: 200 }));
    for (const s of [await wiz.start(ctx), await wiz.submit(ctx, "intro", { kind: "continue" })]) {
      for (const key of [(s as { titleKey: string }).titleKey, (s as { bodyKey: string }).bodyKey]) {
        expect(key in en && key in es, key).toBe(true);
      }
    }
    expect("connectors.itad.apikey.field" in en).toBe(true);
  });
  it("the intro tells what is sent and that links pass through the service (point 6, B3, M1)", () => {
    for (const cat of [en, es]) {
      expect(cat["connectors.itad.intro.body"]).toMatch(/Steam/);
      expect(cat["connectors.itad.intro.body"]).toMatch(/GOG/);
    }
  });
  it("a key with a bad format is rejected before any call", async () => {
    const ctx = wctx(() => ({ status: 200 }));
    for (const bad of ["", "short", "a b".repeat(10), "x".repeat(129), "key/with/slash/0123456789"]) {
      const e = await failure(wiz.submit(ctx, "apikey", fields(bad)));
      expect([e.code, e.details.messageKey]).toEqual(["auth.invalid", "connectors.itad.errors.format"]);
    }
    expect((ctx.http as ReturnType<typeof fakeHttp>).requests).toHaveLength(0);
  });
  it.each([401, 403])("a %i on the check is auth.invalid and the state stays empty", async (status) => {
    const ctx = wctx(() => ({ status }));
    const e = await failure(wiz.submit(ctx, "apikey", fields(KEY)));
    expect([e.code, e.details.messageKey]).toEqual(["auth.invalid", "connectors.itad.errors.invalid"]);
    expect(ctx.wizardState.values.size).toBe(0);
    expect(ctx.secrets.values.size).toBe(0);
  });
  it("429 and 5xx on the check keep their codes", async () => {
    expect((await failure(wiz.submit(wctx(() => ({ status: 429, headers: { "retry-after": "3" } })), "apikey", fields(KEY)))).details.retryAfterMs).toBe(3000);
    expect((await failure(wiz.submit(wctx(() => ({ status: 502 })), "apikey", fields(KEY)))).code).toBe("network.unavailable");
  });
  it("unexpected input or step is 'internal'; status reads the vault; disconnect does nothing", async () => {
    const ctx = wctx(() => ({ status: 200 }));
    for (const [step, input] of [["intro", fields(KEY)], ["apikey", { kind: "continue" }], ["nope", { kind: "continue" }]] as const) {
      expect((await failure(wiz.submit(ctx, step, input))).code).toBe("internal");
    }
    expect(await wiz.status(wizardContext({ secrets: { apiKey: KEY } }))).toEqual({ state: "connected" });
    expect(await wiz.status(wizardContext())).toEqual({ state: "disconnected" });
    const keep = wizardContext({ secrets: { apiKey: KEY } });
    await wiz.disconnect(keep);
    expect(keep.secrets.values.size).toBe(1);
  });
});
