// DLC inside the game they belong to (ADR 83, points 5, 11 and 13).
import type { InstalledEntry, LibrarySnapshot, StoreEntry } from "@ludiary/contracts";
import { describe, expect, it } from "vitest";
import { computeLibraryPlan } from "../src/library-plan";
import { validateLibraryEntries } from "../src/validate";
import { addUserRoot, entry, harness, makeConnector, offlineHttp, owned, type Harness } from "./helpers";

const LIB = "D:\\Games";
const MIN = 60_000;

async function setup(dlc: "library" | "library-and-scan" | "none" = "library-and-scan") {
  const s = { library: [] as StoreEntry[], scan: [] as InstalledEntry[], complete: true };
  const connector = makeConnector({
    caps: { library: true, scan: true, dlc, actions: ["play", "install"], storePlaytime: true },
    library: async (): Promise<LibrarySnapshot> => ({ complete: s.complete, entries: s.library }),
    scan: async () => ({ entries: s.scan, unreadableRoots: [] }),
  });
  const h = await harness({ dirs: [LIB, `${LIB}\\Base`, `${LIB}\\Dlc`], connectors: [connector], http: () => offlineHttp, connected: ["steam" as const] });
  addUserRoot(h, LIB);
  return { h, s, connector };
}
const run = async (h: Harness, op: "library" | "scan") => {
  h.clock.time += 20 * MIN;
  await h.core.requestSync({ trigger: "manual", operations: [op] });
  await h.core.whenIdle();
};
const props = (h: Harness) => [...h.store.properties.values()];
const dlcOf = (id: string, title: string, base?: string): StoreEntry => ({ storeGameId: id, kind: "dlc", title, ...(base ? { baseStoreGameId: base } : {}) });

describe("DLC: library sync", () => {
  it("stores a DLC without a canonical game and shows it in its base game, not in the library", async () => {
    const { h, s } = await setup();
    s.library = [owned("1", "Base"), dlcOf("2", "Base Soundtrack", "1")];
    await run(h, "library");
    expect((await h.core.listLibrary()).map((g) => g.title)).toEqual(["Base"]);
    expect(h.store.canonical.size).toBe(1);
    const game = (await h.core.listLibrary())[0]!;
    expect((await h.core.getGame(game.id))?.dlc).toEqual([expect.objectContaining({ title: "Base Soundtrack", store: "steam", installed: false })]);
    expect(props(h).find((p) => p.storeGameId === "2")).toMatchObject({ kind: "dlc", baseStoreGameId: "1", owned: true });
  });

  it("an orphan DLC links when its base arrives, and goes back to orphan when the base is retired", async () => {
    const { h, s } = await setup();
    s.library = [dlcOf("2", "Pack", "1")];
    await run(h, "library");
    expect(h.store.canonical.size).toBe(0);
    expect(props(h)[0]).toMatchObject({ canonicalGameId: null, baseStoreGameId: "1" });
    s.library = [owned("1", "Base"), dlcOf("2", "Pack", "1")];
    await run(h, "library");
    const base = props(h).find((p) => p.storeGameId === "1")!;
    expect(props(h).find((p) => p.storeGameId === "2")!.canonicalGameId).toBe(base.canonicalGameId);
    s.library = [dlcOf("2", "Pack", "1"), owned("9", "Other")];
    await run(h, "library");
    expect(props(h).find((p) => p.storeGameId === "1")!.removedAt).not.toBeNull();
    expect(props(h).find((p) => p.storeGameId === "2")).toMatchObject({ canonicalGameId: null, baseStoreGameId: "1" });
  });

  it("a DLC that was stored as a game becomes a DLC and its empty canonical game is deleted", async () => {
    const { h, s } = await setup();
    s.library = [owned("1", "Base"), owned("2", "Base Expansion")];
    await run(h, "library");
    expect(h.store.canonical.size).toBe(2);
    s.library = [owned("1", "Base"), dlcOf("2", "Base Expansion", "1")];
    await run(h, "library");
    expect(h.store.canonical.size).toBe(1);
    expect((await h.core.listLibrary()).map((g) => g.title)).toEqual(["Base"]);
    const base = props(h).find((p) => p.storeGameId === "1")!;
    expect(props(h).find((p) => p.storeGameId === "2")).toMatchObject({ kind: "dlc", canonicalGameId: base.canonicalGameId });
  });

  it("a DLC that becomes a game does not rename its base game", async () => {
    const { h, s } = await setup();
    s.library = [owned("1", "Base"), dlcOf("2", "Standalone", "1")];
    await run(h, "library");
    s.library = [owned("1", "Base"), owned("2", "Standalone")];
    await run(h, "library");
    expect((await h.core.listLibrary()).map((g) => g.title).sort()).toEqual(["Base", "Standalone"]);
    expect(h.store.canonical.size).toBe(2);
  });

  it("an update of a linked DLC does not rename the game that has it", async () => {
    const { h, s } = await setup();
    s.library = [owned("1", "Base"), dlcOf("2", "Pack", "1")];
    await run(h, "library");
    s.library = [owned("1", "Base"), dlcOf("2", "Pack renamed", "1")];
    await run(h, "library");
    expect((await h.core.listLibrary()).map((g) => g.title)).toEqual(["Base"]);
  });

  it("a complete snapshot with only DLC does not disown the owned games (A2)", async () => {
    const { h, s } = await setup();
    s.library = [owned("1", "Base"), dlcOf("2", "Pack", "1")];
    await run(h, "library");
    s.library = [dlcOf("2", "Pack", "1")];
    await run(h, "library");
    expect(props(h).find((p) => p.storeGameId === "1")).toMatchObject({ owned: true, removedAt: null });
    expect(h.logs.some((l) => l.includes("empty library"))).toBe(true);
  });

  it("disowns and retires DLC that left the library", async () => {
    const { h, s } = await setup();
    s.library = [owned("1", "Base"), dlcOf("2", "Pack", "1")];
    await run(h, "library");
    s.library = [owned("1", "Base")];
    await run(h, "library");
    expect(props(h).find((p) => p.storeGameId === "2")).toMatchObject({ owned: false });
    expect(props(h).find((p) => p.storeGameId === "2")!.removedAt).not.toBeNull();
  });

  it("without the capability a DLC entry is dropped and counted, without making the snapshot lossy", async () => {
    const { h, s } = await setup("none");
    s.library = [owned("1", "Base"), dlcOf("2", "Pack", "1")];
    await run(h, "library");
    expect(props(h).map((p) => p.storeGameId)).toEqual(["1"]);
    expect(h.logs.some((l) => l.includes('"dlcUnsupported":1'))).toBe(true);
  });
});

