import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createNodeLocalFiles } from "../../platform-node/src";
import {
  buildRegistryRequest,
  createHelperRunner,
  parseRegistryResponse,
  WindowsLocationResolver,
  type HelperRunner,
} from "../src";

describe("--registry protocol parsing", () => {
  it("builds the request", () => {
    const text = buildRegistryRequest([{ hive: "HKCU", key: "Software\\Valve\\Steam", value: "SteamPath", view: "32", kind: "value" }]);
    expect(JSON.parse(text)).toEqual({
      queries: [{ hive: "HKCU", key: "Software\\Valve\\Steam", value: "SteamPath", view: "32", kind: "value" }],
    });
  });

  it("parses values, errors and empty lists", () => {
    const text = JSON.stringify({
      results: [{ ok: true, values: ["c:/steam"] }, { ok: false, error: "not-found" }, { ok: true }],
    });
    expect(parseRegistryResponse(text, 3)).toEqual([
      { ok: true, values: ["c:/steam"] },
      { ok: false, error: "not-found" },
      { ok: true, values: [] },
    ]);
  });

  it("rejects malformed answers", () => {
    expect(() => parseRegistryResponse("nope", 1)).toThrow();
    expect(() => parseRegistryResponse('{"error":"bad-request"}', 1)).toThrow(/bad-request/);
    expect(() => parseRegistryResponse('{"results":[]}', 1)).toThrow();
    expect(() => parseRegistryResponse('{"results":[{"ok":true,"values":[1]}]}', 1)).toThrow();
    expect(() => parseRegistryResponse('{"results":[null]}', 1)).toThrow();
  });
});

describe("WindowsLocationResolver (helper injected)", () => {
  const files = createNodeLocalFiles({ platform: "win32" });
  const env = { "ProgramFiles(x86)": "C:\\Program Files (x86)", LOCALAPPDATA: "C:\\Users\\u\\AppData\\Local" };
  const make = (answer: unknown, existing: string[], seen: string[] = []) => {
    const runHelper: HelperRunner = async (args, input) => {
      seen.push(args.join(" "), input);
      return JSON.stringify(answer);
    };
    const keys = new Set(existing.map((p) => files.compareKey(p)));
    return new WindowsLocationResolver({ files, runHelper, env, exists: async (p) => keys.has(files.compareKey(p)) });
  };
  const decl = {
    id: "steam-root",
    purpose: "scan" as const,
    os: ["windows" as const],
    sources: [
      { kind: "registry-value" as const, hive: "HKCU" as const, key: "Software\\Valve\\Steam", value: "SteamPath" },
      { kind: "registry-value" as const, hive: "HKLM" as const, key: "SOFTWARE\\Valve\\Steam", value: "InstallPath", view: "32" as const },
      { kind: "known-folder" as const, folder: "ProgramFilesX86" as const, relative: "Steam" },
    ],
  };

  it("keeps source order, normalizes, deduplicates by compareKey and drops missing paths", async () => {
    const seen: string[] = [];
    const resolver = make(
      { results: [{ ok: true, values: ["c:/program files (x86)/steam"] }, { ok: true, values: ["D:\\Gone"] }] },
      ["C:\\Program Files (x86)\\Steam"],
      seen,
    );
    const out = await resolver.resolve(decl);
    expect(out).toEqual([{ declarationId: "steam-root", path: "c:\\program files (x86)\\steam" }]);
    expect(seen[0]).toBe("--registry");
    expect(JSON.parse(seen[1] ?? "").queries).toHaveLength(2);
  });

  it("normalizes a forward-slash registry value and returns it when it exists (Epic launcher)", async () => {
    const epic = {
      id: "epic-launcher",
      purpose: "launcher" as const,
      os: ["windows" as const],
      sources: [{ kind: "registry-value" as const, hive: "HKLM" as const, key: "SOFTWARE\\Epic Games\\EpicGamesLauncher", value: "AppDataPath" }],
    };
    const exe = "E:\\Epic Games\\Launcher\\Portal\\Binaries\\Win64\\EpicGamesLauncher.exe";
    const resolver = make({ results: [{ ok: true, values: ["E:/Epic Games/Launcher/Portal/Binaries/Win64/EpicGamesLauncher.exe"] }] }, [exe]);
    expect(await resolver.resolve(epic)).toEqual([{ declarationId: "epic-launcher", path: exe }]);
  });

  it("drops UNC and device paths before any stat, so no SMB connection is attempted", async () => {
    const checked: string[] = [];
    const runHelper: HelperRunner = async () =>
      JSON.stringify({
        results: [
          { ok: true, values: ["\\\\fileserver\\steam", "\\\\?\\C:\\Steam", "\\\\.\\C:\\Steam", "//fileserver/steam", "C:\\Steam"] },
          { ok: true, values: [] },
        ],
      });
    const resolver = new WindowsLocationResolver({
      files,
      runHelper,
      env,
      exists: async (p) => {
        checked.push(p);
        return true;
      },
    });
    expect(await resolver.resolve(decl)).toEqual([
      { declarationId: "steam-root", path: "C:\\Steam" },
      { declarationId: "steam-root", path: "C:\\Program Files (x86)\\Steam" },
    ]);
    expect(checked).toEqual(["C:\\Steam", "C:\\Program Files (x86)\\Steam"]);
  });

  it("falls back to known folders when the helper fails", async () => {
    const resolver = make({ error: "bad-request" }, ["C:\\Program Files (x86)\\Steam"]);
    expect(await resolver.resolve(decl)).toEqual([{ declarationId: "steam-root", path: "C:\\Program Files (x86)\\Steam" }]);
  });

  it("ignores other operating systems and refuses '..' in known folders", async () => {
    const resolver = make({ results: [] }, []);
    expect(await resolver.resolve({ ...decl, os: ["linux"] })).toEqual([]);
    const evil = { ...decl, sources: [{ kind: "known-folder" as const, folder: "LocalAppData" as const, relative: "..\\Other" }] };
    expect(await make({ results: [] }, ["C:\\Users\\u\\AppData\\Other"]).resolve(evil)).toEqual([]);
  });
});

