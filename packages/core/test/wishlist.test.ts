// Wishlist import (ADR 91 and its point 13) against fake connectors, a fake IsThereAnyDeal and an in-memory repository.
import { ConnectorError } from "@ludiary/contracts";
import type { ConnectionWizard, I18nKey, PriceService, StoreConnector, StoreId, SyncContext } from "@ludiary/contracts";
import { describe, expect, it } from "vitest";
import type { PriceWatchRecord } from "../src/model";
import { harness, makeConnector, memoryPrices, owned } from "./helpers";

const k = (s: string) => s as I18nKey;
const MIN = 60_000;
/** A UUID per number, as the service answers. */
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const wizard = { start: async () => ({ kind: "info" }), submit: async () => ({ kind: "done" }), status: async () => ({ state: "connected" }), disconnect: async () => undefined } as unknown as ConnectionWizard;

function deferred<T = void>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

interface Setup {
  ids?: string[] | (() => Promise<{ complete: boolean; entries: { storeGameId: string }[] }>);
  complete?: boolean;
  /** store id -> number of the service game; an id not listed is "not found". */
  found?: (id: string) => number | undefined;
  lookup?: (batch: readonly string[], call: number) => void | Promise<void>;
  describe?: (ids: readonly string[]) => Promise<ReadonlyMap<string, { title: string; media?: { coverUrl?: string } }>>;
  read?: () => Promise<{ complete: boolean; entries: { storeGameId: string }[] }>;
  id?: StoreId;
  library?: (ctx: SyncContext) => Promise<{ complete: boolean; entries: ReturnType<typeof owned>[] }>;
  itad?: "connected" | "invalid" | "none";
  watch?: PriceWatchRecord[];
}

async function setup(o: Setup = {}) {
  const mem = memoryPrices();
  mem.watch.push(...(o.watch ?? []));
  const calls = { read: 0, describe: [] as (readonly string[])[], lookups: [] as (readonly string[])[] };
  const store = o.id ?? "steam";
  const connector: StoreConnector = makeConnector({
    id: store,
    connection: wizard,
    caps: { library: Boolean(o.library) },
    ...(o.library ? { library: o.library } : {}),
    wishlist: {
      read:
        o.read ??
        (async () => {
          calls.read++;
          const ids = Array.isArray(o.ids) ? o.ids : [];
          return { complete: o.complete ?? true, entries: ids.map((storeGameId) => ({ storeGameId })) };
        }),
      describe:
        o.describe ??
        (async (ids) => {
          calls.describe.push(ids);
          return new Map(ids.map((id) => [id, { title: `Title ${id}`, media: { coverUrl: `https://shared.akamai.steamstatic.com/${id}.jpg` } }]));
        }),
    },
  });
  const svc: PriceService = {
    id: "itad",
    nameKey: k("connectors.itad.name"),
    apiHosts: ["api.example.com"],
    authHosts: ["itad.example.com"],
    linkHosts: ["itad.link"],
    mediaHosts: ["img.example.com"],
    connection: wizard,
    lookupByStore: async (_s, ids) => {
      calls.lookups.push(ids);
      await o.lookup?.(ids, calls.lookups.length);
      return new Map(ids.flatMap((id) => (o.found?.(id) !== undefined ? [[id, uuid(o.found(id)!)] as const] : [])));
    },
    lookupByTitle: async () => new Map(),
    search: async () => [],
    prices: async () => [],
  };
  const h = await harness({
    connectors: [connector],
    connected: [store],
    prices: mem.repo,
    priceServices: [svc],
    http: () => ({ request: async () => { throw new Error("no network"); } }),
  });
  if (o.itad !== "none") {
    await h.deps.secrets.put({ scope: "service:itad", name: "apiKey", ciphertext: h.deps.cipher.encrypt("KEY-0123456789abcdef", "user|service:itad|apiKey"), keyId: 1, updatedAt: 1 });
    if (o.itad === "invalid") h.store.kv.set("services.itad.status", "invalid");
  }
  return { h, mem, calls, store };
}