describe("DLC: library, then scan, then library (A1)", () => {
  it("never creates a canonical game for a DLC, whichever side saw it first", async () => {
    const { h, s } = await setup();
    s.library = [owned("1", "Base"), dlcOf("2", "Pack", "1")];
    await run(h, "library");
    s.scan = [entry("1", "Base", `${LIB}\\Base`), { storeGameId: "2", kind: "dlc", baseStoreGameId: "1", title: "Pack", installPath: `${LIB}\\Dlc` }];
    await run(h, "scan");
    await run(h, "library");
    expect(h.store.canonical.size).toBe(1);
    expect(props(h).map((p) => p.kind).sort()).toEqual(["dlc", "game"]);
    const game = (await h.core.listLibrary())[0]!;
    expect((await h.core.getGame(game.id))?.dlc).toEqual([expect.objectContaining({ installed: true })]);
  });

  it("an installation seen as a game is not turned into a DLC by the library (kindConflict)", async () => {
    const { h, s } = await setup();
    s.scan = [entry("2", "Thing", `${LIB}\\Dlc`)];
    await run(h, "scan");
    s.library = [dlcOf("2", "Thing", "1")];
    await run(h, "library");
    expect(props(h)[0]).toMatchObject({ kind: "game", owned: true, title: "Thing" });
    expect(h.store.canonical.size).toBe(1);
    expect(h.logs.some((l) => l.includes("kindConflict"))).toBe(true);
  });

  it("a DLC deduced from its title becomes a game when the scan finds it installed, in both orders, and the library does not flip it back", async () => {
    const guessed: StoreEntry = { ...dlcOf("2", "Test Game Subtitle", "1"), storeMetadata: { dlcInferred: true } };
    // library first
    const a = await setup();
    a.s.library = [owned("1", "Test Game"), guessed];
    await run(a.h, "library");
    expect(props(a.h).find((p) => p.storeGameId === "2")).toMatchObject({ kind: "dlc", dlcInferred: true });
    a.s.scan = [entry("2", "Test Game Subtitle", `${LIB}\\Dlc`)];
    await run(a.h, "scan");
    expect(props(a.h).find((p) => p.storeGameId === "2")).toMatchObject({ kind: "game", dlcInferred: false, baseStoreGameId: null });
    expect(a.h.store.canonical.size).toBe(2);
    expect((await a.h.core.listLibrary()).map((g) => g.title).sort()).toEqual(["Test Game", "Test Game Subtitle"]);
    await run(a.h, "library");
    expect(props(a.h).find((p) => p.storeGameId === "2")).toMatchObject({ kind: "game" });
    expect(a.h.store.canonical.size).toBe(2);
    // scan first
    const b = await setup();
    b.s.scan = [entry("2", "Test Game Subtitle", `${LIB}\\Dlc`)];
    await run(b.h, "scan");
    b.s.library = [owned("1", "Test Game"), guessed];
    await run(b.h, "library");
    expect(props(b.h).find((p) => p.storeGameId === "2")).toMatchObject({ kind: "game" });
    expect(b.h.store.canonical.size).toBe(2);
  });

  it("the scan's rootGameId wins over a different library base while installed; a library entry without base keeps the known one", async () => {
    const { h, s } = await setup();
    s.library = [owned("1", "Base"), owned("3", "Other"), dlcOf("2", "Pack", "3")];
    await run(h, "library");
    s.scan = [{ storeGameId: "2", kind: "dlc", baseStoreGameId: "1", title: "Pack", installPath: `${LIB}\\Dlc` }];
    await run(h, "scan");
    expect(props(h).find((p) => p.storeGameId === "2")).toMatchObject({ baseStoreGameId: "1" });
    s.library = [owned("1", "Base"), owned("3", "Other"), dlcOf("2", "Pack", "3")];
    await run(h, "library");
    expect(props(h).find((p) => p.storeGameId === "2")).toMatchObject({ baseStoreGameId: "1" });
    s.library = [owned("1", "Base"), owned("3", "Other"), dlcOf("2", "Pack")];
    await run(h, "library");
    expect(props(h).find((p) => p.storeGameId === "2")).toMatchObject({ baseStoreGameId: "1" });
  });

  it("the scan does not change the kind of an owned row", async () => {
    const { h, s } = await setup();
    s.library = [dlcOf("2", "Pack", "1")];
    await run(h, "library");
    s.scan = [entry("2", "Pack", `${LIB}\\Dlc`)];
    await run(h, "scan");
    expect(props(h)[0]).toMatchObject({ kind: "dlc" });
    expect(h.store.canonical.size).toBe(0);
  });

  it("a scan-only DLC is linked to its installed base", async () => {
    const { h, s } = await setup();
    s.scan = [entry("1", "Base", `${LIB}\\Base`), { storeGameId: "2", kind: "dlc", baseStoreGameId: "1", title: "Pack", installPath: `${LIB}\\Dlc` }];
    await run(h, "scan");
    const base = props(h).find((p) => p.storeGameId === "1")!;
    expect(props(h).find((p) => p.storeGameId === "2")).toMatchObject({ kind: "dlc", canonicalGameId: base.canonicalGameId });
    expect(h.store.canonical.size).toBe(1);
  });
});

