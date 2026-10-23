import { launchContext } from "@ludiary/connector-testkit";
import type { StoredProperty } from "@ludiary/contracts";
import { describe, expect, it } from "vitest";
import { createUbisoftConnector } from "../src";

const c = createUbisoftConnector();
const UBI = "C:\\Program Files (x86)\\Ubisoft\\Ubisoft Game Launcher";
const launchers = [{ declarationId: "ubisoft-launcher", path: UBI }];
const prop = (id: string | null): StoredProperty => ({ storeGameId: id, installed: true, installPath: null, launchData: null });
const play = (id: string | null, ctx = launchContext({ launchers, tree: { [`${UBI}\\upc.exe`]: "" } })) => c.resolveAction(prop(id), "play", ctx);

describe("resolveAction (ADR 79, 80)", () => {
  it("play gives the exact uri", async () => {
    expect(await play("900001")).toEqual({ kind: "uri", uri: "uplay://launch/900001/0" });
  });
  it("either client executable is enough", async () => {
    const ctx = launchContext({ launchers, tree: { [`${UBI}\\UbisoftConnect.exe`]: "" } });
    expect(await play("900001", ctx)).toEqual({ kind: "uri", uri: "uplay://launch/900001/0" });
  });
  it("install gives the exact uri, with the same launcher check and id validation as play", async () => {
    const ctx = launchContext({ launchers, tree: { [`${UBI}\\upc.exe`]: "" } });
    expect(await c.resolveAction(prop("900001"), "install", ctx)).toEqual({ kind: "uri", uri: "uplay://install/900001" });
    await expect(c.resolveAction(prop("900001"), "install", launchContext({ launchers, tree: {} }))).rejects.toMatchObject({ code: "launch.launcher-missing" });
    await expect(c.resolveAction(prop("9/0"), "install", ctx)).rejects.toMatchObject({ code: "action.unsupported" });
    expect(await c.resolveAction(prop(null), "install", ctx)).toBeNull();
  });
  it("other actions and a null id give null", async () => {
    expect(await c.resolveAction(prop("900001"), "open-store-page", launchContext({}))).toBeNull();
    expect(await play(null)).toBeNull();
  });
  it.each(["abc", "9/0", "9?x", "9%41", "9 1", "12345678901", "0", "09", "", "１２"])("invalid id %j", async (id) => {
    await expect(play(id)).rejects.toMatchObject({ code: "action.unsupported", details: { messageKey: "connectors.ubisoft.errors.invalidId" } });
  });
  it("no client: launcher-missing, with no path in the error", async () => {
    const err = await play("900001", launchContext({ launchers, tree: { [`${UBI}\\`]: "" } })).catch((e: unknown) => e);
    expect(err).toMatchObject({ code: "launch.launcher-missing", details: { messageKey: "connectors.ubisoft.errors.launcherMissing" } });
    expect(JSON.stringify((err as { details: unknown }).details) + (err as Error).message).not.toContain("Program Files");
    await expect(play("900001", launchContext({}))).rejects.toMatchObject({ code: "launch.launcher-missing" });
  });
  it("a read failure does not block the uri", async () => {
    const ctx = launchContext({ launchers, tree: {} });
    const bad = { ...ctx, fs: { ...ctx.fs, exists: async () => { throw new Error("denied"); } } };
    expect(await play("900001", bad)).toEqual({ kind: "uri", uri: "uplay://launch/900001/0" });
  });
  it("a launcher path that breaks the rule does not count as found", async () => {
    const bad = [{ declarationId: "ubisoft-launcher", path: "\\\\srv\\share" }];
    await expect(play("900001", launchContext({ launchers: bad, tree: {} }))).rejects.toMatchObject({ code: "launch.launcher-missing" });
  });
  it("launchersResolved false: uri without checking", async () => {
    const ctx = launchContext({ launchersResolved: false });
    expect(await play("900001", ctx)).toEqual({ kind: "uri", uri: "uplay://launch/900001/0" });
    expect(ctx.files.reads).toEqual([]);
  });
});