const rec = (id: string, sgid: number, origin: PriceWatchRecord["origin"] = "manual", osg: string | null = null): PriceWatchRecord => ({
  id, service: "itad", serviceGameId: uuid(sgid), title: `T ${id}`, type: null, addedAt: 1, origin, originStoreGameId: origin === "manual" ? null : (osg ?? id),
});
const everyone = (id: string) => Number(id);

describe("import (point 5)", () => {
  it("looks up only the new ids, describes only what it adds and counts the rest", async () => {
    const { h, mem, calls } = await setup({ ids: ["1", "2", "3", "4"], found: (id) => (id === "4" ? undefined : Number(id) * 10), watch: [rec("old", 10, "steam", "1")] });
    const res = await h.core.importWishlist("steam");
    expect(res).toEqual({ added: 2, removed: 0, alreadyWatched: 1, notFound: 1, overLimit: 0, hiddenOrEmpty: false });
    expect(calls.lookups).toEqual([["2", "3", "4"]]);
    expect(calls.describe).toEqual([["2", "3"]]);
    expect(mem.watch.map((w) => [w.title, w.origin, w.originStoreGameId, w.coverUrl])).toEqual([
      ["T old", "steam", "1", undefined],
      ["Title 2", "steam", "2", "https://shared.akamai.steamstatic.com/2.jpg"],
      ["Title 3", "steam", "3", "https://shared.akamai.steamstatic.com/3.jpg"],
    ]);
    // the logs carry counters only
    expect(h.logs.join("\n")).not.toMatch(/Title|"2"|"3"/);
  });

  it("falls back to '<Store> <id>' and drops an image of a host that is not allowed", async () => {
    const { h, mem } = await setup({ ids: ["7", "8"], found: everyone, describe: async () => new Map([["8", { title: "Eight", media: { coverUrl: "https://evil.example/x.jpg" } }]]) });
    await h.core.importWishlist("steam");
    expect(mem.watch.map((w) => [w.title, w.coverUrl])).toEqual([["Steam 7", undefined], ["Eight", undefined]]);
  });

  it("a game already followed by hand, or by two ids of the store, is not touched", async () => {
    const { h, mem } = await setup({ ids: ["1", "2"], found: () => 5, watch: [rec("mine", 5)] });
    const res = await h.core.importWishlist("steam");
    expect(res).toMatchObject({ added: 0, alreadyWatched: 2 });
    expect(mem.watch).toEqual([rec("mine", 5)]);
  });

  it("an empty or hidden list adds nothing and deletes nothing", async () => {
    const { h, mem } = await setup({ ids: [], complete: false, watch: [rec("a", 1, "steam", "1")] });
    expect(await h.core.importWishlist("steam")).toMatchObject({ hiddenOrEmpty: true, added: 0, removed: 0 });
    expect(mem.watch.length).toBe(1);
    const again = await setup({ ids: [], complete: true, watch: [rec("a", 1, "steam", "1")] }); // complete but empty: same guard
    expect(await again.h.core.importWishlist("steam")).toMatchObject({ hiddenOrEmpty: true, removed: 0 });
    expect(again.mem.watch.length).toBe(1);
  });
});

