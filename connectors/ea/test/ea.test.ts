import { assertConnectorConformance, discoveryContext, launchContext, scanContext } from "@ludiary/connector-testkit";
import { checkConnectorManifest, ConnectorError, PathEscapesRootsError, type StoredProperty } from "@ludiary/contracts";
import { describe, expect, it } from "vitest";
import en from "../locales/en.json";
import es from "../locales/es.json";
import { createEaConnector } from "../src";
import { EA_LOCATIONS } from "../src/manifest";
import { parseInstallerData } from "../src/installerdata";
import { URI_RE } from "../src/launch";

const c = createEaConnector();
const R = "C:\\Program Files\\EA Games";
const APP = `C:\\Program Files\\${(EA_LOCATIONS[2]!.sources[0] as { relative: string }).relative}`;
const DATA = "__Installer\\installerdata.xml";

// Invented ids and titles (no real data).
const current = (ids: string[], titles: [string, string][] = [["en_US", "Fake Game"]]): string =>
  `<?xml version="1.0" encoding="utf-8"?>\n<DiPManifest version="4.0"><gameTitles>${titles
    .map(([l, t]) => `<gameTitle locale="${l}">${t}</gameTitle>`)
    .join("")}</gameTitles><contentIDs>${ids.map((i) => `<contentID>${i}</contentID>`).join("")}</contentIDs></DiPManifest>`;
const legacy = `<game><contentIDs><contentID>FAKE.OFB.EAX.0001</contentID></contentIDs><localization><localeInfo locale="de_DE"><title>Falsches Spiel</title></localeInfo><localeInfo locale="en_GB"><title>Fake Legacy</title></localeInfo></localization></game>`;

describe("manifest (ADR 81, ADR 82)", () => {
  it("is valid, unofficial-api with an account, uri origin2", () => {
    expect(checkConnectorManifest(c)).toEqual([]);
    expect(c.access).toBe("unofficial-api");
    expect(c.capabilities).toMatchObject({ library: true, scan: true, dlc: "library", actions: ["play", "install"], launchKinds: ["uri"], uriSchemes: ["origin2"] });
    expect([c.authHosts, c.apiHosts, c.mediaHosts]).toEqual([["accounts.ea.com"], ["service-aggregation-layer.juno.ea.com"], ["app-images.ea.com", "drop-assets.ea.com"]]);
    expect(c.minSyncIntervalMs).toBe(1_800_000);
    expect([c.connection, c.listLibrary]).not.toContain(undefined);
    expect(c.discoverRoots).toBeDefined();
    expect(c.locations[2]!.sources).toEqual([{ kind: "known-folder", folder: "ProgramFiles", relative: "Electronic Arts\\EA Desktop\\EA Desktop" }]);
    expect(c.locations.map((l) => [l.id, l.purpose, l.sources.length])).toEqual([["ea-libraries", "scan", 2], ["ea-settings", "scan", 2], ["ea-desktop", "launcher", 1]]);
  });
  it("catalogs match", () => expect(Object.keys(es).sort()).toEqual(Object.keys(en).sort()));
  it("passes the shared conformance check", async () => {
    await assertConnectorConformance(c, {
      scan: () => scanContext({ tree: { [`${R}\\A\\${DATA}`]: current(["1000"]) }, roots: [R] }),
      launch: {
        ctx: () => launchContext({ launchers: [{ declarationId: "ea-desktop", path: APP }], installPaths: [`${R}\\A`], tree: { [`${APP}\\EADesktop.exe`]: "", [`${R}\\A\\${DATA}`]: current(["1000"]) } }),
        properties: [{ storeGameId: "1000", installed: true, installPath: `${R}\\A`, launchData: null }],
      },
      catalogs: { es, en },
    });
  });
});

