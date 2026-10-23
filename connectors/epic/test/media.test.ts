import { fakeHttp, mediaContext, sentForm, sentHeaders } from "@ludiary/connector-testkit";
import { describe, expect, it } from "vitest";
import { createEpicConnector, resolveEpicMedia } from "../src";
import { basicAuth, EPIC_CLIENT_ID, EPIC_CLIENT_SECRET } from "../src/auth";
import { APP, APP_TOKEN, CAT, ID, NS, readJson } from "./helpers";

const catalog = readJson("catalog", "bulk-items.json") as Record<string, unknown>;
const HOSTS = ["account-public-service-prod03.ol.epicgames.com", "catalog-public-service-prod06.ol.epicgames.com"];
type Answer = { status: number; body?: unknown; headers?: Record<string, string> };
const tokenOk: Answer = { status: 200, body: { access_token: APP_TOKEN, token_type: "bearer", expires_in: 14400 } };

function epic(o: { token?: Answer; catalog?: Answer | ((url: URL) => Answer | Promise<Answer>) } = {}) {
  return fakeHttp(async (r) => {
    if (r.url.includes("/oauth/token")) return o.token ?? tokenOk;
    const cat = o.catalog ?? { status: 200, body: catalog };
    return typeof cat === "function" ? cat(new URL(r.url)) : cat;
  }, { hosts: HOSTS });
}
const run = (http: ReturnType<typeof epic>, ids: string[], locale = "en") => resolveEpicMedia(ids, mediaContext({ http, locale }));
const idN = (n: number, ns = NS) => `${ns}:${(0xa0000000 + n).toString(16).padStart(32, "0")}:G${n}`;

