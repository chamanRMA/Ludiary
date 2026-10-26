import {
  assertConnectorConformance,
  checkConnectorConformance,
  discoveryContext,
  launchContext,
  scanContext,
} from "@ludiary/connector-testkit";
import { checkConnectorManifest } from "@ludiary/contracts";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import en from "../locales/en.json";
import es from "../locales/es.json";
import { createSteamConnector } from "../src";
import { LIB_D, LIB_E, STEAM_ROOT, steamTree } from "./helpers";

const c = createSteamConnector();
const EXE = "C:\\Program Files (x86)\\Steam\\steam.exe";

describe("Steam manifest (ADR 72, 74)", () => {
  it("is valid and has the agreed capabilities", () => {
    expect(checkConnectorManifest(c)).toEqual([]);
    expect(c.access).toBe("official-api");
    expect(c.capabilities).toMatchObject({
      library: true,
      scan: true,
      dlc: "scan",
      actions: ["play", "install"],
      launchKinds: ["uri"],
      uriSchemes: ["steam"],
      storePlaytime: true,
    });
    expect(c.authHosts).toEqual(["steamcommunity.com"]);
    expect(c.apiHosts).toEqual(["api.steampowered.com", "steamcommunity.com"]);
    expect(c.connection).toBeDefined();
    expect(c.listLibrary).toBeDefined();
    expect(c.minSyncIntervalMs).toBe(600_000);
    expect(c.locations.map((l) => [l.id, l.purpose])).toEqual([
      ["steam-root", "scan"],
      ["steam-client", "launcher"],
    ]);
  });
  it("resolveMedia requires apiHosts", () => {
    expect(checkConnectorManifest({ ...c, apiHosts: [] }).join()).toMatch(/resolveMedia requires apiHosts/);
    const { resolveMedia: _r, ...noMedia } = c;
    expect(checkConnectorManifest({ ...noMedia, apiHosts: [] }).join()).not.toMatch(/resolveMedia/);
  });
  it("declares resolveTitles and the manifest check requires apiHosts and dlc for it (ADR 84)", () => {
    expect(c.resolveTitles).toBeDefined();
    expect(checkConnectorManifest({ ...c, apiHosts: [] }).join()).toMatch(/resolveTitles requires apiHosts/);
  });
  it("the new manifest rules of ADR 74 apply", () => {
    expect(checkConnectorManifest({ ...c, authHosts: [] }).join()).toMatch(/connection wizard needs authHosts/);
    expect(checkConnectorManifest({ ...c, apiHosts: [] }).join()).toMatch(/library requires apiHosts/);
  });
  it("catalogs have the same keys and every key is under connectors.steam.", () => {
    expect(Object.keys(es).sort()).toEqual(Object.keys(en).sort());
    for (const k of Object.keys(en)) expect(k.startsWith("connectors.steam.")).toBe(true);
  });
  it("every connectors.steam.* key used in the sources exists in both catalogs", () => {
    const dir = join(__dirname, "..", "src");
    const used = new Set<string>();
    for (const f of readdirSync(dir)) {
      for (const m of readFileSync(join(dir, f), "utf8").matchAll(/connectors\.steam\.[A-Za-z.]+[A-Za-z]/g)) used.add(m[0]);
      // k("choose.title") builds keys in wizard.ts
      for (const m of readFileSync(join(dir, f), "utf8").matchAll(/k\("([A-Za-z.]+)"\)/g)) used.add(`connectors.steam.${m[1]}`);
    }
    expect(used.size).toBeGreaterThan(5);
    for (const key of used) {
      expect(key in en, key).toBe(true);
      expect(key in es, key).toBe(true);
    }
  });
  it("passes the shared conformance check with real fixtures", async () => {
    await assertConnectorConformance(c, {
      scan: () => scanContext({ tree: steamTree(), roots: [STEAM_ROOT, LIB_D, LIB_E] }),
      discovery: () =>
        discoveryContext({ tree: steamTree(), locations: [{ declarationId: "steam-root", path: STEAM_ROOT }] }),
      launch: {
        ctx: () => launchContext({ tree: { [EXE]: "" }, launchers: [{ declarationId: "steam-client", path: EXE }] }),
        properties: [{ storeGameId: "620", installed: true, installPath: null, launchData: null }],
      },
      catalogs: { es, en },
    });
  });
  it("the conformance check detects a broken connector", async () => {
    const broken = {
      ...c,
      mediaHosts: ["https://x.com/"],
      apiHosts: ["Api.Example.com:8443"],
      resolveAction: async () => ({ kind: "uri" as const, uri: "calc://x" }),
    };
    const problems = (
      await checkConnectorConformance(broken, {
        launch: { ctx: () => launchContext({ launchersResolved: false }), properties: [] },
      })
    ).join("\n");
    expect(problems).toMatch(/mediaHosts/);
    expect(problems).toMatch(/apiHosts/);
    expect(problems).toMatch(/URI scheme/);
  });
});