describe("parseInstallerData", () => {
  it("current format: ids in order, title en_US > en_* > first", () => {
    expect(parseInstallerData(current(["1", "2"], [["de_DE", "D"], ["en_GB", "B"], ["en_US", "U"]]))).toMatchObject({ ids: ["1", "2"], title: "U" });
    expect(parseInstallerData(current(["1"], [["de_DE", "D"], ["en_GB", "B"]]))?.title).toBe("B");
    expect(parseInstallerData(current(["1"], [["de_DE", "D"], ["fr_FR", "F"]]))?.title).toBe("D");
  });
  it("legacy Origin format", () => {
    expect(parseInstallerData(legacy)).toMatchObject({ ids: ["FAKE.OFB.EAX.0001"], title: "Fake Legacy" });
  });
  it("<contentIDs> is not <contentID>; invalid ids are dropped (an '&' invalidates, never decoded), repeats ignored, all valid kept", () => {
    const many = Array.from({ length: 20 }, (_, i) => `F${i}`);
    const r = parseInstallerData(current(["a b", "-x", "1", "1", "&lt;x", "A&amp;B", " 2 ", ...many]));
    expect(r?.ids).toHaveLength(22);
    expect(r?.ids.slice(0, 3)).toEqual(["1", "2", "F0"]);
    expect(parseInstallerData(current(["a b"]))).toBeNull();
    expect(parseInstallerData(current(["&#49;"]))).toBeNull();
  });
  it("decodes entities and numeric references; unknown entities stay; control references stay", () => {
    expect(parseInstallerData(current(["1"], [["en_US", "A &amp; B &#x41;&#66; &foo; &#7; &#xD800; &#x110000; &amp;lt;"]]))?.title).toBe("A & B AB &foo; &#7; &#xD800; &#x110000; &lt;");
  });
  it("rejects DOCTYPE, ENTITY, NUL (UTF-16 without BOM), comments hiding ids, and other roots", () => {
    expect(parseInstallerData(`<!DOCTYPE x [<!ENTITY e "1">]>${current(["1"])}`)).toBeNull();
    expect(parseInstallerData(current(["1"]).replace("", "\u0000"))).toBeNull();
    expect(parseInstallerData(`<!-- <DiPManifest> -->${"<other><contentIDs><contentID>1</contentID></contentIDs></other>"}`)).toBeNull();
    expect(parseInstallerData(current([]).replace("<contentIDs></contentIDs>", "<!-- <contentIDs><contentID>9</contentID></contentIDs> -->"))).toBeNull();
    expect(parseInstallerData("")).toBeNull();
    expect(parseInstallerData(`${current(["1"])}<!-- never closed`)).toBeNull();
    expect(parseInstallerData(`${current(["1"])}<![CDATA[ never closed`)).toBeNull();
  });
  it("CDATA content is the title as is (escaped, never parsed as markup)", () => {
    expect(parseInstallerData(current(["1"], [["en_US", "<![CDATA[A & <b>]]>"], ["de_DE", "Other"]]))?.title).toBe("A & <b>");
  });
  it("tag-name look-alikes do not count; DOCTYPE is case-insensitive", () => {
    const x = (ids: string) => `<DiPManifest>${ids}</DiPManifest>`;
    expect(parseInstallerData(x("<CONTENTIDS><contentID>1</contentID></CONTENTIDS>"))).toBeNull();
    expect(parseInstallerData(x("<contentIDs><contentID-x>1</contentID-x></contentIDs>"))).toBeNull();
    expect(parseInstallerData(x("<contentIDsX><contentID>9</contentID></contentIDsX><contentIDs><contentID>1</contentID></contentIDs>"))?.ids).toEqual(["1"]);
    expect(parseInstallerData("<!doctype x>" + current(["1"]))).toBeNull();
  });
  it("gameTitle outside <gameTitles> is ignored", () => {
    expect(parseInstallerData(`<DiPManifest><contentIDs><contentID>1</contentID></contentIDs><gameTitle locale="en_US">Out</gameTitle></DiPManifest>`)?.title).toBeNull();
  });
  it("legacy: the title must be inside its own localeInfo block", () => {
    const x = `<game><contentIDs><contentID>1</contentID></contentIDs><localeInfo locale="en_US"></localeInfo><localeInfo locale="de_DE"><title>De</title></localeInfo></game>`;
    expect(parseInstallerData(x)?.title).toBe("De");
  });
  it.each([
    ["<DiPManifest><gameTitles>", '<gameTitle locale="x" '],
    ["<DiPManifest>", "<contentIDs>"],
    ["<DiPManifest><contentIDs>", "<contentID>"],
    ["<game><contentIDs><contentID>1</contentID></contentIDs>", '<localeInfo locale="x">'],
    ["<game><contentIDs><contentID>1</contentID></contentIDs>", '<localeInfo locale="x"><title>'],
    ["<DiPManifest>", "<!-- "],
    ["<DiPManifest>", "<![CDATA["],
    ["<DiPManifest>", "<!---->"],
    ["<DiPManifest><contentIDs>", "<contentID>a</contentID>"],
  ])("1 MiB of %s + repeated %s finishes fast", (head, unit) => {
    const text = head + unit.repeat(Math.ceil((1024 * 1024) / unit.length));
    const t = performance.now();
    parseInstallerData(text);
    expect(performance.now() - t).toBeLessThan(200);
  });
});