describe("DLC: validation and plan", () => {
  const log = { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} };
  const conn = (dlc: "none" | "library") => makeConnector({ caps: { library: true, dlc } });

  it("a bad base id is treated as absent and does not make the snapshot lossy; a base equal to the id is absent", () => {
    const v = validateLibraryEntries({
      entries: [dlcOf("2", "A", "x\u0000y"), dlcOf("3", "B", "3"), { ...dlcOf("4", "C"), storePlaytimeMinutes: 50, media: { coverUrl: "https://x" } }],
      connector: conn("library"),
      log,
    });
    expect(v.lossy).toBe(false);
    expect(v.entries.map((e) => e.baseStoreGameId)).toEqual([null, null, null]);
    expect(v.entries[2]).toMatchObject({ storePlaytimeMinutes: null });
    expect(v.entries[2]).not.toHaveProperty("media");
  });

  it("the same id as game and DLC keeps the first", () => {
    const v = validateLibraryEntries({ entries: [owned("1", "G"), dlcOf("1", "D")], connector: conn("library"), log });
    expect(v.entries).toHaveLength(1);
    expect(v.entries[0]!.kind).toBe("game");
  });

  it("a DLC entry never creates a canonical game in the plan", () => {
    const sync = { store: "steam", operation: "library", lastAttemptAt: 1, lastSuccessAt: 1, status: "idle", error: null, nextAllowedAt: 2 } as const;
    const e = validateLibraryEntries({ entries: [dlcOf("2", "D", "1")], connector: conn("library"), log }).entries;
    let n = 0;
    const plan = computeLibraryPlan({ store: "steam", at: 1, newId: () => `id${++n}`, entries: e, complete: true, properties: [], installations: [], sync });
    expect(plan.create).toEqual([expect.objectContaining({ canonicalId: null })]);
    expect(n).toBe(1);
  });
});
