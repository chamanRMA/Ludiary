import { assertConnectorConformance, discoveryContext, launchContext, scanContext } from "@ludiary/connector-testkit";
import { checkConnectorManifest } from "@ludiary/contracts";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import en from "../locales/en.json";
import es from "../locales/es.json";
import { createGogConnector } from "../src";
import { GAME, gameInfo } from "./helpers";

const c = createGogConnector();
const tree = { [`${GAME}\\goggame-1000000001.info`]: gameInfo("1000000001") };

describe("GOG manifest (ADR 76)", () => {
  it("is valid with the agreed capabilities", () => {
    expect(checkConnectorManifest(c)).toEqual([]);
    expect(c.access).toBe("unofficial-api");
    expect(c.capabilities).toMatchObject({ library: false, scan: true, dlc: "none", actions: ["play"], launchKinds: ["exec"], uriSchemes: [] });
    expect(c.minSyncIntervalMs).toBe(1_800_000);
    expect(c.apiHosts).toEqual(["gamesdb.gog.com"]);
    expect(c.mediaHosts).toEqual(["images.gog.com"]);
    expect(c.locations.map((l) => [l.id, l.purpose])).toEqual([
      ["gog-games", "scan"],
      ["gog-library", "scan"],
    ]);
  });
  it("catalogs match and every used key exists", () => {
    expect(Object.keys(es).sort()).toEqual(Object.keys(en).sort());
    const dir = join(__dirname, "..", "src");
    for (const f of readdirSync(dir)) {
      const src = readFileSync(join(dir, f), "utf8");
      for (const m of src.matchAll(/fail\("[a-z.-]+", "([A-Za-z]+)"/g)) expect(`connectors.gog.errors.${m[1]}` in en, m[1]).toBe(true);
    }
  });
  it("passes the shared conformance check", async () => {
    await assertConnectorConformance(c, {
      scan: () => scanContext({ tree, roots: [GAME] }),
      discovery: () => discoveryContext({ locations: [{ declarationId: "gog-games", path: GAME }] }),
      launch: {
        ctx: () => launchContext({ tree, installPaths: [GAME] }),
        properties: [{ storeGameId: "1000000001", installed: true, installPath: GAME, launchData: null }],
      },
      catalogs: { es, en },
    });
  });
});
