import { launchContext } from "@ludiary/connector-testkit";
import type { StoredProperty } from "@ludiary/contracts";
import { describe, expect, it } from "vitest";
import { createGogConnector } from "../src";
import { splitWindowsArgs } from "../src/args";
import { GAME, gameInfo, info, quote, task } from "./helpers";

const c = createGogConnector();
const prop = (id: string | null, installPath: string | null = GAME): StoredProperty => ({ storeGameId: id, installed: true, installPath, launchData: null });
const play = (tasks: unknown, id = "1000000001") =>
  c.resolveAction(
    prop(id),
    "play",
    launchContext({ tree: { [`${GAME}\\goggame-${id}.info`]: info({ gameId: id, playTasks: tasks }) }, installPaths: [GAME] }),
  );
const key = (k: string) => ({ details: { messageKey: `connectors.gog.errors.${k}` } });

describe("resolveAction (ADR 76)", () => {
  it("exec of the primary FileTask with split arguments and cwd", async () => {
    expect(
      await play([
        { isPrimary: false, type: "FileTask", path: "other.exe" },
        { isPrimary: true, type: "URLTask", link: "https://x" },
        task("bin\\game.exe", { workingDir: "bin", arguments: '-cfg "my file.ini" -v' }),
        task("second.exe"),
      ]),
    ).toEqual({ kind: "exec", executable: `${GAME}\\bin\\game.exe`, args: ["-cfg", "my file.ini", "-v"], cwd: `${GAME}\\bin` });
  });
  it("type may be absent; empty workingDir means installPath; no arguments means none", async () => {
    expect(await play([{ isPrimary: true, path: "G.EXE", workingDir: "" }])).toEqual({
      kind: "exec",
      executable: `${GAME}\\G.EXE`,
      args: [],
      cwd: GAME,
    });
  });
  it("no primary FileTask", async () => {
    for (const t of [[], [{ isPrimary: false, type: "FileTask", path: "a.exe" }], [{ isPrimary: true, type: "URLTask", path: "a.exe" }]]) {
      await expect(play(t)).rejects.toMatchObject({ code: "action.unsupported", ...key("noPlayTask") });
    }
  });
  it("refuses absolute, drive, UNC and ':' paths, and non-.exe", async () => {
    for (const p of ["C:\\x\\a.exe", "\\a.exe", "/a.exe", "\\\\srv\\s\\a.exe", "a:b.exe", "a\u0001.exe", ""]) {
      await expect(play([task(p)]), p).rejects.toMatchObject({ code: "action.unsupported" });
    }
    for (const p of ["a.bat", "a.lnk", "a.cmd", "exe"]) {
      await expect(play([task(p)]), p).rejects.toMatchObject(key("unsupportedExecutable"));
    }
    await expect(play([task("a.exe", { workingDir: "C:\\x" })])).rejects.toMatchObject({ code: "action.unsupported" });
  });
  it("more than 64 arguments", async () => {
    await expect(play([task("a.exe", { arguments: Array(65).fill("x").join(" ") })])).rejects.toMatchObject({ code: "action.unsupported" });
    const ok = (await play([task("a.exe", { arguments: Array(64).fill("x").join(" ") })])) as { args: readonly string[] };
    expect(ok.args).toHaveLength(64);
  });
  it("missing .info or install path -> launch.not-installed, without paths in the error", async () => {
    const err = await c.resolveAction(prop("1000000001"), "play", launchContext({ installPaths: [GAME] })).catch((e: unknown) => e);
    expect(err).toMatchObject({ code: "launch.not-installed" });
    expect(JSON.stringify((err as { details: unknown }).details)).not.toContain("Games");
    expect(JSON.stringify((err as Error).message)).not.toContain("Games");
    await expect(c.resolveAction(prop("1000000001", null), "play", launchContext({}))).rejects.toMatchObject({ code: "launch.not-installed" });
  });
  it("malformed .info -> store.unexpected-response", async () => {
    const ctx = launchContext({ tree: { [`${GAME}\\goggame-1000000001.info`]: "{" }, installPaths: [GAME] });
    await expect(c.resolveAction(prop("1000000001"), "play", ctx)).rejects.toMatchObject({ code: "store.unexpected-response" });
  });
  it("non-numeric ids, null id and other actions", async () => {
    for (const id of ["abc", "1;calc", "../1", "", "1".repeat(21)]) {
      await expect(c.resolveAction(prop(id), "play", launchContext({}))).rejects.toMatchObject(key("invalidId"));
    }
    expect(await c.resolveAction(prop(null), "play", launchContext({}))).toBeNull();
    const ctx = launchContext({ tree: { [`${GAME}\\goggame-1000000001.info`]: gameInfo("1000000001") }, installPaths: [GAME] });
    expect(await c.resolveAction(prop("1000000001"), "open-store-page", ctx)).toBeNull();
  });
  it("a '..' segment in path or workingDir is invalidTask", async () => {
    for (const t of [task("..\\..\\GalaxyClient.exe"), task("a/../../b.exe"), task("a.exe", { workingDir: "..\\x" })]) {
      await expect(play([t])).rejects.toMatchObject({ code: "action.unsupported", ...key("invalidTask") });
    }
  });
});

