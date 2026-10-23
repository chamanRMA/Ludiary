import { discoveryContext, scanContext } from "@ludiary/connector-testkit";
import { ConnectorError, type ResolvedLocation, type ScanRoot } from "@ludiary/contracts";
import { describe, expect, it } from "vitest";
import { createUbisoftConnector } from "../src";

const c = createUbisoftConnector();
const U = "D:\\Ubisoft Games";
const loc = (subkey: string | undefined, path: string, declarationId = "ubisoft-installs"): ResolvedLocation => ({
  declarationId,
  path,
  ...(subkey !== undefined ? { subkey } : {}),
});
const discover = (locations: ResolvedLocation[]) => {
  const ctx = discoveryContext({ locations });
  return c.discoverRoots!(ctx).then((roots) => ({ roots, ctx }));
};
const root = (id: string, path: string, tag = `game-${id}`): ScanRoot => ({ origin: "discovered", declarationId: "ubisoft-installs", path, tag });

describe("discoverRoots (ADR 79)", () => {
  it("one root per game with the id in the tag, ordered by id; '/' and trailing slash normalised", async () => {
    const { roots } = await discover([loc("900002", "D:/Ubisoft Games/Fake Two/"), loc("900001", `${U}\\Fake One`)]);
    expect(roots).toEqual([
      { declarationId: "ubisoft-installs", path: `${U}\\Fake One`, tag: "game-900001" },
      { declarationId: "ubisoft-installs", path: `${U}\\Fake Two`, tag: "game-900002" },
    ]);
  });
  it.each([undefined, "0", "abc", "0900001", "12345678901", " 900001", "900001 ", "9\n"])("skips subkey %j", async (k) => {
    const { roots } = await discover([loc(k, `${U}\\A`)]);
    expect(roots).toEqual([]);
  });
  it("skips bad paths (and a drive root) without throwing, counting them without paths", async () => {
    const { roots, ctx } = await discover([loc("900001", "D:\\"), loc("900002", "\\\\srv\\share\\x"), loc("900003", `${U}\\CON`), loc("900004", `${U}\\Ok`)]);
    expect(roots.map((r) => r.tag)).toEqual(["game-900004"]);
    expect(ctx.logs.some((l) => l.fields?.invalidPaths === 3)).toBe(true);
    expect(JSON.stringify(ctx.logs)).not.toContain("Ubisoft Games");
  });
  it("same folder with different case keeps the lowest id", async () => {
    const { roots, ctx } = await discover([loc("900005", `${U}\\Same`), loc("900003", `${U.toUpperCase()}\\SAME`)]);
    expect(roots.map((r) => r.tag)).toEqual(["game-900003"]);
    expect(JSON.stringify(ctx.logs)).toContain("900005");
  });
  it("ignores other declarations", async () => {
    const { roots } = await discover([loc("900001", `${U}\\A`, "ubisoft-launcher")]);
    expect(roots).toEqual([]);
  });
});

describe("scanInstalled (ADR 79)", () => {
  const A = `${U}\\Fake One`;
  const run = (roots: ScanRoot[], opts: { tree?: Record<string, string>; unreadable?: string[] } = {}) =>
    c.scanInstalled!(scanContext({ tree: opts.tree ?? { [`${A}\\`]: "" }, roots }));
  it("an existing folder gives an entry titled with the folder name, no media or launchData", async () => {
    const r = await run([root("900001", A)]);
    expect(r.entries).toEqual([{ storeGameId: "900001", kind: "game", title: "Fake One", installPath: A }]);
    expect(r.unreadableRoots).toEqual([]);
  });
  it("a missing folder gives no entry and is not unreadable", async () => {
    const r = await run([root("900001", `${U}\\Gone`)]);
    expect(r).toEqual({ entries: [], unreadableRoots: [] });
  });
  it("ignores user roots and roots without a valid tag", async () => {
    const r = await run([{ origin: "user", path: A }, root("900001", A, "library"), root("900001", A, "game-abc"), root("900001", A, "game-0900001")]);
    expect(r.entries).toEqual([]);
    expect(r.unreadableRoots).toEqual([]);
  });
  it("a repeated id is skipped", async () => {
    const r = await run([root("900001", A), root("900001", A)]);
    expect(r.entries).toHaveLength(1);
  });
  it("titles: control characters, blank, non ASCII, long", async () => {
    const t = async (folder: string) => {
      const p = `${U}\\${folder}`;
      return (await run([root("900001", p)], { tree: { [`${p}\\`]: "" } })).entries[0]?.title;
    };
    expect(await t("Fake\u0007 Game")).toBe("Fake Game");
    expect(await t("ŌKAMI Ñandú 大神")).toBe("ŌKAMI Ñandú 大神");
    expect(await t("x".repeat(250))).toBe("x".repeat(200));
    const blank = `${U}\\\u0007\u0008`;
    expect((await run([root("900001", blank)], { tree: { [`${blank}\\`]: "" } })).entries[0]?.title).toBe("Ubisoft 900001");
  });
  it("unreadable and escaping folders go to unreadableRoots; other errors propagate", async () => {
    const r = scanContext({ tree: { [`${A}\\`]: "" }, roots: [root("900001", A)] });
    const failing = (e: unknown) => ({ ...r, fs: { ...r.fs, exists: async () => { throw e; } } });
    const out = await c.scanInstalled!(failing(new ConnectorError("scan.root-unreadable", "x")));
    expect(out.unreadableRoots).toEqual([{ root: root("900001", A), code: "scan.root-unreadable" }]);
    expect(out.entries).toEqual([]);
    await expect(c.scanInstalled!(failing(new ConnectorError("internal", "bug")))).rejects.toMatchObject({ code: "internal" });
    await expect(c.scanInstalled!(failing(new Error("boom")))).rejects.toThrow("boom");
  });
});