describe("scanInstalled (ADR 81)", () => {
  const scan = (tree: Record<string, string>, roots: string[] = [R]) => c.scanInstalled!(scanContext({ tree, roots }));
  it("root and direct subfolders; title from file, else folder, else EA <id>", async () => {
    const r = await scan({
      [`${R}\\${DATA}`]: current(["10"], [["en_US", "Root Game"]]),
      [`${R}\\Folder Game\\${DATA}`]: current(["20"], []),
      [`${R}\\Legacy\\${DATA}`]: legacy,
      [`${R}\\NoFile\\readme.txt`]: "",
      [`${R}\\Deep\\Inner\\${DATA}`]: current(["40"]),
    });
    expect(r.entries.map((e) => [e.storeGameId, e.title, e.installPath])).toEqual([
      ["10", "Root Game", R],
      ["20", "Folder Game", `${R}\\Folder Game`],
      ["FAKE.OFB.EAX.0001", "Fake Legacy", `${R}\\Legacy`],
    ]);
    expect(r.unreadableRoots).toEqual([]);
  });
  it("a file over 1 MiB counts as invalid and the rest of the root is kept; a root-as-candidate that escapes is skipped, not unreadable", async () => {
    const ctx = scanContext({ tree: { [`${R}\\A\\${DATA}`]: current(["1"]), [`${R}\\B\\${DATA}`]: "x".repeat(1024 * 1024 + 1) }, roots: [R] });
    const r = await c.scanInstalled!(ctx);
    expect(r.entries.map((e) => e.storeGameId)).toEqual(["1"]);
    expect(r.unreadableRoots).toEqual([]);
    const ctx2 = scanContext({ tree: { [`${R}\\A\\${DATA}`]: current(["1"]), [`${R}\\${DATA}`]: current(["2"]) }, roots: [R] });
    const esc = { ...ctx2, fs: { ...ctx2.fs, exists: async (p: string) => { if (p === `${R}\\${DATA}`) throw new PathEscapesRootsError(); return ctx2.fs.exists(p); } } };
    const r2 = await c.scanInstalled!(esc);
    expect(r2.entries.map((e) => e.storeGameId)).toEqual(["1"]);
    expect(r2.unreadableRoots).toEqual([]);
  });
  it("a folder named installerdata.xml is an invalid file and the root stays readable; an escaping readDir makes the root unreadable", async () => {
    const r = await scan({ [`${R}\\A\\${DATA}\\x`]: "", [`${R}\\B\\${DATA}`]: current(["2"]) });
    expect(r.entries.map((e) => e.storeGameId)).toEqual(["2"]);
    expect(r.unreadableRoots).toEqual([]);
    const ctx = scanContext({ tree: { [`${R}\\${DATA}`]: current(["1"]) }, roots: [R] });
    const esc = { ...ctx, fs: { ...ctx.fs, readDir: async () => { throw new PathEscapesRootsError(); } } };
    expect(await c.scanInstalled!(esc)).toMatchObject({ entries: [], unreadableRoots: [{ code: "scan.root-unreadable" }] });
  });
  it("subfolders are visited in order, case-insensitively", async () => {
    const r = await scan({ [`${R}\\Z\\${DATA}`]: current(["z"]), [`${R}\\b\\${DATA}`]: current(["b"]), [`${R}\\M\\${DATA}`]: current(["m"]) });
    expect(r.entries.map((e) => e.storeGameId)).toEqual(["b", "m", "z"]);
  });
  it("invalid file and repeated id are skipped without paths in the log", async () => {
    const ctx = scanContext({ tree: { [`${R}\\A\\${DATA}`]: "<nope>", [`${R}\\B\\${DATA}`]: current(["5"]), [`${R}\\C\\${DATA}`]: current(["5", "6"]) }, roots: [R] });
    const r = await c.scanInstalled!(ctx);
    expect(r.entries.map((e) => e.storeGameId)).toEqual(["5"]);
    expect(JSON.stringify(ctx.logs)).not.toContain("EA Games");
  });
  it("a missing root is unreadable and keeps no entry; an unreadable file marks the root unreadable but keeps the rest", async () => {
    expect(await scan({}, [R])).toMatchObject({ entries: [], unreadableRoots: [{ code: "scan.root-unreadable" }] });
    const ctx = scanContext({ tree: { [`${R}\\A\\${DATA}`]: current(["1"]), [`${R}\\B\\${DATA}`]: current(["2"]) }, roots: [R] });
    const bad = { ...ctx, fs: { ...ctx.fs, readText: async (p: string) => { if (p.includes("\\B\\")) throw new ConnectorError("scan.root-unreadable", "locked"); return ctx.fs.readText(p); } } };
    const r = await c.scanInstalled!(bad);
    expect(r.entries.map((e) => e.storeGameId)).toEqual(["1"]);
    expect(r.unreadableRoots).toHaveLength(1);
  });
  it("a non-handled error propagates", async () => {
    const ctx = scanContext({ tree: { [`${R}\\A\\${DATA}`]: current(["1"]) }, roots: [R] });
    const bad = { ...ctx, fs: { ...ctx.fs, exists: async () => { throw new Error("boom"); } } };
    await expect(c.scanInstalled!(bad)).rejects.toThrow("boom");
  });
});

