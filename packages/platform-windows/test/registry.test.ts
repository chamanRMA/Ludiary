import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { LocationsUnreadableError } from "@ludiary/contracts";
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

  it("accepts names parallel to values and fails the answer otherwise (ADR 79)", () => {
    const parse = (r: object) => parseRegistryResponse(JSON.stringify({ results: [r] }), 1)[0];
    expect(parse({ ok: true, values: ["d:/a", "d:/b"], names: ["900001", "900002"] })).toEqual({ ok: true, values: ["d:/a", "d:/b"], names: ["900001", "900002"] });
    for (const names of [["1"], ["1", ""], ["1", "ab"], ["1", 2], ["1", "x".repeat(256)], "12"]) {
      expect(parse({ ok: true, values: ["d:/a", "d:/b"], names })).toEqual({ ok: false, error: "failed" });
    }
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

  it("throws when the registry cannot be read: helper failed, access-denied, failed (ADR 79)", async () => {
    const existing = ["C:\\Program Files (x86)\\Steam"];
    await expect(make({ error: "bad-request" }, existing).resolve(decl)).rejects.toThrow();
    const failing: HelperRunner = async () => {
      throw new Error("spawn failed");
    };
    await expect(new WindowsLocationResolver({ files, runHelper: failing, env }).resolve(decl)).rejects.toThrow();
    for (const error of ["access-denied", "failed", "invalid-key"]) {
      await expect(make({ results: [{ ok: false, error }, { ok: true, values: [] }] }, existing).resolve(decl)).rejects.toThrow(error);
    }
  });

  it("treats not-found and unsupported-type as absence, with the known folder still resolving (ADR 79)", async () => {
    const resolver = make({ results: [{ ok: false, error: "not-found" }, { ok: false, error: "unsupported-type" }] }, ["C:\\Program Files (x86)\\Steam"]);
    expect(await resolver.resolve(decl)).toEqual([{ declarationId: "steam-root", path: "C:\\Program Files (x86)\\Steam" }]);
  });

  it("keeps two subkeys that share a path, and fails a truncated list (ADR 79)", async () => {
    const d = {
      id: "ubi",
      purpose: "scan" as const,
      os: ["windows" as const],
      sources: [{ kind: "registry-subkeys" as const, hive: "HKLM" as const, key: "K", value: "InstallDir" }],
    };
    const same = make({ results: [{ ok: true, values: ["D:/G/", "D:/G/"], names: ["900001", "900002"] }] }, ["D:\\G"]);
    expect(await same.resolve(d)).toEqual([
      { declarationId: "ubi", path: "D:\\G", subkey: "900001" },
      { declarationId: "ubi", path: "D:\\G", subkey: "900002" },
    ]);
    const cut = make({ results: [{ ok: true, values: ["D:/G/"], names: ["900001"], truncated: true }] }, ["D:\\G"]);
    await expect(cut.resolve(d)).rejects.toThrow(/truncated/);
  });

  it("throws LocationsUnreadableError carrying the locations that did resolve (ADR 79)", async () => {
    const resolver = make({ error: "bad-request" }, ["C:\\Program Files (x86)\\Steam"]);
    const err = await resolver.resolve(decl).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(LocationsUnreadableError);
    expect((err as LocationsUnreadableError).partial).toEqual([{ declarationId: "steam-root", path: "C:\\Program Files (x86)\\Steam" }]);
    const failing = new WindowsLocationResolver({ files, runHelper: async () => "{}", env, exists: async () => { throw Object.assign(new Error("x"), { code: "EACCES" }); } });
    await expect(failing.resolve({ ...decl, sources: [decl.sources[2]!] })).rejects.toBeInstanceOf(LocationsUnreadableError);
  });

  it("a registry-subkeys answer without names is unusable and fails (ADR 79)", async () => {
    const d = {
      id: "ubi",
      purpose: "scan" as const,
      os: ["windows" as const],
      sources: [{ kind: "registry-subkeys" as const, hive: "HKLM" as const, key: "K", value: "InstallDir" }],
    };
    const err = await make({ results: [{ ok: true, values: ["D:/G/"] }] }, ["D:\\G"]).resolve(d).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(LocationsUnreadableError);
    expect((err as LocationsUnreadableError).partial).toEqual([]);
  });

  it("the default existence check treats ENOENT and ENOTDIR as absence", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "ludiary-exists-"));
    try {
      writeFileSync(path.join(dir, "f.txt"), "x");
      const env2 = { ProgramData: dir };
      const resolve = (relative: string) =>
        new WindowsLocationResolver({ files, runHelper: async () => "{}", env: env2 }).resolve({
          id: "k", purpose: "scan", os: ["windows"], sources: [{ kind: "known-folder", folder: "ProgramData", relative }],
        });
      expect(await resolve("f.txt")).toHaveLength(1);
      expect(await resolve("missing")).toEqual([]);
      expect(await resolve("f.txt\\inside")).toEqual([]); // ENOTDIR
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("sets subkey only on registry-subkeys locations (ADR 79)", async () => {
    const d = {
      id: "ubi",
      purpose: "scan" as const,
      os: ["windows" as const],
      sources: [
        { kind: "registry-subkeys" as const, hive: "HKLM" as const, key: "SOFTWARE\\Ubisoft\\Launcher\\Installs", value: "InstallDir", view: "32" as const },
        { kind: "registry-value" as const, hive: "HKLM" as const, key: "SOFTWARE\\Ubisoft\\Launcher", value: "InstallDir" },
      ],
    };
    const resolver = make(
      { results: [{ ok: true, values: ["D:/Ubisoft Games/A/", "D:/Ubisoft Games/B/"], names: ["900001", "900002"] }, { ok: true, values: ["C:/Ubi"] }] },
      ["D:\\Ubisoft Games\\A", "D:\\Ubisoft Games\\B", "C:\\Ubi"],
    );
    expect(await resolver.resolve(d)).toEqual([
      { declarationId: "ubi", path: "D:\\Ubisoft Games\\A", subkey: "900001" },
      { declarationId: "ubi", path: "D:\\Ubisoft Games\\B", subkey: "900002" },
      { declarationId: "ubi", path: "C:\\Ubi" },
    ]);
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
