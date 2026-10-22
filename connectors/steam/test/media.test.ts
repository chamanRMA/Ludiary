import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fakeHttp, mediaContext } from "@ludiary/connector-testkit";
import { ConnectorError } from "@ludiary/contracts";
import { describe, expect, it } from "vitest";
import { createSteamConnector, resolveSteamMedia } from "../src";
import { FIXTURES } from "./helpers";

const recorded = JSON.parse(readFileSync(join(FIXTURES, "getitems", "getitems-english.json"), "utf8")) as {
  response: { store_items: Record<string, unknown>[] };
};
const IDS = ["620", "3450310", "2062430", "228980"];
const CDN = "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps";

const ok = (body: unknown) => fakeHttp(() => ({ status: 200, body }));
const item = (appid: number, assets: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({
  success: 1,
  appid,
  assets: { asset_url_format: `steam/apps/${appid}/\${FILENAME}?t=1`, ...assets },
  ...extra,
});
const wrap = (...items: unknown[]) => ({ response: { store_items: items } });
const run = (http: ReturnType<typeof fakeHttp>, ids = IDS, locale = "en") =>
  resolveSteamMedia(ids, mediaContext({ http, locale }));

describe("resolveSteamMedia (ADR 73)", () => {
  it("builds hashed and unhashed URLs from recorded answers and ignores success 15", async () => {
    const m = await run(ok(recorded));
    expect([...m.keys()]).toEqual(["620", "3450310", "2062430"]);
    expect(m.get("620")?.coverUrl).toBe(`${CDN}/620/library_600x900.jpg?t=1790187113`);
    expect(m.get("3450310")?.coverUrl).toBe(
      `${CDN}/3450310/478711aff6212e85a15c2228d14710f129946363/library_600x900.jpg?t=1790859917`,
    );
    expect(m.get("2062430")?.coverUrl).toMatch(/\/2062430\/b6cabe19[0-9a-f]{32}\/library_600x900\.jpg\?t=\d+$/);
    expect(m.get("2062430")?.heroUrl).toMatch(/\/2062430\/[0-9a-f]{40}\/header\.jpg\?t=\d+$/);
    expect(m.has("228980")).toBe(false);
  });

  it("sends exactly one GET with the requested ids, include_assets and the language of the locale", async () => {
    for (const [locale, language] of [["es-ES", "spanish"], ["en", "english"], ["fr", "english"]] as const) {
      const http = ok(recorded);
      await run(http, IDS, locale);
      expect(http.requests).toHaveLength(1);
      const r = http.requests[0]!;
      expect(r.method).toBe("GET");
      expect(r.url).toBe("https://api.steampowered.com/IStoreBrowseService/GetItems/v1/");
      expect(Object.keys(r.query ?? {})).toEqual(["input_json"]);
      expect(r.headers).toBeUndefined();
      expect(JSON.parse(String(r.query?.["input_json"]))).toEqual({
        ids: IDS.map((id) => ({ appid: Number(id) })),
        context: { language, country_code: "US" },
        data_request: { include_assets: true },
      });
    }
  });

  it("does not call the network for ids that are not AppIDs", async () => {
    const http = ok(recorded);
    expect((await run(http, ["", "12 34", "../x", "1;calc"])).size).toBe(0);
    expect(http.requests).toHaveLength(0);
  });

  it("skips elements that do not pass validation without dropping the rest", async () => {
    const good = item(620, { library_capsule: "library_600x900.jpg" });
    const body = wrap(
      good,
      { ...item(3450310, { library_capsule: "x.jpg" }), assets: { asset_url_format: "steam/apps/999/${FILENAME}", library_capsule: "a.jpg" } },
      item(2062430, { library_capsule: "../library_600x900.jpg", header: "a/b/header.jpg" }),
      item(228980, { library_capsule: "x.png", header: "https://evil.example/h.jpg" }),
      item(1, { library_capsule: "a.jpg" }), // not requested
      item(10, { library_capsule: "//evil.example/a.jpg", header: "AAAA/header.jpg" }),
      { ...item(20, { library_capsule: "a.jpg" }), success: 15 },
      { ...item(30, { library_capsule: "a.jpg" }), assets: { asset_url_format: "steam/apps/30/${FILENAME}?t=abc", library_capsule: "a.jpg" } },
      "junk",
      null,
    );
    const m = await run(ok(body), ["620", "3450310", "2062430", "228980", "10", "20", "30"]);
    expect([...m.keys()]).toEqual(["620"]);
  });

  it("keeps only the valid field of an element", async () => {
    const m = await run(ok(wrap(item(620, { library_capsule: "../x.jpg", header: "header.jpg" }))), ["620"]);
    expect(m.get("620")).toEqual({ heroUrl: `${CDN}/620/header.jpg?t=1` });
  });

  it("429 is store.rate-limited with retryAfterMs from Retry-After", async () => {
    const http = fakeHttp(() => ({ status: 429, headers: { "Retry-After": "120" } }));
    const e = await run(http).catch((x: unknown) => x);
    expect(e).toBeInstanceOf(ConnectorError);
    expect((e as ConnectorError).code).toBe("store.rate-limited");
    expect((e as ConnectorError).details.retryAfterMs).toBe(120_000);
    const none = await run(fakeHttp(() => ({ status: 429 }))).catch((x: unknown) => x);
    expect((none as ConnectorError).details.retryAfterMs).toBeUndefined();
  });

  it.each([
    ["500", { status: 500, body: "boom" }],
    ["not JSON", { status: 200, body: "<html>" }],
    ["JSON without store_items", { status: 200, body: { response: {} } }],
    ["JSON that is not an object", { status: 200, body: [] }],
  ])("%s is store.unexpected-response", async (_n, answer) => {
    const e = await run(fakeHttp(() => answer)).catch((x: unknown) => x);
    expect((e as ConnectorError).code).toBe("store.unexpected-response");
  });

  it("does not leak the query to the log", async () => {
    const ctx = mediaContext({ http: ok(recorded) });
    await resolveSteamMedia(IDS, ctx);
    expect(JSON.stringify(ctx.logs)).not.toMatch(/620|input_json|appid/);
  });

  it("is declared in the manifest with apiHosts", () => {
    const c = createSteamConnector();
    expect(c.apiHosts).toEqual(["api.steampowered.com", "steamcommunity.com"]);
    expect(c.resolveMedia).toBe(resolveSteamMedia);
  });
});
