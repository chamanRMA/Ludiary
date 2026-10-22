import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { fakeHttp, mediaContext } from "@ludiary/connector-testkit";
import { describe, expect, it } from "vitest";
import { createGogConnector } from "../src";

const c = createGogConnector();
const recorded: unknown = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "fixtures", "gamesdb", "external-release-1207658695.json"), "utf8"),
);
const H = "a".repeat(64);
const fmt = (h = H) => ({ url_format: `https://images.gog.com/${h}{formatter}.{ext}?namespace=gamesdb` });
const run = (http: ReturnType<typeof fakeHttp>, ids: string[]) => c.resolveMedia!(ids, mediaContext({ http }));

describe("resolveMedia (ADR 76)", () => {
  it("builds both URLs from the recorded answer, with exact host and path", async () => {
    const http = fakeHttp(() => ({ status: 200, body: recorded }), { hosts: ["gamesdb.gog.com"] });
    const m = await run(http, ["1207658695"]);
    expect(http.requests).toHaveLength(1);
    expect(http.requests[0]).toMatchObject({ method: "GET", url: "https://gamesdb.gog.com/platforms/gog/external_releases/1207658695" });
    expect(m.get("1207658695")).toEqual({
      coverUrl: "https://images.gog.com/cfa2550bbfd27506a0b5099423aab3cc0cbfb1ae2edcef4d32a6faa38e7721a6.jpg?namespace=gamesdb",
      heroUrl: "https://images.gog.com/2ddb74da4bb18466ea716abfa56674d48858483f6a07e94f16792b4304e16b0c.jpg?namespace=gamesdb",
    });
  });
  it("omits null cover and malformed formats", async () => {
    const cases: [unknown, unknown][] = [
      [null, fmt()],
      [{ url_format: `https://evil.example/${H}{formatter}.{ext}` }, fmt()],
      [fmt("abc"), fmt()],
      [{ url_format: `https://images.gog.com/${H}.jpg` }, fmt()],
    ];
    for (const [cover, bg] of cases) {
      const m = await run(fakeHttp(() => ({ status: 200, body: { game: { vertical_cover: cover, background: bg } } })), ["1"]);
      expect(m.get("1")?.coverUrl).toBeUndefined();
      expect(m.get("1")?.heroUrl).toBe(`https://images.gog.com/${H}.jpg?namespace=gamesdb`);
    }
  });
  it("404 leaves the id out of the map", async () => {
    expect((await run(fakeHttp(() => ({ status: 404 })), ["1000000001"])).size).toBe(0);
  });
  it("429 throws store.rate-limited with Retry-After", async () => {
    await expect(run(fakeHttp(() => ({ status: 429, headers: { "Retry-After": "30" } })), ["1"])).rejects.toMatchObject({
      code: "store.rate-limited",
      details: { retryAfterMs: 30000 },
    });
  });
  it("500, non-JSON and JSON without game throw", async () => {
    for (const a of [{ status: 500 }, { status: 200, body: "<html>" }, { status: 200, body: { x: 1 } }]) {
      await expect(run(fakeHttp(() => a), ["1"])).rejects.toMatchObject({ code: "store.unexpected-response" });
    }
  });
  it("never has more than 6 requests in flight", async () => {
    let now = 0;
    let max = 0;
    const http = fakeHttp(async () => {
      max = Math.max(max, ++now);
      await new Promise((r) => setTimeout(r, 5));
      now--;
      return { status: 404 };
    });
    await run(http, Array.from({ length: 30 }, (_, i) => String(i + 1)));
    expect(http.requests).toHaveLength(30);
    expect(max).toBe(6);
  });
  it("invalid ids never reach the URL", async () => {
    const http = fakeHttp(() => ({ status: 404 }));
    await run(http, ["", "../x", "1/2", "1?x", "abc", "1".repeat(21), "１２"]);
    expect(http.requests).toEqual([]);
  });
  it("after a 429 no new request starts and the call does not wait for slow in-flight ones", async () => {
    const http = fakeHttp(async (req) => {
      if (req.url.endsWith("/1")) return { status: 429 };
      await new Promise((r) => setTimeout(r, 2000));
      return { status: 404 };
    });
    const t = Date.now();
    await expect(run(http, Array.from({ length: 20 }, (_, i) => String(i + 1)))).rejects.toMatchObject({ code: "store.rate-limited" });
    expect(Date.now() - t).toBeLessThan(1000);
    expect(http.requests).toHaveLength(6);
  });
});
