// Titles step (ADR 84, points 5 and 10): DLC titles through resolveTitles, sharing the wait with covers.
import { checkConnectorManifest, ConnectorError, type EntryMedia, type StoreConnector } from "@ludiary/contracts";
import { describe, expect, it, vi } from "vitest";
import { addUserRoot, entry, harness, makeConnector, scanNow, type Harness } from "./helpers";

const LIB = "D:/Games";
const DAY = 24 * 3_600_000;
const fakeClient = { request: async () => ({ status: 200, headers: {}, json: async () => null, text: async () => "" }) };
const http = vi.fn((..._a: unknown[]) => fakeClient);

type Titles = NonNullable<StoreConnector["resolveTitles"]>;
type Media = NonNullable<StoreConnector["resolveMedia"]>;

async function setup(resolveTitles: Titles, resolveMedia?: Media, dlcIds: () => string[] = () => ["11", "12"]) {
  const h = await harness({
    dirs: [LIB],
    connectors: [
      makeConnector({
        caps: { dlc: "scan" },
        scan: async () => ({
          entries: [
            entry("10", "Game 10", `${LIB}/10`),
            ...dlcIds().map((i) => entry(i, `Steam ${i}`, `${LIB}/10`, { kind: "dlc", baseStoreGameId: "10" })),
          ],
          unreadableRoots: [],
        }),
        resolveTitles,
        ...(resolveMedia ? { resolveMedia } : {}),
      }),
    ],
    http: http as never,
  });
  addUserRoot(h, LIB);
  return h;
}
const rescan = async (h: Harness, ms = 120_000) => {
  h.clock.time += ms;
  await scanNow(h);
};

describe("titles step (ADR 84)", () => {
  it("asks only for DLC, keeps the previous title when the answer is invalid and still stamps the attempt", async () => {
    let answer: unknown = new Map([["11", "  Soundtrack\u0000 "], ["12", "x".repeat(301)]]);
    const resolve = vi.fn<Titles>(async () => answer as never);
    const h = await setup(resolve);
    await scanNow(h);
    expect(resolve).toHaveBeenCalledTimes(1);
    expect(resolve.mock.calls[0]![0]).toEqual(["11", "12"]); // never the game "10"
    expect(h.store.titles.get("11")?.title).toBe("Soundtrack");
    expect(h.store.titles.get("12")).toMatchObject({ at: expect.any(Number) });
    expect(h.store.titles.get("12")?.title).toBeUndefined();
    answer = new Map([["11", "   "]]);
    await rescan(h, 31 * DAY);
    expect(resolve).toHaveBeenCalledTimes(2);
    expect(h.store.titles.get("11")?.title).toBe("Soundtrack"); // a bad title does not wipe a good one
  });

  it("filters the answer like covers: ids not requested and non-text values are dropped", async () => {
    const h = await setup(async () => new Map<unknown, unknown>([["999", "Other"], [11, "Num"], ["11", 5], ["12", "Ok"]]) as never);
    await scanNow(h);
    expect([...h.store.titles].filter(([, v]) => v.title).map(([k]) => k)).toEqual(["12"]);
  });

  it("a result that is not a Map is a failure that never fails the scan", async () => {
    const h = await setup((async () => ({})) as unknown as Titles);
    await scanNow(h);
    expect(h.store.titles.size).toBe(0);
    expect(h.store.sync.get("steam:scan")).toMatchObject({ status: "idle", error: null });
    expect(h.logs.some((l) => l.startsWith("warn: Titles step failed"))).toBe(true);
    expect(h.logs.join("\n")).not.toContain("Steam 11");
  });

  it("a 429 on covers stops titles in that pass and the shared wait holds both; Retry-After is capped at a day", async () => {
    let fail = true;
    const media = vi.fn<Media>(async () => {
      if (fail) throw new ConnectorError("store.rate-limited", "429", { retryAfterMs: 999_999_000 });
      return new Map<string, EntryMedia>();
    });
    const titles = vi.fn<Titles>(async () => new Map());
    const h = await setup(titles, media);
    await scanNow(h);
    expect(titles).not.toHaveBeenCalled();
    fail = false;
    await rescan(h, 3_600_000);
    expect(media).toHaveBeenCalledTimes(1);
    await rescan(h, DAY);
    expect(media).toHaveBeenCalledTimes(2);
    expect(titles).toHaveBeenCalledTimes(1);
  });

  it("a 429 on titles also holds the covers", async () => {
    const media = vi.fn<Media>(async () => new Map());
    const titles = vi.fn<Titles>(async () => {
      throw new ConnectorError("store.rate-limited", "429", { retryAfterMs: 3_600_000 });
    });
    const h = await setup(titles, media);
    await scanNow(h);
    h.store.resolved.clear();
    await rescan(h, 1_200_000);
    expect(media).toHaveBeenCalledTimes(1);
    expect(titles).toHaveBeenCalledTimes(1);
  });

  it("uses batches of 50, at most 20 per run", async () => {
    const all = Array.from({ length: 1100 }, (_, i) => String(i + 100));
    const resolve = vi.fn<Titles>(async () => new Map());
    const h = await setup(resolve, undefined, () => all);
    await scanNow(h);
    expect(resolve).toHaveBeenCalledTimes(20);
  });
});

describe("checkConnectorManifest and resolveTitles (ADR 84)", () => {
  const titles: Titles = async () => new Map();
  it("accepts it with apiHosts and a dlc capability", () => {
    expect(checkConnectorManifest(makeConnector({ caps: { dlc: "scan" }, resolveTitles: titles }))).toEqual([]);
  });
  it("rejects it without apiHosts", () => {
    expect(checkConnectorManifest(makeConnector({ caps: { dlc: "scan" }, resolveTitles: titles, apiHosts: [] }))).toContain("resolveTitles requires apiHosts");
  });
  it("rejects it with dlc 'none'", () => {
    expect(checkConnectorManifest(makeConnector({ resolveTitles: titles }))).toContain("resolveTitles requires capabilities.dlc other than 'none'");
  });
});
