import { ConnectorError, type EntryMedia, type StoreConnector } from "@ludiary/contracts";
import { describe, expect, it, vi } from "vitest";
import { validateMedia } from "../src/validate";
import { addUserRoot, entry, harness, makeConnector, scanNow, type Harness } from "./helpers";

const LIB = "D:/Games";
const CDN = "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps";
const DAY = 24 * 3_600_000;
const fakeClient = { request: async () => ({ status: 200, headers: {}, json: async () => null, text: async () => "" }) };
const http = vi.fn((..._a: unknown[]) => fakeClient);

type Resolve = NonNullable<StoreConnector["resolveMedia"]>;
const cover = (id: string): EntryMedia => ({ coverUrl: `${CDN}/${id}/library_600x900.jpg` });

async function setup(
  resolve: Resolve,
  ids: () => string[] = () => ["10", "20"],
  over: { withHttp?: boolean; withResolve?: boolean; id?: "steam" | "gog" } = {},
) {
  const withResolve = over.withResolve !== false;
  const h = await harness({
    dirs: [LIB],
    connectors: [
      makeConnector({
        id: over.id ?? "steam",
        scan: async () => ({ entries: ids().map((i) => entry(i, `Game ${i}`, `${LIB}/${i}`)), unreadableRoots: [] }),
        ...(withResolve ? { resolveMedia: resolve } : {}),
      }),
    ],
    ...(over.withHttp === false ? {} : { http: http as never }),
  });
  addUserRoot(h, LIB);
  return h;
}
const rescan = async (h: Harness, ms = 120_000) => {
  h.clock.time += ms;
  await scanNow(h);
};
const syncOf = (h: Harness) => h.store.sync.get("steam:scan")!;

