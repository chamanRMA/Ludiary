import { discoveryContext, memoryFiles, scanContext } from "@ludiary/connector-testkit";
import { ConnectorError } from "@ludiary/contracts";
import { describe, expect, it } from "vitest";
import { createSteamConnector, EXCLUDED_APP_IDS, steamMedia, STEAM_MEDIA_HOSTS } from "../src";
import { LIB_D, LIB_E, STEAM_ROOT, steamTree } from "./helpers";

const c = createSteamConnector();

describe("discoverRoots", () => {
  it("returns the Steam folder and every library, tagged 'library'", async () => {
    const ctx = discoveryContext({ tree: steamTree(), locations: [{ declarationId: "steam-root", path: STEAM_ROOT }] });
    const roots = await c.discoverRoots!(ctx);
    expect(roots).toEqual(
      [STEAM_ROOT, LIB_D, LIB_E].map((path) => ({ declarationId: "steam-root", path, tag: "library" })),
    );
  });
  it("falls back to the Steam folder when libraryfolders.vdf is missing or corrupt", async () => {
    for (const tree of [
      { [`${STEAM_ROOT}\\steamapps\\placeholder.txt`]: "" },
      { [`${STEAM_ROOT}\\steamapps\\libraryfolders.vdf`]: '"a" {' },
    ]) {
      const ctx = discoveryContext({ tree, locations: [{ declarationId: "steam-root", path: STEAM_ROOT }] });
      expect(await c.discoverRoots!(ctx)).toHaveLength(1);
    }
  });
  it("deduplicates and ignores other declarations", async () => {
    const ctx = discoveryContext({
      tree: steamTree(),
      locations: [
        { declarationId: "steam-root", path: STEAM_ROOT },
        { declarationId: "steam-root", path: STEAM_ROOT.toLowerCase().replace(/\\/g, "/") },
        { declarationId: "other", path: "D:\\SteamLibrary" },
      ],
    });
    expect((await c.discoverRoots!(ctx)).map((r) => r.path)).toEqual([STEAM_ROOT, LIB_D, LIB_E]);
  });
});

