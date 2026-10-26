import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { assertConnectorConformance, discoveryContext, launchContext, scanContext } from "@ludiary/connector-testkit";
import { checkConnectorManifest } from "@ludiary/contracts";
import { describe, expect, it } from "vitest";
import en from "../locales/en.json";
import es from "../locales/es.json";
import { createEpicConnector } from "../src";
import { basicAuth, EPIC_CLIENT_ID, EPIC_CLIENT_SECRET } from "../src/auth";
import { APP, DATA, dataRoot, ID, item, LIB, libRoot, MANIFESTS } from "./helpers";

const c = createEpicConnector();
const tree = { [`${MANIFESTS}\\a.item`]: item(), [`${LIB}\\${APP}\\TestGame.exe`]: "" };

describe("Epic manifest (ADR 78)", () => {
  it("is valid with the agreed capabilities", () => {
    expect(checkConnectorManifest(c)).toEqual([]);
    expect(c.access).toBe("unofficial-api");
    expect(c.externalTools).toEqual([]);
    expect(c.capabilities).toMatchObject({ library: true, scan: true, dlc: "library", actions: ["play", "install"], launchKinds: ["uri"], uriSchemes: ["com.epicgames.launcher"], storePlaytime: false });
    expect(c.minSyncIntervalMs).toBe(1_800_000);
    expect(c.authHosts).toEqual(["www.epicgames.com"]);
    expect(c.apiHosts).toEqual([
      "account-public-service-prod03.ol.epicgames.com",
      "catalog-public-service-prod06.ol.epicgames.com",
      "library-service.live.use1a.on.epicgames.com",
    ]);
    expect(c.mediaHosts).toEqual(["cdn1.epicgames.com", "cdn2.unrealengine.com"]);
  });
  it("locations: registry first, known folder as fallback; the launcher points to the executable", () => {
    expect(c.locations).toEqual([
      {
        id: "epic-launcher-data",
        purpose: "scan",
        os: ["windows"],
        sources: [
          { kind: "registry-value", hive: "HKLM", key: "SOFTWARE\\Epic Games\\EpicGamesLauncher", value: "AppDataPath", view: "64" },
          { kind: "known-folder", folder: "ProgramData", relative: "Epic\\EpicGamesLauncher\\Data" },
        ],
      },
      {
        id: "epic-launcher",
        purpose: "launcher",
        os: ["windows"],
        sources: [
          { kind: "registry-value", hive: "HKCU", key: "Software\\Epic Games\\EOS", value: "ModSdkCommand" },
          { kind: "known-folder", folder: "ProgramFilesX86", relative: "Epic Games\\Launcher\\Portal\\Binaries\\Win64\\EpicGamesLauncher.exe" },
        ],
      },
    ]);
  });
  it("catalogs match and every used key exists", () => {
    expect(Object.keys(es).sort()).toEqual(Object.keys(en).sort());
    const used = new Set<string>();
    for (const f of ["launch", "wizard", "auth", "manifest"]) {
      const src = readFileSync(join(__dirname, "..", "src", `${f}.ts`), "utf8");
      for (const m of src.matchAll(/(?:fail\("[a-z.-]+", "|k\(")([A-Za-z.]+)"/g)) used.add(m[1]!);
      for (const m of src.matchAll(/k\(corrective \? "([a-z.]+)" : "([a-z.]+)"\)/g)) (used.add(m[1]!), used.add(m[2]!));
    }
    for (const key of used) expect(`connectors.epic.${key}` in en || `connectors.epic.errors.${key}` in en, key).toBe(true);
  });
  it("the launcher client_secret (and base64 of id:secret) appear only in connectors/epic/src/auth.ts among tracked files", () => {
    const root = execFileSync("git", ["rev-parse", "--show-toplevel"], { cwd: __dirname, encoding: "utf8" }).trim();
    const files = execFileSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], { cwd: root, encoding: "utf8", maxBuffer: 1 << 28 })
      .split("\0")
      .filter(Boolean);
    const needles = [EPIC_CLIENT_SECRET, btoa(`${EPIC_CLIENT_ID}:${EPIC_CLIENT_SECRET}`), basicAuth().reveal().slice("basic ".length)];
    const hits: string[] = [];
    for (const f of files) {
      let text: string;
      try {
        text = readFileSync(join(root, f), "utf8");
      } catch {
        continue; // deleted in the working tree
      }
      if (needles.some((n) => text.includes(n))) hits.push(f.replace(/\\/g, "/"));
    }
    expect(hits).toEqual(["connectors/epic/src/auth.ts"]);
    void dirname;
  });
  it("passes the shared conformance check", async () => {
    await assertConnectorConformance(c, {
      scan: () => scanContext({ tree, roots: [dataRoot, libRoot] }),
      discovery: () => discoveryContext({ tree, locations: [{ declarationId: "epic-launcher-data", path: DATA }] }),
      launch: {
        ctx: () => launchContext({ installPaths: [LIB], launchers: [{ declarationId: "epic-launcher", path: "E:\\Epic Games\\Launcher\\Portal\\Binaries\\Win64\\EpicGamesLauncher.exe" }] }),
        properties: [{ storeGameId: ID, installed: true, installPath: `${LIB}\\${APP}`, launchData: null }],
      },
      catalogs: { es, en },
    });
  });
});
