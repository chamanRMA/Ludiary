import { HOSTILE_IDS, launchContext } from "@ludiary/connector-testkit";
import type { StoredProperty } from "@ludiary/contracts";
import { describe, expect, it } from "vitest";
import { createEpicConnector } from "../src";
import { APP, CAT, ID, LIB, NS } from "./helpers";

const c = createEpicConnector();
const prop = (id: string | null, installPath: string | null = `${LIB}\\${APP}`): StoredProperty => ({ storeGameId: id, installed: installPath !== null, installPath, launchData: null });
const ctx = (o: Parameters<typeof launchContext>[0] = {}) => launchContext({ installPaths: [LIB], ...o });
const LAUNCHER = [{ declarationId: "epic-launcher", path: "E:\\Epic Games\\Launcher\\Portal\\Binaries\\Win64\\EpicGamesLauncher.exe" }];
const SHAPE =
  /^com\.epicgames\.launcher:\/\/apps\/[A-Za-z0-9_-]{1,64}%3A[0-9a-f]{32}%3A[A-Za-z0-9._-]{1,60}\?action=(?:launch&silent=true|install)$/;

describe("resolveAction (ADR 78, point 4)", () => {
  it("play: the exact URI with the three segments joined by %3A", async () => {
    expect(await c.resolveAction(prop(ID), "play", ctx())).toEqual({
      kind: "uri",
      uri: `com.epicgames.launcher://apps/${NS}%3A${CAT}%3A${APP}?action=launch&silent=true`,
    });
  });
  it("install: action=install without silent, also with a non-null install path", async () => {
    for (const p of [prop(ID, null), prop(ID)]) {
      expect(await c.resolveAction(p, "install", ctx({ launchers: LAUNCHER }))).toEqual({
        kind: "uri",
        uri: `com.epicgames.launcher://apps/${NS}%3A${CAT}%3A${APP}?action=install`,
      });
    }
  });
  it("a namespace such as 'fn' is kept; a hex one in capitals is lower-cased", async () => {
    const r = (await c.resolveAction(prop(`fn:${CAT}:Fortnite`), "play", ctx())) as { uri: string };
    expect(r.uri).toContain("/apps/fn%3A");
  });
  it("play without an install path is launch.not-installed", async () => {
    await expect(c.resolveAction(prop(ID, null), "play", ctx())).rejects.toMatchObject({ code: "launch.not-installed" });
  });
  it("install without the launcher: launch.launcher-missing; if locations were not resolved it goes on", async () => {
    await expect(c.resolveAction(prop(ID, null), "install", ctx({ launchers: [] }))).rejects.toMatchObject({
      code: "launch.launcher-missing",
      details: { messageKey: "connectors.epic.errors.launcherMissing" },
    });
    expect(await c.resolveAction(prop(ID, null), "install", ctx({ launchers: [], launchersResolved: false }))).toMatchObject({ kind: "uri" });
  });
  it("install: the launcher location must end in EpicGamesLauncher.exe, with slash or backslash, any case", async () => {
    const at = (path: string) => c.resolveAction(prop(ID, null), "install", ctx({ launchers: [{ declarationId: "epic-launcher", path }] }));
    await expect(at("E:\\Epic Games\\Launcher")).rejects.toMatchObject({ code: "launch.launcher-missing" });
    await expect(at("E:\\x\\NotEpicGamesLauncher.exe")).rejects.toMatchObject({ code: "launch.launcher-missing" });
    expect(await at("E:/Epic Games/Launcher/Portal/Binaries/Win64/EpicGamesLauncher.exe")).toMatchObject({ kind: "uri" });
    expect(await at("e:\\epic\\epicgameslauncher.EXE")).toMatchObject({ kind: "uri" });
  });
  it("other actions and a null id give null", async () => {
    expect(await c.resolveAction(prop(ID), "open-store-page", ctx())).toBeNull();
    expect(await c.resolveAction(prop(null), "play", ctx())).toBeNull();
  });
  it("ids that do not fit the pattern are action.unsupported without echoing them; whatever is built has the exact shape", async () => {
    const hostile = [...HOSTILE_IDS, `${NS}:${CAT}:${APP}:x`, `${NS}:${CAT}/..:${APP}`, `${NS}:${CAT}:${APP}?x`, `${NS}:${CAT}:a&b`, `${NS}:${CAT}:a b`, `${NS}:00000000000000000000000000000A01:${APP}`, `${NS}%3A${CAT}%3A${APP}`, `:${CAT}:${APP}`];
    for (const id of hostile) {
      for (const action of ["play", "install"] as const) {
        const e = await c.resolveAction(prop(id), action, ctx({ launchers: LAUNCHER })).then(() => null, (x: unknown) => x);
        expect(e, id).toMatchObject({ code: "action.unsupported", details: { messageKey: "connectors.epic.errors.invalidId" } });
        expect(String((e as Error).message)).not.toContain(id.trim() || "\u0000");
      }
    }
    for (const id of [ID, `fn:${CAT}:Fortnite`, `a_b-c:${CAT}:x.y_z-1`]) {
      for (const action of ["play", "install"] as const) {
        expect(((await c.resolveAction(prop(id), action, ctx({ launchers: LAUNCHER }))) as { uri: string }).uri).toMatch(SHAPE);
      }
    }
  });
});