describe("scanInstalled", () => {
  const roots = [STEAM_ROOT, LIB_D, LIB_E];

  it("finds installed games across three libraries", async () => {
    const r = await c.scanInstalled!(scanContext({ tree: steamTree(), roots }));
    expect(r.unreadableRoots).toEqual([]);
    expect(r.entries.map((e) => [e.storeGameId, e.title, e.installPath])).toEqual([
      ["400", "Portal", `${STEAM_ROOT}\\steamapps\\common\\Portal`],
      ["620", "Portal 2", `${LIB_D}\\steamapps\\common\\Portal 2`],
      ["587620", "ŌKAMI HD / 大神 絶景版", `${LIB_E}\\steamapps\\common\\OKAMI`],
    ]);
    for (const e of r.entries) {
      expect(e.kind).toBe("game");
      expect(e.externalIds).toEqual({ steamAppId: e.storeGameId });
      expect(e.media).toEqual(steamMedia(e.storeGameId as string));
    }
  });
  it("skips tools, corrupt files, missing installdir, missing folders, duplicates and DLC folders", async () => {
    const ctx = scanContext({ tree: steamTree(), roots });
    const ids = (await c.scanInstalled!(ctx)).entries.map((e) => e.storeGameId);
    expect(ids).not.toContain("228980"); // tool
    expect(ids).not.toContain("999001"); // corrupt
    expect(ids).not.toContain("105600"); // no installdir
    expect(ids).not.toContain("1245620"); // common folder absent
    expect(ids.filter((i) => i === "400")).toHaveLength(1); // duplicate appid
    expect(ctx.logs.some((l) => l.fields?.["appId"] === "999001")).toBe(true);
    expect(JSON.stringify(ctx.logs)).not.toMatch(/Users|Portal/); // no paths or titles in logs
  });
  it("accepts a root that is the steamapps folder itself", async () => {
    const ctx = scanContext({ tree: steamTree(), roots: [`${LIB_D}\\steamapps`] });
    expect((await c.scanInstalled!(ctx)).entries.map((e) => e.storeGameId)).toEqual(["620"]);
  });
  it("ignores roots that are not Steam libraries and works case-insensitively", async () => {
    const ctx = scanContext({ tree: steamTree(), roots: ["D:\\Games", "d:/steamlibrary"] });
    expect((await c.scanInstalled!(ctx)).entries.map((e) => e.storeGameId)).toEqual(["620"]);
  });
  it("uses 'Steam <appId>' when the name is missing", async () => {
    const tree = {
      "D:\\L\\steamapps\\appmanifest_7.acf": '"AppState" { "appid" "7" "installdir" "G" }',
      "D:\\L\\steamapps\\common\\G\\a.txt": "",
    };
    const r = await c.scanInstalled!(scanContext({ tree, roots: ["D:\\L"] }));
    expect(r.entries[0]?.title).toBe("Steam 7");
  });
  it("reports unreadable roots without stopping the others", async () => {
    const tree = steamTree();
    const ctx = scanContext({ tree, roots });
    const fs = memoryFiles(tree, { roots, unreadable: [`${LIB_D}\\steamapps`] });
    const r = await c.scanInstalled!({ ...ctx, fs });
    expect(r.unreadableRoots).toEqual([{ root: { origin: "user", path: LIB_D }, code: "scan.root-unreadable" }]);
    expect(r.entries.map((e) => e.storeGameId)).toEqual(["400", "587620"]);
  });
  describe("links that leave the roots (ADR 72)", () => {
    it("skips one game whose install folder is a junction to elsewhere and scans the rest", async () => {
      const tree = steamTree();
      const ctx = scanContext({ tree, roots });
      const fs = memoryFiles(tree, { roots, escaping: [`${LIB_D}\\steamapps\\common\\Portal 2`] });
      const r = await c.scanInstalled!({ ...ctx, fs });
      expect(r.unreadableRoots).toEqual([]);
      expect(r.entries.map((e) => e.storeGameId)).toEqual(["400", "587620"]);
      expect(ctx.logs.some((l) => l.fields?.["appId"] === "620" && l.fields?.["code"] === "link-escapes-roots")).toBe(true);
      expect(JSON.stringify(ctx.logs)).not.toContain("Portal 2");
    });
    it("treats a steamapps folder that is an escaping junction as an unreadable root", async () => {
      const tree = steamTree();
      const ctx = scanContext({ tree, roots });
      const fs = memoryFiles(tree, { roots, escaping: [`${LIB_D}\\steamapps`] });
      const r = await c.scanInstalled!({ ...ctx, fs });
      expect(r.unreadableRoots).toEqual([{ root: { origin: "user", path: LIB_D }, code: "scan.root-unreadable" }]);
      expect(r.entries.map((e) => e.storeGameId)).toEqual(["400", "587620"]);
    });
    it("still propagates a plain 'internal' error: that is a connector bug", async () => {
      const ctx = scanContext({ tree: steamTree(), roots });
      const fs = { ...ctx.fs, exists: async () => Promise.reject(new ConnectorError("internal", "bug")) };
      await expect(c.scanInstalled!({ ...ctx, fs })).rejects.toThrow("bug");
    });
    it("discoverRoots falls back to the Steam folder when libraryfolders.vdf is behind an escaping link", async () => {
      const tree = steamTree();
      const ctx = discoveryContext({ tree, locations: [{ declarationId: "steam-root", path: STEAM_ROOT }] });
      const fs = memoryFiles(tree, { roots: [STEAM_ROOT], escaping: [`${STEAM_ROOT}\\steamapps`] });
      expect((await c.discoverRoots!({ ...ctx, fs })).map((r) => r.path)).toEqual([STEAM_ROOT]);
    });
  });
  describe("manifests that cannot be read right now", () => {
    const tree = {
      "D:\\L\\steamapps\\appmanifest_1.acf": '"AppState" { "appid" "1" "name" "Locked" "installdir" "A" }',
      "D:\\L\\steamapps\\appmanifest_2.acf": '"AppState" { "appid" "2" "name" "Fine" "installdir" "B" }',
      "D:\\L\\steamapps\\appmanifest_3.acf": '"AppState" { "appid" "3" "name" "Broken',
      "D:\\L\\steamapps\\common\\A\\a.txt": "",
      "D:\\L\\steamapps\\common\\B\\b.txt": "",
    };
    it("reports the root as unreadable (so the core keeps its installs) and still returns the readable games", async () => {
      const ctx = scanContext({ tree, roots: ["D:\\L"] });
      const fs = memoryFiles(tree, { roots: ["D:\\L"], unreadable: ["D:\\L\\steamapps\\appmanifest_1.acf"] });
      const r = await c.scanInstalled!({ ...ctx, fs });
      expect(r.entries.map((e) => e.storeGameId)).toEqual(["2"]);
      expect(r.unreadableRoots).toEqual([{ root: { origin: "user", path: "D:\\L" }, code: "scan.root-unreadable" }]);
      expect(ctx.logs.some((l) => l.fields?.["appId"] === "1" && l.fields?.["code"] === "scan.root-unreadable")).toBe(true);
    });
    it("a malformed manifest is skipped without marking the root", async () => {
      const r = await c.scanInstalled!(scanContext({ tree, roots: ["D:\\L"] }));
      expect(r.entries.map((e) => e.storeGameId)).toEqual(["1", "2"]);
      expect(r.unreadableRoots).toEqual([]);
    });
  });
  it("never leaks LastOwner and stays inside the roots", async () => {
    const owner = "7656119" + "7".repeat(10);
    const tree = {
      "D:\\L\\steamapps\\appmanifest_9.acf": `"AppState" { "appid" "9" "name" "G" "installdir" "G" "LastOwner" "${owner}" }`,
      "D:\\L\\steamapps\\common\\G\\a.txt": "",
    };
    const ctx = scanContext({ tree, roots: ["D:\\L"] });
    const r = await c.scanInstalled!(ctx);
    expect(r.entries).toHaveLength(1);
    expect(JSON.stringify([r, ctx.logs])).not.toContain(owner);
    expect(ctx.files.reads.every((p) => p.toLowerCase().startsWith("d:\\l"))).toBe(true);
  });
  it("honours cancellation", async () => {
    const ac = new AbortController();
    ac.abort();
    await expect(c.scanInstalled!(scanContext({ tree: steamTree(), roots, signal: ac.signal }))).rejects.toThrow();
  });
});

