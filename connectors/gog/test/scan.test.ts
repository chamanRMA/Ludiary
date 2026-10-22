import { discoveryContext, memoryFiles, scanContext } from "@ludiary/connector-testkit";
import { ConnectorError } from "@ludiary/contracts";
import { describe, expect, it } from "vitest";
import { createGogConnector } from "../src";
import { gameInfo, info } from "./helpers";

const c = createGogConnector();
const scan = (tree: Record<string, string>, roots: string[]) => c.scanInstalled!(scanContext({ tree, roots }));
const F = "C:\\GOG Games";

describe("scanInstalled (ADR 76)", () => {
  it("a root that is a game folder", async () => {
    const r = await scan({ [`${F}\\A\\goggame-1000000001.info`]: gameInfo("1000000001") }, [`${F}\\A`]);
    expect(r.entries).toEqual([{ storeGameId: "1000000001", kind: "game", title: "Fake 1000000001", installPath: `${F}\\A` }]);
  });
  it("a root that is a folder of games; skips folders without .info and ignores hashdb/ico", async () => {
    const r = await scan(
      {
        [`${F}\\A\\goggame-1000000001.info`]: gameInfo("1000000001"),
        [`${F}\\A\\goggame-1000000001.hashdb`]: "not read",
        [`${F}\\A\\goggame-1000000001.ico`]: "x",
        [`${F}\\B\\goggame-1000000002.info`]: "\uFEFF" + gameInfo("1000000002", { name: "Ñandú ŌKAMI 大神" }),
        [`${F}\\Other\\readme.txt`]: "",
      },
      [F],
    );
    expect(r.entries.map((e) => [e.storeGameId, e.title])).toEqual([
      ["1000000001", "Fake 1000000001"],
      ["1000000002", "Ñandú ŌKAMI 大神"],
    ]);
  });
  it("shows the game, not its DLC; missing name uses GOG <id>; rootGameId absent is a game", async () => {
    const r = await scan(
      {
        [`${F}\\A\\goggame-1000000001.info`]: gameInfo("1000000001"),
        [`${F}\\A\\goggame-1000000003.info`]: gameInfo("1000000003", { rootGameId: "1000000001" }),
        [`${F}\\A\\goggame-1000000004.info`]: gameInfo("1000000004", { rootGameId: "1000000001" }),
        [`${F}\\N\\goggame-1000000005.info`]: info({ gameId: "1000000005" }),
      },
      [F],
    );
    expect(r.entries.map((e) => [e.storeGameId, e.title])).toEqual([
      ["1000000001", "Fake 1000000001"],
      ["1000000005", "GOG 1000000005"],
    ]);
  });
  it("skips broken JSON, no gameId and id different from the file name, logging no path", async () => {
    const ctx = scanContext({
      tree: {
        [`${F}\\A\\goggame-1000000001.info`]: "{ nope",
        [`${F}\\B\\goggame-1000000002.info`]: info({ name: "x" }),
        [`${F}\\C\\goggame-1000000003.info`]: gameInfo("1000000009"),
        [`${F}\\D\\goggame-1000000004.info`]: gameInfo("1000000004"),
      },
      roots: [F],
    });
    const r = await c.scanInstalled!(ctx);
    expect(r.entries.map((e) => e.storeGameId)).toEqual(["1000000004"]);
    expect(r.unreadableRoots).toEqual([]);
    expect(JSON.stringify(ctx.logs)).not.toContain("GOG Games");
  });
  it("a repeated id in two roots appears once", async () => {
    const r = await scan(
      { "C:\\X\\A\\goggame-1000000001.info": gameInfo("1000000001"), "D:\\Y\\A\\goggame-1000000001.info": gameInfo("1000000001") },
      ["C:\\X", "D:\\Y"],
    );
    expect(r.entries).toHaveLength(1);
  });
  it("a locked file makes the root unreadable but keeps the rest", async () => {
    const tree = { [`${F}\\A\\goggame-1000000001.info`]: "x", [`${F}\\B\\goggame-1000000002.info`]: gameInfo("1000000002") };
    const base = scanContext({ tree, roots: [F] });
    const fs = memoryFiles(tree, { roots: [F], unreadable: [`${F}\\A\\goggame-1000000001.info`] });
    const r = await c.scanInstalled!({ ...base, fs });
    expect(r.entries.map((e) => e.storeGameId)).toEqual(["1000000002"]);
    expect(r.unreadableRoots.map((u) => [u.root.path, u.code])).toEqual([[F, "scan.root-unreadable"]]);
    void ConnectorError;
  });
  it("a link escaping the roots: skipped in a subfolder, unreadable in the root", async () => {
    const tree = { [`${F}\\A\\goggame-1000000001.info`]: gameInfo("1000000001"), [`${F}\\B\\goggame-1000000002.info`]: gameInfo("1000000002") };
    const base = scanContext({ tree, roots: [F] });
    const sub = await c.scanInstalled!({ ...base, fs: memoryFiles(tree, { roots: [F], escaping: [`${F}\\A`] }) });
    expect(sub.entries.map((e) => e.storeGameId)).toEqual(["1000000002"]);
    expect(sub.unreadableRoots).toEqual([]);
    const root = await c.scanInstalled!({ ...base, fs: memoryFiles(tree, { roots: [F], escaping: [F] }) });
    expect(root.entries).toEqual([]);
    expect(root.unreadableRoots).toHaveLength(1);
  });
  it("looks at 2000 subfolders at most", async () => {
    const tree: Record<string, string> = {};
    for (let i = 0; i < 2000; i++) tree[`${F}\\d${String(i).padStart(4, "0")}\\x.txt`] = "";
    tree[`${F}\\z-last\\goggame-1000000001.info`] = gameInfo("1000000001");
    expect((await scan(tree, [F])).entries).toEqual([]);
  });
});

describe("discoverRoots (ADR 76)", () => {
  it("groups parents, drive root gives the game folder, ignores case duplicates, keeps gog-library", async () => {
    const locations = [
      { declarationId: "gog-games", path: "D:\\GOG Games\\A" },
      { declarationId: "gog-games", path: "d:\\gog games\\B" },
      { declarationId: "gog-games", path: "E:\\Solo" },
      { declarationId: "gog-library", path: "C:\\Program Files (x86)\\GOG Galaxy\\Games" },
    ];
    expect(await c.discoverRoots!(discoveryContext({ locations }))).toEqual([
      { declarationId: "gog-games", path: "D:\\GOG Games", tag: "library" },
      { declarationId: "gog-games", path: "E:\\Solo", tag: "game" },
      { declarationId: "gog-library", path: "C:\\Program Files (x86)\\GOG Galaxy\\Games", tag: "library" },
    ]);
  });
});