// Real helper: needs Go and Windows; skipped otherwise.
const goOk = process.platform === "win32" && spawnSync("go", ["version"], { shell: false }).status === 0;
describe.runIf(goOk)("ludiary-tray.exe --registry (real)", () => {
  let dir: string;
  let exe: string;
  beforeAll(() => {
    dir = mkdtempSync(path.join(tmpdir(), "ludiary-helper-"));
    exe = path.join(dir, "ludiary-tray.exe");
    execFileSync("go", ["build", "-o", exe, "."], {
      cwd: path.resolve(import.meta.dirname, "../../../apps/desktop/tray-helper"),
      env: { ...process.env, CGO_ENABLED: "0", GOOS: "windows", GOARCH: "amd64" },
    });
  }, 120_000);
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it("reads a real value read-only, and reports not-found and invalid input with codes", async () => {
    const run = createHelperRunner(exe);
    const queries = [
      { hive: "HKCU" as const, key: "Control Panel\\Desktop", value: "Wallpaper", kind: "value" as const },
      { hive: "HKCU" as const, key: "Software\\Valve\\Steam", value: "SteamPath", kind: "value" as const },
      { hive: "HKCU" as const, key: "Software\\Ludiary\\DoesNotExist", value: "x", kind: "value" as const },
      { hive: "HKLM" as const, key: "SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion", value: "ProductName", view: "64" as const, kind: "value" as const },
      { hive: "HKCU" as const, key: "Control Panel", value: "Wallpaper", kind: "subkeys" as const },
      { hive: "HKCR" as unknown as "HKCU", key: "x", value: "y", kind: "value" as const },
      // Usually REG_EXPAND_SZ (%USERPROFILE%\...): must come back expanded. Absent on some machines.
      { hive: "HKCU" as const, key: "Environment", value: "TEMP", kind: "value" as const },
    ];
    const results = parseRegistryResponse(await run(["--registry"], buildRegistryRequest(queries), { timeoutMs: 10_000 }), queries.length);
    // Wallpaper may be empty or absent depending on the machine; both are valid answers, never a crash.
    expect(results[0]?.ok === true || (results[0] as { error: string }).error === "not-found").toBe(true);
    const steam = results[1];
    expect(steam?.ok === true || (steam as { error: string }).error === "not-found").toBe(true);
    expect(results[2]).toEqual({ ok: false, error: "not-found" });
    expect(results[3]?.ok).toBe(true);
    expect(results[4]?.ok).toBe(true);
    expect(results[5]).toEqual({ ok: false, error: "invalid-hive" });
    const temp = results[6];
    if (temp?.ok) expect(temp.values[0]).not.toContain("%");
  }, 30_000);

  it("rejects garbage with bad-request", async () => {
    const out = await createHelperRunner(exe)(["--registry"], "garbage", { timeoutMs: 10_000 });
    expect(() => parseRegistryResponse(out, 0)).toThrow(/bad-request/);
  });
});