describe("deleting (point 5.5 and 13 b)", () => {
  const base = [rec("keep", 1, "steam", "1"), rec("gone", 2, "steam", "2"), rec("other", 3, "gog", "3"), rec("hand", 4)];

  it("a complete list removes only the rows of this origin that left it; manual and the other store stay", async () => {
    const { h, mem } = await setup({ ids: ["1"], found: everyone, watch: base });
    expect(await h.core.importWishlist("steam")).toMatchObject({ removed: 1, added: 0, alreadyWatched: 1 });
    expect(mem.watch.map((w) => w.id)).toEqual(["keep", "other", "hand"]);
  });

  it("a partial list deletes nothing", async () => {
    const { h, mem } = await setup({ ids: ["1"], complete: false, found: everyone, watch: base });
    expect(await h.core.importWishlist("steam")).toMatchObject({ removed: 0 });
    expect(mem.watch.length).toBe(4);
  });

  it("an invalid id makes the list partial: nothing is deleted", async () => {
    const { h, mem } = await setup({ read: async () => ({ complete: true, entries: [{ storeGameId: "1" }, { storeGameId: "bad\u0000id" }] }), found: everyone, watch: base });
    expect(await h.core.importWishlist("steam")).toMatchObject({ removed: 0 });
    expect(mem.watch.length).toBe(4);
  });

  it("same store, two ids that are one game: the row stays and takes the new id (low b)", async () => {
    const { h, mem } = await setup({ ids: ["2"], found: () => 1, watch: [rec("keep", 1, "steam", "1")] });
    expect(await h.core.importWishlist("steam")).toMatchObject({ removed: 0, added: 0, alreadyWatched: 1 });
    expect(mem.watch.map((w) => [w.id, w.originStoreGameId])).toEqual([["keep", "2"]]);
  });
});

describe("volume (point 13, M3)", () => {
  it("stops looking up when the finds fill the hole; the rest does not fit; only the added are described", async () => {
    const manual = Array.from({ length: 495 }, (_, i) => rec(`m${i}`, 1000 + i));
    const ids = Array.from({ length: 700 }, (_, i) => String(i + 1));
    const { h, mem, calls } = await setup({ ids, found: everyone, watch: manual });
    const res = await h.core.importWishlist("steam");
    expect(res).toMatchObject({ added: 5, overLimit: 695 });
    expect(calls.lookups.length).toBe(1); // 200 found, the hole of 5 is full
    expect(calls.describe).toEqual([["1", "2", "3", "4", "5"]]);
    expect(mem.watch.length).toBe(500);
  });

  it("a full list does not even look up", async () => {
    const manual = Array.from({ length: 500 }, (_, i) => rec(`m${i}`, 1000 + i));
    const { h, calls } = await setup({ ids: ["1", "2"], found: everyone, watch: manual });
    expect(await h.core.importWishlist("steam")).toMatchObject({ added: 0, overLimit: 2 });
    expect(calls.lookups).toEqual([]);
  });

  it("reads at most 5000 ids and then counts the list as partial", async () => {
    const ids = Array.from({ length: 5100 }, (_, i) => String(i));
    const { h, mem } = await setup({ ids, found: () => undefined, watch: [rec("a", 1, "steam", "zzz")] });
    await h.core.importWishlist("steam");
    expect(mem.watch.length).toBe(1); // partial: "zzz" was not deleted although it is not in the list
  });

  it("if a lookup batch fails nothing is written, deletions included", async () => {
    const ids = Array.from({ length: 250 }, (_, i) => String(i + 1));
    const watch = [rec("gone", 9000, "steam", "gone"), rec("hand", 9001)];
    for (const failure of [new ConnectorError("store.rate-limited", "x", { retryAfterMs: 1000 }), new ConnectorError("network.unavailable", "x")]) {
      const { h, mem } = await setup({ ids, found: everyone, watch, lookup: (_b, call) => { if (call === 2) throw failure; } });
      await expect(h.core.importWishlist("steam")).rejects.toBeTruthy();
      expect(mem.watch).toEqual(watch);
    }
  });

  it("if describing fails nothing is written", async () => {
    const watch = [rec("gone", 9000, "steam", "gone")];
    const { h, mem } = await setup({ ids: ["1"], found: everyone, watch, describe: async () => { throw new ConnectorError("network.unavailable", "x"); } });
    await expect(h.core.importWishlist("steam")).rejects.toMatchObject({ code: "network.unavailable" });
    expect(mem.watch).toEqual(watch);
  });
});

