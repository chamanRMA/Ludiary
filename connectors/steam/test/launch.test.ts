import { launchContext } from "@ludiary/connector-testkit";
import { ConnectorError, type StoredProperty } from "@ludiary/contracts";
import { describe, expect, it } from "vitest";
import { createSteamConnector } from "../src";

const c = createSteamConnector();
const EXE = "C:\\Program Files (x86)\\Steam\\steam.exe";
const prop = (id: string | null): StoredProperty => ({ storeGameId: id, installed: true, installPath: null, launchData: null });
const withClient = () => launchContext({ tree: { [EXE]: "" }, launchers: [{ declarationId: "steam-client", path: EXE }] });

describe("resolveAction", () => {
  it("play -> steam://rungameid/<appId>", async () => {
    expect(await c.resolveAction(prop("620"), "play", withClient())).toEqual({ kind: "uri", uri: "steam://rungameid/620" });
  });
  it("install -> steam://install/<appId> (ADR 74)", async () => {
    expect(await c.resolveAction(prop("620"), "install", withClient())).toEqual({ kind: "uri", uri: "steam://install/620" });
    expect(await c.resolveAction(prop(null), "install", withClient())).toBeNull();
    for (const id of ["abc", "1;calc", "../1", "12345678901", ""]) {
      await expect(c.resolveAction(prop(id), "install", withClient())).rejects.toMatchObject({ code: "action.unsupported" });
    }
    await expect(c.resolveAction(prop("1"), "install", launchContext({ launchers: [] }))).rejects.toMatchObject({
      code: "launch.launcher-missing",
    });
  });
  it("open-store-page is not available", async () => {
    expect(await c.resolveAction(prop("620"), "open-store-page", withClient())).toBeNull();
  });
  it("a property without id gives null; non-numeric ids are refused", async () => {
    expect(await c.resolveAction(prop(null), "play", withClient())).toBeNull();
    for (const id of ["abc", "1 2", "1;calc", "../1", "12345678901", "", "0x10", "-1", "１２"]) {
      await expect(c.resolveAction(prop(id), "play", withClient())).rejects.toMatchObject({ code: "action.unsupported" });
    }
  });
  it("missing launcher: error when locations were resolved, ignored otherwise", async () => {
    const err = await c.resolveAction(prop("1"), "play", launchContext({ launchers: [] })).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ConnectorError);
    expect((err as ConnectorError).code).toBe("launch.launcher-missing");
    // A declared launcher whose file does not exist also counts as missing.
    await expect(
      c.resolveAction(prop("1"), "play", launchContext({ launchers: [{ declarationId: "steam-client", path: EXE }] })),
    ).rejects.toMatchObject({ code: "launch.launcher-missing" });
    expect(await c.resolveAction(prop("1"), "play", launchContext({ launchers: [], launchersResolved: false }))).toEqual({
      kind: "uri",
      uri: "steam://rungameid/1",
    });
  });
});
