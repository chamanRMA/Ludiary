import { assertConnectorConformance, discoveryContext, launchContext, scanContext } from "@ludiary/connector-testkit";
import { checkConnectorManifest } from "@ludiary/contracts";
import { describe, expect, it } from "vitest";
import en from "../locales/en.json";
import es from "../locales/es.json";
import { createUbisoftConnector } from "../src";

const c = createUbisoftConnector();
const GAME = "D:\\Ubisoft Games\\Fake One";
const UBI = "C:\\Program Files (x86)\\Ubisoft\\Ubisoft Game Launcher";

describe("Ubisoft manifest (ADR 79)", () => {
  it("is valid with the agreed capabilities and no network", () => {
    expect(checkConnectorManifest(c)).toEqual([]);
    expect(c.access).toBe("local-only");
    expect(c.capabilities).toMatchObject({ library: false, scan: true, dlc: "none", actions: ["play"], launchKinds: ["uri"], uriSchemes: ["uplay"] });
    expect([c.authHosts, c.apiHosts, c.mediaHosts]).toEqual([[], [], []]);
    expect(c.connection).toBeUndefined();
    expect(c.listLibrary).toBeUndefined();
    expect(c.resolveMedia).toBeUndefined();
    expect(c.locations.map((l) => [l.id, l.purpose, l.sources.length])).toEqual([
      ["ubisoft-installs", "scan", 2],
      ["ubisoft-launcher", "launcher", 2],
    ]);
  });
  it("catalogs match and carry the autodetection notice", () => {
    expect(Object.keys(es).sort()).toEqual(Object.keys(en).sort());
    expect(es).toHaveProperty(["connectors.ubisoft.needsAutoDetection"]);
  });
  it("passes the shared conformance check", async () => {
    await assertConnectorConformance(c, {
      scan: () => scanContext({ tree: { [`${GAME}\\`]: "" }, roots: [{ origin: "discovered", declarationId: "ubisoft-installs", path: GAME, tag: "game-900001" }] }),
      discovery: () => discoveryContext({ locations: [{ declarationId: "ubisoft-installs", path: GAME, subkey: "900001" }] }),
      launch: {
        ctx: () => launchContext({ launchers: [{ declarationId: "ubisoft-launcher", path: UBI }], tree: { [`${UBI}\\upc.exe`]: "" } }),
        properties: [{ storeGameId: "900001", installed: true, installPath: GAME, launchData: null }],
      },
      catalogs: { es, en },
    });
  });
});