describe("media step (ADR 73)", () => {
  it("resolves the pending properties once, builds the client with the connector's apiHosts and marks missing ids as empty", async () => {
    http.mockClear();
    const resolve = vi.fn<Resolve>(async (ids) => new Map([[ids[0]!, cover(ids[0]!)]]));
    const h = await setup(resolve);
    await scanNow(h);
    expect(resolve).toHaveBeenCalledTimes(1);
    expect(resolve.mock.calls[0]![0]).toEqual(["10", "20"]);
    expect(http.mock.calls[0]![0]).toEqual(["api.example.com"]);
    expect(h.store.resolved.get("10")?.media).toEqual(cover("10"));
    expect(h.store.resolved.get("20")?.media).toEqual({});
    await rescan(h);
    expect(resolve).toHaveBeenCalledTimes(1); // nothing pending
  });

  it("the scan stays 'running' during the step and ends 'idle' with its success time", async () => {
    let during: string | undefined;
    const h: Harness = await setup(async () => {
      during = syncOf(h).status;
      return new Map();
    });
    await scanNow(h);
    expect(during).toBe("running");
    expect(syncOf(h)).toMatchObject({ status: "idle", error: null });
    expect(syncOf(h).lastSuccessAt).not.toBeNull();
  });

  it("uses batches of 50 and at most 20 batches per run; the rest waits for the next run", async () => {
    const all = Array.from({ length: 1100 }, (_, i) => String(i + 1));
    const resolve = vi.fn<Resolve>(async () => new Map());
    const h = await setup(resolve, () => all);
    await scanNow(h);
    expect(resolve).toHaveBeenCalledTimes(20);
    expect(resolve.mock.calls.every((c) => c[0].length === 50)).toBe(true);
    await rescan(h);
    expect(resolve).toHaveBeenCalledTimes(22); // 100 left: 2 more batches
    expect(resolve.mock.calls[21]![0]).toHaveLength(50);
  });

  it("asks again after 30 days", async () => {
    const resolve = vi.fn<Resolve>(async () => new Map());
    const h = await setup(resolve);
    await scanNow(h);
    await rescan(h, 29 * DAY);
    expect(resolve).toHaveBeenCalledTimes(1);
    await rescan(h, 2 * DAY);
    expect(resolve).toHaveBeenCalledTimes(2);
  });

  it("after a failure waits minSyncIntervalMs, or retryAfterMs when it is longer; the scan result does not change", async () => {
    let fail: ConnectorError | null = new ConnectorError("store.rate-limited", "429", { retryAfterMs: 3_600_000 });
    const resolve = vi.fn<Resolve>(async () => {
      if (fail) throw fail;
      return new Map();
    });
    const h = await setup(resolve);
    await scanNow(h);
    expect(resolve).toHaveBeenCalledTimes(1);
    expect(syncOf(h)).toMatchObject({ status: "idle", error: null });
    expect(h.logs.some((l) => l.startsWith("warn: Media step failed") && l.includes("store.rate-limited"))).toBe(true);
    await rescan(h, 1_200_000); // past minSyncIntervalMs (10 min) but before Retry-After (1 h)
    expect(resolve).toHaveBeenCalledTimes(1);
    fail = null;
    await rescan(h, 3_000_000);
    expect(resolve).toHaveBeenCalledTimes(2);
  });

  it("caps an absurd Retry-After at one day", async () => {
    let fail = true;
    const resolve = vi.fn<Resolve>(async () => {
      if (fail) throw new ConnectorError("store.rate-limited", "429", { retryAfterMs: 999_999_000 });
      return new Map();
    });
    const h = await setup(resolve);
    await scanNow(h);
    fail = false;
    await rescan(h, 24 * 3_600_000 + 1_000); // just past one day, far before the 11.6 days asked for
    expect(resolve).toHaveBeenCalledTimes(2);
  });

  it("after a failure without Retry-After waits 10 minutes", async () => {
    let fail = true;
    const resolve = vi.fn<Resolve>(async () => {
      if (fail) throw new ConnectorError("network.unavailable", "down");
      return new Map();
    });
    const h = await setup(resolve);
    await scanNow(h);
    await rescan(h, 300_000);
    expect(resolve).toHaveBeenCalledTimes(1);
    fail = false;
    await rescan(h, 400_000);
    expect(resolve).toHaveBeenCalledTimes(2);
    expect(h.store.resolved.size).toBe(2);
  });

  it("discards media outside mediaHosts, bad URLs and ids that were not requested", async () => {
    const h = await setup(async () => {
      return new Map<string, EntryMedia>([
        ["10", { coverUrl: "https://evil.example/a.jpg", heroUrl: `${CDN}/10/header.jpg` }],
        ["20", { coverUrl: "http://shared.akamai.steamstatic.com/a.jpg" }],
        ["999", cover("999")],
      ]);
    });
    await scanNow(h);
    expect(h.store.resolved.get("10")?.media).toEqual({ heroUrl: `${CDN}/10/header.jpg` });
    expect(h.store.resolved.get("20")?.media).toEqual({});
    expect(h.store.resolved.has("999")).toBe(false);
  });

  it("a result that is not a Map counts as a failure", async () => {
    const h = await setup((async () => ({})) as unknown as Resolve);
    await scanNow(h);
    expect(h.store.resolved.size).toBe(0);
    expect(syncOf(h).status).toBe("idle");
  });

  it("does nothing without http or without resolveMedia", async () => {
    const resolve = vi.fn<Resolve>(async () => new Map());
    const noHttp = await setup(resolve, undefined, { withHttp: false });
    await scanNow(noHttp);
    const noResolve = await setup(resolve, undefined, { withResolve: false });
    await scanNow(noResolve);
    expect(resolve).not.toHaveBeenCalled();
    expect(syncOf(noHttp).status).toBe("idle");
  });
});

describe("validateMedia port (ADR 86 point 18)", () => {
  it("drops a URL with a port, for the price service and for a connector host alike, and keeps the same URL without one", () => {
    const hosts = ["assets.isthereanydeal.com", "shared.akamai.steamstatic.com"];
    expect(validateMedia({ coverUrl: "https://assets.isthereanydeal.com:8443/a.jpg", heroUrl: "https://shared.akamai.steamstatic.com:444/h.jpg" }, hosts)).toBeUndefined();
    expect(validateMedia({ coverUrl: "https://assets.isthereanydeal.com:443/a.jpg", heroUrl: "https://shared.akamai.steamstatic.com/h.jpg" }, hosts)).toEqual({ coverUrl: "https://assets.isthereanydeal.com/a.jpg", heroUrl: "https://shared.akamai.steamstatic.com/h.jpg" });
  });

  it("drops a URL that passes 2048 characters only once percent-encoded, so the stored value fits its CHECK", () => {
    const base = "https://assets.isthereanydeal.com/";
    const long = base + "é".repeat(2040 - base.length);
    expect(long.length).toBeLessThanOrEqual(2048);
    expect(validateMedia({ coverUrl: long }, ["assets.isthereanydeal.com"])).toBeUndefined();
  });
});
