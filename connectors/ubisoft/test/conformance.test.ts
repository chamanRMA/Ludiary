import { assertConnectorConformance, discoveryContext, launchContext, scanContext } from "@ludiary/connector-testkit";
import { checkConnectorManifest } from "@ludiary/contracts";
import { describe, expect, it } from "vitest";
import en from "../locales/en.json";
import es from "../locales/es.json";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createUbisoftConnector } from "../src";
import { APP_ID } from "../src/auth";

const c = createUbisoftConnector();
const GAME = "D:\\Ubisoft Games\\Fake One";
const UBI = "C:\\Program Files (x86)\\Ubisoft\\Ubisoft Game Launcher";

describe("Ubisoft manifest (ADR 79, 80)", () => {
  it("is valid with the agreed capabilities", () => {
    expect(checkConnectorManifest(c)).toEqual([]);
    expect(c.access).toBe("unofficial-api");
    expect(c.capabilities).toMatchObject({ library: true, scan: true, dlc: "none", actions: ["play", "install"], launchKinds: ["uri"], uriSchemes: ["uplay"] });
    expect([c.authHosts, c.apiHosts, c.mediaHosts]).toEqual([["connect.ubisoft.com"], ["public-ubiservices.ubi.com"], ["static3.cdn.ubi.com"]]);
    expect(c.minSyncIntervalMs).toBe(1_800_000);
    expect(c.connection).toBeDefined();
    expect(c.listLibrary).toBeDefined();
    expect(c.resolveMedia).toBeUndefined();
    expect(c.locations.map((l) => [l.id, l.purpose, l.sources.length])).toEqual([
      ["ubisoft-installs", "scan", 2],
      ["ubisoft-launcher", "launcher", 2],
      ["ubisoft-cache", "library", 2],
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

describe("Ubisoft secrets and constants (ADR 80, points 7 and 8)", () => {
  it("catalogs carry the new texts and match", () => {
    for (const key of ["login.title", "login.body", "login.window", "error.login", "error.expired", "errors.noCache", "disconnect.hint"]) {
      expect(en).toHaveProperty([`connectors.ubisoft.${key}`]);
    }
    expect(es["connectors.ubisoft.login.body" as keyof typeof es]).toContain("Recordarme");
    expect(en["connectors.ubisoft.login.body" as keyof typeof en]).toContain("Remember me");
  });
  it("the Ubi-AppId lives only in src/auth.ts and nothing builds a token header outside it", () => {
    const root = join(__dirname, "..");
    const hits: string[] = [];
    const walk = (d: string): void => {
      for (const e of readdirSync(d, { withFileTypes: true })) {
        if (e.name === "node_modules" || e.name.startsWith(".")) continue;
        const f = join(d, e.name);
        if (e.isDirectory()) walk(f);
        else if (f.includes("src") || f.includes("locales")) {
          const text = readFileSync(f, "utf8");
          if (text.includes(APP_ID)) hits.push(`app:${e.name}`);
          if (/rm_v1 t=|Ubi_v1 t=/.test(text) && e.name !== "auth.ts" && e.name !== "library.ts") hits.push(`token:${e.name}`);
        }
      }
    };
    walk(root);
    expect(hits).toEqual(["app:auth.ts"]);
  });
  it("no source logs or throws a ticket: log calls carry counters only", () => {
    const dir = join(__dirname, "..", "src");
    for (const f of readdirSync(dir)) {
      for (const m of readFileSync(join(dir, f), "utf8").matchAll(/log\.\w+\(([^)]*)\)/g)) expect(m[1], f).not.toMatch(/reveal|ticket|sessionId/i);
    }
  });
});