describe("resolveAction (ADR 81)", () => {
  const G = `${R}\\A`;
  const launchers = [{ declarationId: "ea-desktop", path: APP }];
  const prop = (id: string | null, installPath: string | null = G): StoredProperty => ({ storeGameId: id, installed: true, installPath, launchData: null });
  const ctxOf = (file: string | null, app = true) =>
    launchContext({ launchers, installPaths: [G], tree: { [`${APP}\\`]: "", ...(app ? { [`${APP}\\EALauncher.exe`]: "" } : {}), ...(file === null ? { [`${G}\\`]: "" } : { [`${G}\\${DATA}`]: file }) } });
  const play = (p: StoredProperty, ctx = ctxOf(current(["1", "2", "3"]))) => c.resolveAction(p, "play", ctx);
  it("all ids of the file, the stored one first", async () => {
    expect(await play(prop("2"))).toEqual({ kind: "uri", uri: "origin2://game/launch?offerIds=2,1,3" });
  });
  it("other actions and a null id give null", async () => {
    expect(await c.resolveAction(prop("1"), "open-store-page", ctxOf(null))).toBeNull();
    expect(await play(prop(null))).toBeNull();
  });
  it.each(["a b", "x&y", "1,2", "-1", "é", "", "a".repeat(65), "1\n"])("invalid stored id %j", async (id) => {
    await expect(play(prop(id))).rejects.toMatchObject({ code: "action.unsupported", details: { messageKey: "connectors.ea.errors.invalidId" } });
  });
  it("no install path: not-installed", async () => {
    await expect(play(prop("1", null))).rejects.toMatchObject({ code: "launch.not-installed" });
  });
  it("app missing: launcher-missing without paths; unreadable check or launchersResolved false do not block", async () => {
    const err = await play(prop("1"), ctxOf(current(["1"]), false)).catch((e: unknown) => e);
    expect(err).toMatchObject({ code: "launch.launcher-missing", details: { messageKey: "connectors.ea.errors.launcherMissing" } });
    expect(JSON.stringify((err as { details: unknown }).details) + (err as Error).message).not.toContain("Program Files");
    const ctx = ctxOf(current(["1"]), false);
    const real = ctx.fs.exists;
    const bad = { ...ctx, fs: { ...ctx.fs, exists: async (p: string) => { if (p.includes("Electronic Arts")) throw new ConnectorError("scan.root-unreadable", "denied"); return real(p); } } };
    expect(await play(prop("1"), bad)).toEqual({ kind: "uri", uri: "origin2://game/launch?offerIds=1" });
    const off = launchContext({ launchersResolved: false, installPaths: [G], tree: { [`${G}\\${DATA}`]: current(["1"]) } });
    expect(await play(prop("1"), off)).toEqual({ kind: "uri", uri: "origin2://game/launch?offerIds=1" });
  });
  it("file gone or another game in the folder: not-installed", async () => {
    for (const ctx of [ctxOf(null), ctxOf(current(["9"]))]) {
      await expect(play(prop("1"), ctx)).rejects.toMatchObject({ code: "launch.not-installed", details: { messageKey: "connectors.ea.errors.installerDataMissing" } });
    }
  });
  it("invalid or unreadable file: only the stored id", async () => {
    expect(await play(prop("1"), ctxOf("<nope>"))).toEqual({ kind: "uri", uri: "origin2://game/launch?offerIds=1" });
    const ctx = ctxOf(current(["1", "2"]));
    const bad = { ...ctx, fs: { ...ctx.fs, readText: async () => { throw new ConnectorError("scan.root-unreadable", "locked"); } } };
    expect(await play(prop("1"), bad)).toEqual({ kind: "uri", uri: "origin2://game/launch?offerIds=1" });
  });
  it("the stored id past the 16th is found in the whole list and goes first; the others are distinct from it", async () => {
    const ids = Array.from({ length: 20 }, (_, i) => `F${i}`);
    const r = await play(prop("F18"), ctxOf(current(ids)));
    const list = (r as { uri: string }).uri.split("offerIds=")[1]!.split(",");
    expect(list).toHaveLength(16);
    expect(list[0]).toBe("F18");
    expect(list.filter((x) => x === "F18")).toHaveLength(1);
  });
  it("exists true but readText fails: stored id only; exists fails: stored id only", async () => {
    const ctx = ctxOf(current(["1", "2"]));
    const badRead = { ...ctx, fs: { ...ctx.fs, readText: async () => { throw new ConnectorError("store.unexpected-response", "big"); } } };
    expect(await play(prop("1"), badRead)).toEqual({ kind: "uri", uri: "origin2://game/launch?offerIds=1" });
    const real = ctx.fs.exists;
    const badExists = { ...ctx, fs: { ...ctx.fs, exists: async (p: string) => { if (p.endsWith("installerdata.xml")) throw new ConnectorError("scan.root-unreadable", "denied"); return real(p); } } };
    expect(await play(prop("1"), badExists)).toEqual({ kind: "uri", uri: "origin2://game/launch?offerIds=1" });
  });
  it("the final assertion pattern accepts 1 to 16 ids and rejects & # = % empty and 17", () => {
    const u = (ids: string[]) => `origin2://game/launch?offerIds=${ids.join(",")}`;
    expect(URI_RE.test(u(["a"]))).toBe(true);
    expect(URI_RE.test(u(Array.from({ length: 16 }, (_, i) => `i${i}`)))).toBe(true);
    expect(URI_RE.test(u(Array.from({ length: 17 }, (_, i) => `i${i}`)))).toBe(false);
    for (const bad of ["a&b", "a#b", "a=b", "a%41", "", "a,,b", "a b"]) expect(URI_RE.test(u([bad]))).toBe(false);
    expect(URI_RE.test(u(["a", ""]))).toBe(false);
  });
  it("ids from the file with unsafe characters never reach the uri", async () => {
    const uri = await play(prop("1"), ctxOf(current(["1", "x&autoDownload=1", "a/b", "2"])));
    expect(uri).toEqual({ kind: "uri", uri: "origin2://game/launch?offerIds=1,2" });
  });
});

