import { discoveryContext, memoryFiles, scanContext } from "@ludiary/connector-testkit";
import { describe, expect, it } from "vitest";
import { createEpicConnector } from "../src";
import { parseEpicItem } from "../src/item";
import { APP, CAT, DATA, dataRoot, ID, item, LIB, libRoot, MANIFESTS, NS, readFixture } from "./helpers";

const c = createEpicConnector();
const tree = (items: Record<string, string>, extra: Record<string, string> = {}) => ({
  ...Object.fromEntries(Object.entries(items).map(([n, t]) => [`${MANIFESTS}\\${n}`, t])),
  ...extra,
});
const GAME_DIR = { [`${LIB}\\${APP}\\TestGame.exe`]: "" };
const scan = (items: Record<string, string>, roots = [dataRoot, libRoot], extra: Record<string, string> = GAME_DIR) =>
  c.scanInstalled!(scanContext({ tree: tree(items, extra), roots }));
const rejected = { code: "store.unexpected-response" };

describe("parseEpicItem (ADR 78, point 3)", () => {
  it("reads the fixture: id with the three segments, title, backslashes", () => {
    expect(parseEpicItem(readFixture("items", "game.item"))).toEqual({ storeGameId: ID, title: "Test Game ñandú", installLocation: `${LIB}\\${APP}` });
  });
  it("accepts a BOM, lower-cases catalog id and hex namespace, strips trailing separators", () => {
    const r = parseEpicItem("\uFEFF" + item({ CatalogItemId: CAT.toUpperCase(), CatalogNamespace: NS.toUpperCase(), InstallLocation: "D:/G/x/" }));
    expect(r).toMatchObject({ storeGameId: ID, installLocation: "D:\\G\\x" });
  });
  it("title: control characters removed, empty uses Epic <AppName>, 300 at most", () => {
    expect(parseEpicItem(item({ DisplayName: "A\u0000B\nC" }))).toMatchObject({ title: "A B C" });
    expect(parseEpicItem(item({ DisplayName: undefined }))).toMatchObject({ title: `Epic ${APP}` });
    expect((parseEpicItem(item({ DisplayName: "x".repeat(400) })) as { title: string }).title).toHaveLength(300);
  });
  it("skips incomplete, DLC (MainGameAppName or addons), non-games and namespace ue", () => {
    expect(parseEpicItem(item({ bIsIncompleteInstall: true }))).toBe("incomplete");
    expect(parseEpicItem(item({ MainGameAppName: "Other01" }))).toBe("dlc");
    expect(parseEpicItem(readFixture("items", "dlc.item"))).toBe("dlc");
    expect(parseEpicItem(item({ AppCategories: ["addons/x", "games"] }))).toBe("dlc");
    expect(parseEpicItem(item({ AppCategories: ["public", "applications"] }))).toBe("not-game");
    expect(parseEpicItem(item({ CatalogNamespace: "ue" }))).toBe("not-game");
  });
  it("throws store.unexpected-response for broken JSON, a missing field or a bad id", () => {
    const fields = ["AppName", "CatalogNamespace", "CatalogItemId", "InstallLocation"].map((f) => item({ [f]: undefined }));
    for (const t of ["{ nope", "[]", ...fields, item({ CatalogItemId: "xyz" }), item({ AppName: "a b" })]) {
      expect(() => parseEpicItem(t), t).toThrowError(expect.objectContaining(rejected));
    }
  });
  it("rejects hostile InstallLocation (audit): relative, '..', 'x:y', reserved names, drive root, special characters", () => {
    const locs = [
      "rel\\x", "\\x", "D:", "D:\\", "D:\\a\\..\\b", "D:\\a\\.\\b", "D:\\a\\\\b", "D:x", "D:\\a:b", "D:\\CON", "D:\\a\\nul.txt",
      "D:\\LPT1", "D:\\COM\u00b9", "D:\\CONIN$", "D:\\a.", "D:\\a \\b", "D:\\a|b", "D:\\a?b", 'D:\\a"b', "D:\\a*b", "D:\\a<b",
      "D:\\a\u0001b", "\\\\server\\share\\x",
    ];
    for (const l of locs) expect(() => parseEpicItem(item({ InstallLocation: l })), l).toThrowError(expect.objectContaining(rejected));
  });
});