describe("tool exclusion and media", () => {
  it("excludes Steamworks Common Redistributables", () => expect(EXCLUDED_APP_IDS.has("228980")).toBe(true));
  it("media URLs are https and inside mediaHosts", () => {
    const m = steamMedia("620");
    expect(m.coverUrl).toBe("https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/620/library_600x900.jpg");
    expect(m.heroUrl).toBe("https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/620/header.jpg");
    for (const u of [m.coverUrl as string, m.heroUrl as string]) expect(STEAM_MEDIA_HOSTS).toContain(new URL(u).hostname);
  });
});

describe("scanInstalled, DLC (ADR 84)", () => {
  const R = "D:\\Lib";
  const acf = (id: string, depots: string) =>
    `"AppState" { "appid" "${id}" "name" "G${id}" "installdir" "G${id}" "InstalledDepots" { ${depots} } }`;
  const depot = (n: number, dlc?: string) => `"${n}" { "manifest" "1" ${dlc === undefined ? "" : `"dlcappid" "${dlc}"`} }`;
  const tree = (manifests: Record<string, string>, folders = Object.keys(manifests)) => ({
    ...Object.fromEntries(Object.entries(manifests).map(([id, t]) => [`${R}\\steamapps\\appmanifest_${id}.acf`, t])),
    ...Object.fromEntries(folders.map((id) => [`${R}\\steamapps\\common\\G${id}\\a.txt`, ""])),
  });
  const scan = (manifests: Record<string, string>, folders?: string[]) => {
    const ctx = scanContext({ tree: tree(manifests, folders), roots: [R] });
    return c.scanInstalled!(ctx).then((r) => ({ r, ctx }));
  };

  it("emits DLC after the games, based on the manifest, without media, ids or launch data", async () => {
    const { r, ctx } = await scan({
      "10": acf("10", [depot(1), depot(2, "11"), depot(3, "abc"), depot(4, "10"), depot(5, "11"), depot(6, "228980")].join(" ")),
      "20": acf("20", [depot(1, "12"), depot(2, "11")].join(" ")), // 11 listed by the first game too
    });
    expect(r.entries.map((e) => [e.storeGameId, e.kind, e.baseStoreGameId])).toEqual([
      ["10", "game", undefined],
      ["20", "game", undefined],
      ["11", "dlc", "10"],
      ["12", "dlc", "20"],
    ]);
    const d = r.entries[2]!;
    expect(d.title).toBe("Steam 11");
    expect(d.installPath).toBe(`${R}\\steamapps\\common\\G10`);
    expect(d.media).toBeUndefined();
    expect(d.externalIds).toBeUndefined();
    expect(d.launchData).toBeUndefined();
    expect(ctx.logs.find((l) => l.fields?.["dlc"] !== undefined)?.fields).toEqual({ dlc: 2, dlcDuplicate: 1, dlcCapped: 0 });
    expect(JSON.stringify(ctx.logs)).not.toMatch(/"1[12]"/);
  });

  it("a DLC that is also an installed game stays a game; a game without folder gives no DLC", async () => {
    const { r } = await scan({ "10": acf("10", depot(1, "20")), "20": acf("20", depot(1)), "30": acf("30", depot(1, "31")) }, ["10", "20"]);
    expect(r.entries.map((e) => [e.storeGameId, e.kind])).toEqual([["10", "game"], ["20", "game"]]);
  });

  it("caps 1000 DLC per manifest and never passes 10 000 entries in total", async () => {
    const many = (n: number, from: number) => Array.from({ length: n }, (_, i) => depot(i + 1, String(from + i))).join(" ");
    const { r, ctx } = await scan({ "10": acf("10", many(1200, 5000)) });
    expect(r.entries.filter((e) => e.kind === "dlc")).toHaveLength(1000);
    expect(ctx.logs.find((l) => l.fields?.["dlc"] !== undefined)?.fields).toMatchObject({ dlc: 1000, dlcCapped: 200 });
    const manifests: Record<string, string> = {};
    for (let i = 0; i < 10; i++) manifests[String(100 + i)] = acf(String(100 + i), many(1000, 100000 + i * 1000));
    const big = await scan(manifests);
    expect(big.r.entries).toHaveLength(10_000);
  });
});
