import { assertConnectorConformance, discoveryContext, launchContext, scanContext } from "@ludiary/connector-testkit";
import { checkConnectorManifest } from "@ludiary/contracts";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import en from "../locales/en.json";
import es from "../locales/es.json";
import { createGogConnector } from "../src";
import { GOG_CLIENT_SECRET } from "../src/auth";
import { GAME, gameInfo } from "./helpers";

const c = createGogConnector();
const tree = { [`${GAME}\\goggame-1000000001.info`]: gameInfo("1000000001") };

describe("GOG manifest (ADR 76)", () => {
  it("is valid with the agreed capabilities", () => {
    expect(checkConnectorManifest(c)).toEqual([]);
    expect(c.access).toBe("unofficial-api");
    expect(c.capabilities).toMatchObject({ library: true, scan: true, dlc: "library-and-scan", actions: ["play", "install"], launchKinds: ["exec", "uri"], uriSchemes: ["goggalaxy"] });
    expect(c.minSyncIntervalMs).toBe(1_800_000);
    expect(c.apiHosts).toEqual(["auth.gog.com", "embed.gog.com", "api.gog.com", "gamesdb.gog.com"]);
    expect(c.mediaHosts).toEqual(["images.gog.com"]);
    expect(c.locations.map((l) => [l.id, l.purpose])).toEqual([
      ["gog-games", "scan"],
      ["gog-library", "scan"],
      ["gog-galaxy-client", "launcher"],
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
  it("the Galaxy client_secret appears in no file of connectors/ except src/auth.ts", () => {
    const root = join(__dirname, "..", "..");
    const hits: string[] = [];
    const walk = (d: string): void => {
      for (const e of readdirSync(d, { withFileTypes: true })) {
        if (e.name === "node_modules" || e.name.startsWith(".")) continue;
        const f = join(d, e.name);
        if (e.isDirectory()) walk(f);
        else if (readFileSync(f, "utf8").includes(GOG_CLIENT_SECRET)) hits.push(f.slice(root.length + 1).replace(/\\/g, "/"));
      }
    };
    walk(root);
    expect(hits).toEqual(["gog/src/auth.ts"]);
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