describe("resolveEpicMedia (ADR 78, point 5)", () => {
  it("is not wired in the manifest: the application token returns catalog stubs without images (E7, checked 22-10-2026)", () => {
    expect(createEpicConnector().resolveMedia).toBeUndefined();
  });
  it("application token with the exact form and basic header, then one catalog request per namespace with repeated id", async () => {
    const http = epic();
    const second = `${NS}:00000000000000000000000000000004:Other01`;
    const m = await run(http, [ID, second], "es");
    const [token, cat] = http.requests;
    expect(token).toMatchObject({ method: "POST", url: "https://account-public-service-prod03.ol.epicgames.com/account/api/oauth/token" });
    expect(sentForm(token!)).toEqual({ grant_type: "client_credentials", token_type: "eg1" });
    expect(sentHeaders(token!)["authorization"]).toBe("basic " + btoa(`${EPIC_CLIENT_ID}:${EPIC_CLIENT_SECRET}`));
    expect(basicAuth().reveal()).toBe(sentHeaders(token!)["authorization"]);
    expect(http.requests).toHaveLength(2);
    const u = new URL(cat!.url);
    expect(u.pathname).toBe(`/catalog/api/shared/namespace/${NS}/bulk/items`);
    expect(u.searchParams.getAll("id")).toEqual([CAT, "00000000000000000000000000000004"]);
    expect(Object.fromEntries(u.searchParams)).toMatchObject({ includeDLCDetails: "false", includeMainGameDetails: "true", country: "US", locale: "es" });
    expect(sentHeaders(cat!)["authorization"]).toBe(`bearer ${APP_TOKEN}`);
    expect(m.get(ID)).toEqual({
      coverUrl: `https://cdn1.epicgames.com/offer/${NS}/test-cover_1200x1600-0000`,
      heroUrl: "https://cdn2.unrealengine.com/test-hero_2560x1440-0000",
    });
    expect(m.has(second)).toBe(false);
  });
  it("falls back to OfferImageTall / OfferImageWide; omits other hosts, http and credentials, logging only the host", async () => {
    const img = (type: string, url: string) => ({ type, url });
    const entry = (keyImages: unknown[]) => ({ status: 200, body: { [CAT]: { keyImages } } });
    const ok = await run(epic({ catalog: entry([img("OfferImageTall", "https://cdn1.epicgames.com/t"), img("OfferImageWide", "https://cdn1.epicgames.com/w")]) }), [ID]);
    expect(ok.get(ID)).toEqual({ coverUrl: "https://cdn1.epicgames.com/t", heroUrl: "https://cdn1.epicgames.com/w" });
    const ctx = mediaContext({ http: epic({ catalog: entry([img("DieselGameBoxTall", "https://evil.example/x.jpg?token=SECRETISH"), img("OfferImageTall", "http://cdn1.epicgames.com/t"), img("DieselGameBox", "https://u:p@cdn1.epicgames.com/h")]) }) });
    expect((await resolveEpicMedia([ID], ctx)).size).toBe(0);
    expect(JSON.stringify(ctx.logs)).toContain("evil.example");
    expect(JSON.stringify(ctx.logs)).not.toContain("SECRETISH");
  });
  it("a long URL is omitted", async () => {
    const m = await run(epic({ catalog: { status: 200, body: { [CAT]: { keyImages: [{ type: "DieselGameBoxTall", url: "https://cdn1.epicgames.com/" + "a".repeat(2100) }] } } } }), [ID]);
    expect(m.size).toBe(0);
  });
  it("404 of a namespace leaves its ids out; an id that does not come back is out", async () => {
    expect((await run(epic({ catalog: { status: 404 } }), [ID])).size).toBe(0);
    expect((await run(epic({ catalog: { status: 200, body: {} } }), [ID])).size).toBe(0);
  });
  it("token: 400, 401, 403 and 500 are unexpected; 429 is rate-limited", async () => {
    for (const status of [400, 401, 403, 500]) await expect(run(epic({ token: { status } }), [ID])).rejects.toMatchObject({ code: "store.unexpected-response" });
    await expect(run(epic({ token: { status: 429, headers: { "Retry-After": "30" } } }), [ID])).rejects.toMatchObject({ code: "store.rate-limited", details: { retryAfterMs: 30000 } });
  });
  it("catalog: 500 and a body that is not an object throw; 429 stops at once", async () => {
    await expect(run(epic({ catalog: { status: 500 } }), [ID])).rejects.toMatchObject({ code: "store.unexpected-response" });
    await expect(run(epic({ catalog: { status: 200, body: [1] } }), [ID])).rejects.toMatchObject({ code: "store.unexpected-response" });
    await expect(run(epic({ catalog: { status: 429 } }), [ID])).rejects.toMatchObject({ code: "store.rate-limited" });
  });
  it("invalid ids are dropped before any request, token included", async () => {
    const http = epic();
    await run(http, ["", "../x", `${NS}:${CAT}`, `${NS}:${CAT}:a b`, `${NS}:00000000000000000000000000000A01:${APP}`]);
    expect(http.requests).toEqual([]);
  });
  it("50 ids per request; never more than 6 in flight", async () => {
    let now = 0;
    let max = 0;
    const http = epic({
      catalog: async () => {
        max = Math.max(max, ++now);
        await new Promise((r) => setTimeout(r, 5));
        now--;
        return { status: 404 };
      },
    });
    await run(http, [...Array.from({ length: 120 }, (_, i) => idN(i)), ...Array.from({ length: 30 }, (_, i) => idN(i, "000000000000000000000000000000b2"))]);
    const catalogReqs = http.requests.filter((r) => r.url.includes("/bulk/items"));
    expect(catalogReqs.map((r) => new URL(r.url).searchParams.getAll("id").length).sort((a, b) => a - b)).toEqual([20, 30, 50, 50]);
    expect(max).toBeLessThanOrEqual(6);
  });
  it("after a 429 no new request starts and the call does not wait for slow in-flight ones", async () => {
    let n = 0;
    const http = epic({
      catalog: async () => {
        if (n++ === 0) return { status: 429 };
        await new Promise((r) => setTimeout(r, 2000));
        return { status: 404 };
      },
    });
    const ids = Array.from({ length: 20 }, (_, i) => idN(i, `0000000000000000000000000000${String(i).padStart(2, "0")}b3`));
    const t = Date.now();
    await expect(run(http, ids)).rejects.toMatchObject({ code: "store.rate-limited" });
    expect(Date.now() - t).toBeLessThan(1000);
    expect(http.requests.filter((r) => r.url.includes("/bulk/items"))).toHaveLength(6);
  });
  it("the application token never appears in the log or in an error", async () => {
    const ctx = mediaContext({ http: epic({ catalog: { status: 500 } }) });
    const e = await resolveEpicMedia([ID], ctx).then(() => null, (x: unknown) => x);
    expect(String(e) + JSON.stringify(ctx.logs)).not.toContain(APP_TOKEN);
    expect(String(e)).not.toContain(APP);
  });
});