describe("requirements and floor", () => {
  it("without IsThereAnyDeal, or with a key it refused, the store is not asked", async () => {
    for (const itad of ["none", "invalid"] as const) {
      const { h, calls } = await setup({ ids: ["1"], found: everyone, itad });
      await expect(h.core.importWishlist("steam")).rejects.toMatchObject({ code: itad === "none" ? "action-unavailable" : "auth.invalid" });
      expect(calls.read).toBe(0);
    }
  });

  it("a store that is not connected, or has no wishlist, is refused without network", async () => {
    const { h, calls } = await setup({ ids: ["1"], found: everyone });
    h.store.connectionRows.delete("steam");
    await expect(h.core.importWishlist("steam")).rejects.toMatchObject({ code: "auth.required" });
    await expect(h.core.importWishlist("epic")).rejects.toMatchObject({ code: "action-unavailable" });
    expect(calls.read).toBe(0);
  });

  it("10 minutes per store between imports, with no network below the floor (and the sync floor is not touched)", async () => {
    const { h, calls } = await setup({ ids: ["1"], found: everyone });
    await h.core.importWishlist("steam");
    h.clock.time += 9 * MIN;
    await expect(h.core.importWishlist("steam")).rejects.toMatchObject({ code: "store.rate-limited", key: "prices.errors.wishlistFloor", params: { minutes: 1 } });
    expect(calls.read).toBe(1);
    h.clock.time += 1 * MIN;
    await h.core.importWishlist("steam");
    expect(calls.read).toBe(2);
  });

  it("a failure with no answer from the store (network, timeout) does not spend the floor; another failure does", async () => {
    for (const [code, again] of [["network.unavailable", true], ["network.timeout", true], ["store.unexpected-response", false]] as const) {
      let fail = true;
      const { h } = await setup({ read: async () => { if (fail) throw new ConnectorError(code, "fixed"); return { complete: true, entries: [] }; }, found: everyone });
      await expect(h.core.importWishlist("steam")).rejects.toMatchObject({ code: code === "store.unexpected-response" ? code : expect.any(String) });
      fail = false;
      if (again) await h.core.importWishlist("steam");
      else await expect(h.core.importWishlist("steam")).rejects.toMatchObject({ key: "prices.errors.wishlistFloor" });
    }
  });
});

describe("connection state (point 13, M2)", () => {
  it("a failure of the store leaves it connected; only a rejected renewal (auth.expired) expires it", async () => {
    const codes = ["store.unexpected-response", "store.rate-limited", "network.unavailable"] as const;
    for (const code of codes) {
      const { h } = await setup({ read: async () => { throw new ConnectorError(code, "fixed"); } });
      await expect(h.core.importWishlist("steam")).rejects.toMatchObject({ code });
      expect(h.store.connectionRows.get("steam")?.status).toBe("connected");
    }
    const { h } = await setup({ id: "gog", read: async () => { throw new ConnectorError("auth.expired", "fixed"); } });
    await expect(h.core.importWishlist("gog")).rejects.toMatchObject({ code: "auth.expired" });
    expect(h.store.connectionRows.get("gog")?.status).toBe("expired");
  });

  it("an odd error from the connector never carries its text out", async () => {
    const { h } = await setup({ read: async () => { throw new SyntaxError("Unexpected token MARKER-TEXT"); } });
    const err = await h.core.importWishlist("steam").catch((e: unknown) => e as Error);
    expect(String((err as Error).message)).not.toContain("MARKER");
    expect(h.logs.join("\n")).not.toContain("MARKER");
  });

  it("if the store is disconnected during the import, nothing is written", async () => {
    const gate = deferred();
    const { h, mem } = await setup({ read: async () => { await gate.promise; return { complete: true, entries: [{ storeGameId: "1" }] }; }, found: everyone });
    const run = h.core.importWishlist("steam");
    await new Promise((r) => setTimeout(r, 5));
    await h.core.disconnect("steam");
    gate.resolve();
    await expect(run).rejects.toBeTruthy();
    expect(mem.watch).toEqual([]);
  });
});