describe("scanInstalled (ADR 78, point 3)", () => {
  it("lists the game of a manifest inside an active root", async () => {
    const r = await scan({
      "a.item": readFixture("items", "game.item"),
      "b.item": readFixture("items", "dlc.item"),
      "c.item": readFixture("items", "incomplete.item"),
      "readme.txt": "x",
    });
    expect(r.entries).toEqual([{ storeGameId: ID, kind: "game", title: "Test Game ñandú", installPath: `${LIB}\\${APP}` }]);
    expect(r.unreadableRoots).toEqual([]);
  });
  it("without the data folder among the roots: empty, and no disk access", async () => {
    const ctx = scanContext({ tree: tree({ "a.item": item() }, GAME_DIR), roots: [libRoot] });
    expect(await c.scanInstalled!(ctx)).toEqual({ entries: [], unreadableRoots: [] });
    expect(ctx.files.reads).toEqual([]);
  });
  it("a game whose root is switched off is skipped without touching the disk outside the roots", async () => {
    const ctx = scanContext({ tree: tree({ "a.item": item() }, GAME_DIR), roots: [dataRoot] });
    const r = await c.scanInstalled!(ctx);
    expect(r.entries).toEqual([]);
    expect(ctx.files.reads.some((p) => p.startsWith("D:"))).toBe(false);
  });
  it("an InstallLocation that does not exist is skipped", async () => {
    expect((await scan({ "a.item": item() }, [dataRoot, libRoot], {})).entries).toEqual([]);
  });
  it("hostile locations are skipped and counted, never internal", async () => {
    const r = await scan({
      "a.item": item({ InstallLocation: "D:/Epic Games ñ/../Other" }),
      "b.item": item({ InstallLocation: "D:\\Epic Games ñ\\CON" }),
      "c.item": item({ InstallLocation: "D:\\" }),
      "d.item": item({ InstallLocation: "D:\\Epic Games ñ\\x:y" }),
    });
    expect(r.entries).toEqual([]);
    expect(r.unreadableRoots).toEqual([]);
  });
  it("no Manifests folder: empty with readable roots", async () => {
    const ctx = scanContext({ tree: { [`${DATA}\\other.txt`]: "" }, roots: [dataRoot, libRoot] });
    expect(await c.scanInstalled!(ctx)).toEqual({ entries: [], unreadableRoots: [] });
  });
  it("Manifests unreadable: every root is unreadable", async () => {
    const t = tree({ "a.item": item() }, GAME_DIR);
    const base = scanContext({ tree: t, roots: [dataRoot, libRoot] });
    const fs = memoryFiles(t, { roots: [DATA, LIB], unreadable: [MANIFESTS] });
    const r = await c.scanInstalled!({ ...base, fs });
    expect(r.entries).toEqual([]);
    expect(r.unreadableRoots.map((u) => [u.root.path, u.code])).toEqual([
      [DATA, "scan.root-unreadable"],
      [LIB, "scan.root-unreadable"],
    ]);
  });
  it("a locked .item keeps the rest and marks every root unreadable", async () => {
    const t = tree({ "a.item": item(), "b.item": item({ AppName: "Locked01" }) }, GAME_DIR);
    const base = scanContext({ tree: t, roots: [dataRoot, libRoot] });
    const fs = memoryFiles(t, { roots: [DATA, LIB], unreadable: [`${MANIFESTS}\\b.item`] });
    const r = await c.scanInstalled!({ ...base, fs });
    expect(r.entries.map((e) => e.storeGameId)).toEqual([ID]);
    expect(r.unreadableRoots).toHaveLength(2);
  });
  it("a link escaping the roots: that file is skipped", async () => {
    const t = tree({ "a.item": item() }, GAME_DIR);
    const base = scanContext({ tree: t, roots: [dataRoot, libRoot] });
    const r = await c.scanInstalled!({ ...base, fs: memoryFiles(t, { roots: [DATA, LIB], escaping: [`${MANIFESTS}\\a.item`] }) });
    expect(r.entries).toEqual([]);
  });
  it("a repeated id appears once; at most 2000 manifests are read; the log has no paths, titles or ids", async () => {
    const many: Record<string, string> = {};
    for (let i = 0; i < 2100; i++) many[`m${String(i).padStart(4, "0")}.item`] = i === 2050 ? item({ AppName: "Late01" }) : "{}";
    many["a-dup.item"] = item();
    many["a.item"] = item();
    const ctx = scanContext({ tree: tree(many, GAME_DIR), roots: [dataRoot, libRoot] });
    const r = await c.scanInstalled!(ctx);
    expect(r.entries.map((e) => e.storeGameId)).toEqual([ID]);
    const log = JSON.stringify(ctx.logs);
    for (const s of [LIB, "ñandú", NS, CAT, "Epic Games"]) expect(log).not.toContain(s);
  });
});

describe("discoverRoots (ADR 78, point 3)", () => {
  const disc = (t: Record<string, string>) =>
    c.discoverRoots!(discoveryContext({ tree: t, locations: [{ declarationId: "epic-launcher-data", path: DATA }] }));
  const m = (name: string, body: string) => ({ [`${MANIFESTS}\\${name}`]: body });
  it("the data folder always; parents grouped without case; drive root gives the game folder; incomplete, DLC and hostile give nothing", async () => {
    const r = await disc({
      ...m("a.item", item()),
      ...m("b.item", item({ AppName: "Two01", MainGameAppName: "Two01", CatalogItemId: "00000000000000000000000000000005", InstallLocation: "d:/epic games ñ/Two" })),
      ...m("c.item", item({ AppName: "Solo01", MainGameAppName: "Solo01", CatalogItemId: "00000000000000000000000000000006", InstallLocation: "E:\\Solo" })),
      ...m("d.item", readFixture("items", "dlc.item")),
      ...m("e.item", readFixture("items", "incomplete.item")),
      ...m("f.item", item({ AppName: "Evil01", CatalogItemId: "00000000000000000000000000000007", InstallLocation: "D:\\x\\..\\..\\Windows" })),
      ...m("g.item", item({ AppName: "Evil02", CatalogItemId: "00000000000000000000000000000008", InstallLocation: "D:\\a\\CON" })),
      ...m("h.item", item({ AppName: "Evil03", CatalogItemId: "00000000000000000000000000000009", InstallLocation: "D:\\" })),
    });
    expect(r).toEqual([
      { declarationId: "epic-launcher-data", path: DATA, tag: "manifests" },
      { declarationId: "epic-launcher-data", path: LIB, tag: "library" },
      { declarationId: "epic-launcher-data", path: "E:\\Solo", tag: "game" },
    ]);
  });
  it("without Manifests: only the data folder", async () => {
    expect(await disc({ [`${DATA}\\x.txt`]: "" })).toEqual([{ declarationId: "epic-launcher-data", path: DATA, tag: "manifests" }]);
  });
});