describe("resolveAction install (ADR 77, point 7)", () => {
  const GALAXY = "F:\\GOG Galaxy";
  const galaxy = [{ declarationId: "gog-galaxy-client", path: GALAXY }];
  const install = (id: string, ctx: ReturnType<typeof launchContext>) => c.resolveAction(prop(id, null), "install", ctx);
  it("opens the game page in Galaxy", async () => {
    const ctx = launchContext({ launchers: galaxy, tree: { [`${GALAXY}\\GalaxyClient.exe`]: "" } });
    expect(await install("1512372112", ctx)).toEqual({ kind: "uri", uri: "goggalaxy://openGameView/1512372112" });
  });
  it("Galaxy missing with launchersResolved is launcher-missing; unresolved still gives the URI", async () => {
    await expect(install("1", launchContext({}))).rejects.toMatchObject({ code: "launch.launcher-missing", ...key("galaxyMissing") });
    await expect(install("1", launchContext({ launchers: galaxy }))).rejects.toMatchObject({ code: "launch.launcher-missing" });
    expect(await install("1", launchContext({ launchersResolved: false }))).toEqual({ kind: "uri", uri: "goggalaxy://openGameView/1" });
  });
  it("non-numeric id", async () => {
    await expect(install("1;calc", launchContext({ launchersResolved: false }))).rejects.toMatchObject(key("invalidId"));
  });
});

describe("resolveAction play through Galaxy (ADR 76, points 12 and 13.4)", () => {
  const GALAXY = "C:\\Program Files (x86)\\GOG Galaxy";
  const galaxy = [{ declarationId: "gog-galaxy-client", path: GALAXY }];
  const withGalaxy = { [`${GALAXY}\\GalaxyClient.exe`]: "" };
  const direct = { kind: "exec", executable: `${GAME}\\game.exe`, args: [], cwd: GAME };
  const infoText = info({ gameId: "1000000001", playTasks: [task("game.exe")] });
  const infoTree = (dir: string): Record<string, string> => ({ [`${dir}\\goggame-1000000001.info`]: infoText });
  const run = async (
    mode: "client" | "direct" | undefined,
    o: { installPath?: string; launchers?: typeof galaxy; resolved?: boolean; galaxyExe?: boolean } = {},
  ) => {
    const installPath = o.installPath ?? GAME;
    const ctx = launchContext({
      launchers: o.launchers ?? galaxy,
      launchersResolved: o.resolved ?? true,
      tree: { ...infoTree(installPath), ...(o.galaxyExe === false ? {} : withGalaxy) },
      installPaths: [installPath],
    });
    const spec = await c.resolveAction(prop("1000000001", installPath), "play", mode === undefined ? ctx : { ...ctx, launchMode: mode });
    return { spec, ctx };
  };
  const argsOf = (spec: unknown): string[] => (spec as { args: string[] }).args;

  it("client with Galaxy gives the exact command", async () => {
    expect((await run("client")).spec).toEqual({
      kind: "exec",
      executable: `${GALAXY}\\GalaxyClient.exe`,
      args: ["/launchViaAutostart", "/gameId=1000000001", "/command=runGame", `/path=${GAME}`],
      cwd: GALAXY,
    });
  });
  it("does not read the .info (a game without play task still opens)", async () => {
    const ctx = launchContext({ launchers: galaxy, tree: withGalaxy, installPaths: [GAME] });
    const spec = await c.resolveAction(prop("1000000001"), "play", { ...ctx, launchMode: "client" });
    expect(spec).toMatchObject({ kind: "exec", cwd: GALAXY });
  });
  it("spaces and n-tilde stay unquoted; trailing separator removed except on a drive root", async () => {
    const p = "F:\\GOG Galaxy\\Games ñ\\Cold Waters";
    expect(argsOf((await run("client", { installPath: `${p}\\` })).spec)[3]).toBe(`/path=${p}`);
    expect(argsOf((await run("client", { installPath: "D:\\" })).spec)[3]).toBe("/path=D:\\");
  });
  it("quoting round trip: what Node quotes equals Playnite's /path=\"...\"", () => {
    const p = "F:\\GOG Galaxy\\Games ñ\\Cold Waters";
    expect(splitWindowsArgs(quote(`/path=${p}`))).toEqual(splitWindowsArgs(`/path="${p}"`));
    expect(splitWindowsArgs(quote(`/path=${p}`))).toEqual([`/path=${p}`]);
  });
  it("client falls back to direct, with an info log, when Galaxy cannot be proved", async () => {
    for (const o of [{ resolved: false }, { launchers: [] }, { galaxyExe: false }]) {
      const { spec, ctx } = await run("client", o);
      expect(spec).toEqual(direct);
      expect(ctx.logs).toEqual([{ level: "info", msg: "Galaxy not found, launching directly", fields: { connector: "gog" } }]);
    }
  });
  it("direct mode and no mode ignore Galaxy, without logging", async () => {
    for (const m of ["direct", undefined] as const) {
      const { spec, ctx } = await run(m);
      expect(spec).toEqual(direct);
      expect(ctx.logs).toEqual([]);
    }
  });
  it("an installPath with a space before '-' or '/' opens directly (13.4)", async () => {
    for (const installPath of ["C:\\Games\\X -foo", "C:\\Games\\X /command=y"]) {
      expect((await run("client", { installPath })).spec).toMatchObject({ kind: "exec", executable: expect.stringMatching(/game\.exe$/) });
    }
  });
});