describe("discoverRoots (ADR 81, EAD6)", () => {
  const U = "C:\\Users\\x\\AppData\\Local\\Electronic Arts\\EA Desktop";
  const M = "C:\\ProgramData\\EA Desktop";
  const locs = [
    { declarationId: "ea-libraries", path: R },
    { declarationId: "ea-settings", path: U },
    { declarationId: "ea-settings", path: M },
  ];
  const run = async (tree: Record<string, string>) => {
    const ctx = discoveryContext({ tree, locations: locs });
    return { paths: (await c.discoverRoots!(ctx)).map((r) => r.path), ctx };
  };
  const ini = (v: string) => `user.language=en\r\nuser.downloadinplacedir=${v}\r\nuser.x=1\r\n`;
  const scan = (tree: Record<string, string>, roots: string[]) => c.scanInstalled!(scanContext({ tree, roots }));

  it("known folders plus the value of machine.ini and user_N.ini; settings folders never come out", async () => {
    const { paths } = await run({
      [`${M}\\machine.ini`]: "machine.downloadinplacedir=C:\\Program Files\\EA Games\\\n",
      [`${U}\\user_123.ini`]: ini("F:\\"),
      [`${U}\\user_456.ini`]: ini("D:\\Games\\EA\\"),
      [`${U}\\other.ini`]: ini("E:\\"),
      [`${U}\\user_x.ini`]: ini("E:\\"),
    });
    expect(paths).toEqual([R, "F:\\", "D:\\Games\\EA"]); // R repeated (trailing slash): once
    expect(paths).not.toContain(U);
    expect(paths).not.toContain(M);
  });
  it("without the key, invalid paths (UNC, .., relative, quotes) and absent files give nothing", async () => {
    for (const v of ["\\\\srv\\share", "C:\\a\\..\\b", "games", "F:", "F:/x", '"F:\\"', ""]) {
      const { paths, ctx } = await run({ [`${U}\\user_1.ini`]: ini(v) });
      expect(paths).toEqual([R]);
      expect(JSON.stringify(ctx.logs)).not.toContain("user_1");
    }
    expect((await run({ [`${U}\\user_1.ini`]: "user.language=en" })).paths).toEqual([R]);
    expect((await run({ [`${U}\\`]: "", [`${M}\\`]: "" })).paths).toEqual([R]);
  });
  it("a file over 64 KiB is unreadable (the core keeps the saved roots); at most 16 files are read", async () => {
    const tree: Record<string, string> = { [`${M}\\`]: "", [`${U}\\user_1.ini`]: ini("F:\\") + "x".repeat(65 * 1024) };
    for (let i = 2; i <= 20; i++) tree[`${U}\\user_${i}.ini`] = ini(`G:\\L${i}`);
    const ctx0 = discoveryContext({ tree, locations: locs });
    await expect(c.discoverRoots!(ctx0)).rejects.toMatchObject({ code: "scan.root-unreadable" });
    delete tree[`${U}\\user_1.ini`];
    const { paths, ctx } = await run(tree);
    expect(paths).not.toContain("F:\\");
    expect(paths).toHaveLength(1 + 16); // R + the first 16 names in sort order (user_10…user_6), all valid; user_7… are not read
    expect(JSON.stringify(ctx.logs)).not.toMatch(/user_\d/);
  });
  it("an unreadable settings folder fails with scan.root-unreadable; other errors propagate", async () => {
    const ctx = discoveryContext({ tree: { [`${U}\\user_1.ini`]: ini("F:\\") }, locations: locs });
    const bad = { ...ctx, fs: { ...ctx.fs, readDir: async () => { throw new ConnectorError("scan.root-unreadable", "denied"); } } };
    await expect(c.discoverRoots!(bad)).rejects.toMatchObject({ code: "scan.root-unreadable" }); // the core keeps the saved roots
    const boom = { ...ctx, fs: { ...ctx.fs, readDir: async () => { throw new Error("boom"); } } };
    await expect(c.discoverRoots!(boom)).rejects.toThrow("boom");
  });
  it("scans F:\\SteamWorld Dig from the root F:\\", async () => {
    const r = await scan({ [`F:\\SteamWorld Dig\\${DATA}`]: current(["1000"], [["en_US", "SteamWorld Dig"]]) }, ["F:\\"]);
    expect(r.entries).toEqual([{ storeGameId: "1000", kind: "game", title: "SteamWorld Dig", installPath: "F:\\SteamWorld Dig" }]);
    expect(r.unreadableRoots).toEqual([]);
  });
});