describe("lock with the sync (point 13, M1)", () => {
  const library = (active: { n: number; max: number }, gate: Promise<void>) => async () => {
    active.n++;
    active.max = Math.max(active.max, active.n);
    await gate;
    active.n--;
    return { complete: true, entries: [owned("1", "One")] };
  };

  it("an import asked during a pass waits for it; the two never overlap", async () => {
    const active = { n: 0, max: 0 };
    const gate = deferred();
    const entered = deferred();
    let readAt = "";
    const setupResult = await setup({
      library: async () => { entered.resolve(); return library(active, gate.promise)(); },
      read: async () => {
        active.n++;
        active.max = Math.max(active.max, active.n);
        readAt = active.n === 1 ? "alone" : "overlap";
        active.n--;
        return { complete: true, entries: [{ storeGameId: "1" }] };
      },
      found: everyone,
    });
    const { h, mem } = setupResult;
    await h.core.requestSync({ trigger: "manual", operations: ["library"] });
    await entered.promise;
    const run = h.core.importWishlist("steam");
    await new Promise((r) => setTimeout(r, 10));
    expect(readAt).toBe(""); // still waiting for the pass
    expect(mem.watch.length).toBe(0);
    gate.resolve();
    await run;
    await h.core.whenIdle();
    expect(readAt).toBe("alone");
    expect(active.max).toBe(1);
    expect(mem.watch.length).toBe(1);
  });

  it("a pass asked during an import (forced or not) is queued and runs after it", async () => {
    for (const force of [false, true]) {
      const gate = deferred();
      let libraryRuns = 0;
      const { h } = await setup({
        library: async () => { libraryRuns++; return { complete: true, entries: [owned("1", "One")] }; },
        read: async () => { await gate.promise; return { complete: true, entries: [{ storeGameId: "1" }] }; },
        found: everyone,
      });
      const run = h.core.importWishlist("steam");
      await new Promise((r) => setTimeout(r, 5));
      if (force) await h.core.completeOnboarding(null); // forces a pass
      else await h.core.requestSync({ trigger: "open", operations: ["library"] });
      await new Promise((r) => setTimeout(r, 5));
      expect(libraryRuns).toBe(0); // not during the import
      gate.resolve();
      await run;
      await h.core.whenIdle();
      expect(libraryRuns).toBe(1); // and not lost
    }
  });

  it("a pass on opening the web, queued during an import, still respects the sync interval (it is not forced)", async () => {
    const gate = deferred();
    let libraryRuns = 0;
    const { h } = await setup({
      library: async () => { libraryRuns++; return { complete: true, entries: [owned("1", "One")] }; },
      read: async () => { await gate.promise; return { complete: true, entries: [] }; },
    });
    await h.core.requestSync({ trigger: "manual", operations: ["library"] });
    await h.core.whenIdle();
    expect(libraryRuns).toBe(1);
    const run = h.core.importWishlist("steam");
    await new Promise((r) => setTimeout(r, 5));
    await h.core.requestSync({ trigger: "open", operations: ["library"] });
    gate.resolve();
    await run;
    await h.core.whenIdle();
    expect(libraryRuns).toBe(1); // just synced: the opening pass skips it, as outside an import
  });

  it("two imports one after the other are chained", async () => {
    const gate = deferred();
    const order: string[] = [];
    const { h } = await setup({ read: async () => { order.push("read"); await gate.promise; return { complete: true, entries: [] }; } });
    const a = h.core.importWishlist("steam");
    await new Promise((r) => setTimeout(r, 5));
    h.clock.time += 11 * MIN;
    const b = h.core.importWishlist("steam");
    await new Promise((r) => setTimeout(r, 5));
    expect(order).toEqual(["read"]); // the second waits for the first
    gate.resolve();
    await Promise.all([a, b]);
    expect(order).toEqual(["read", "read"]);
  });
});

describe("board", () => {
  it("lists the connected stores that can import and shows the origin", async () => {
    const { h } = await setup({ watch: [rec("a", 1, "gog", "7"), rec("b", 2)] });
    const board = await h.core.getPriceBoard();
    expect(board.wishlistStores).toEqual(["steam"]);
    expect(board.items.map((i) => i.origin).sort()).toEqual(["gog", "manual"]);
    h.store.connectionRows.delete("steam");
    expect((await h.core.getPriceBoard()).wishlistStores).toEqual([]);
  });
});
