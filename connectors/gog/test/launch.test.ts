import { launchContext } from "@ludiary/connector-testkit";
import type { StoredProperty } from "@ludiary/contracts";
import { describe, expect, it } from "vitest";
import { createGogConnector } from "../src";
import { GAME, gameInfo, info, task } from "./helpers";

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
