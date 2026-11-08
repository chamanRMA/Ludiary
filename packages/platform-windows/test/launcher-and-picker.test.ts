import { EventEmitter } from "node:events";
import type { ChildProcess } from "node:child_process";
import type { Stats } from "node:fs";
import { describe, expect, it } from "vitest";
import { ExecError } from "@ludiary/contracts";
import {
  childEnv,
  createWindowsProcessLauncher,
  createHelperRunner,
  HelperProcessFilePicker,
  HelperProcessFolderPicker,
  openWithShellHandler,
  rundll32Path,
  parsePickFolderResponse,
  validateLaunchUri,
  type SpawnFn,
} from "../src";

function fakeSpawn(): { spawn: SpawnFn; calls: { command: string; args: readonly string[]; options: unknown }[] } {
  const calls: { command: string; args: readonly string[]; options: unknown }[] = [];
  const spawn: SpawnFn = (command, args, options) => {
    calls.push({ command, args, options });
    const child = new EventEmitter() as ChildProcess;
    child.unref = () => {};
    queueMicrotask(() => child.emit("spawn"));
    return child;
  };
  return { spawn, calls };
}

describe("openUri", () => {
  it("opens an allowed URI with rundll32 and no shell", async () => {
    const { spawn, calls } = fakeSpawn();
    const launcher = createWindowsProcessLauncher({ allowedSchemes: ["steam"], spawn, env: { SystemRoot: "D:\\Win" } });
    await launcher.openUri("steam://rungameid/220");
    expect(calls).toHaveLength(1);
    expect(calls[0]?.command).toBe("D:\\Win\\System32\\rundll32.exe");
    expect(calls[0]?.args).toEqual(["url.dll,FileProtocolHandler", "steam://rungameid/220"]);
    expect(calls[0]?.options).toMatchObject({ windowsHide: true, detached: true });
    expect(calls[0]?.options).not.toHaveProperty("shell");
  });

  it("resolves rundll32 to an absolute System32 path and ignores a SystemRoot that is not absolute", () => {
    expect(rundll32Path({ SystemRoot: "C:\\Windows" })).toBe("C:\\Windows\\System32\\rundll32.exe");
    expect(rundll32Path({ SystemRoot: "C:\\Windows\\\\" })).toBe("C:\\Windows\\System32\\rundll32.exe");
    expect(rundll32Path({})).toBe("C:\\Windows\\System32\\rundll32.exe");
    for (const bad of ["Windows", "\\\\evil\\share", ".\\x", "", "C:Windows"]) {
      expect(rundll32Path({ SystemRoot: bad }), bad).toBe("C:\\Windows\\System32\\rundll32.exe");
    }
  });

  it("openUrl also uses the absolute rundll32 path", async () => {
    const { spawn, calls } = fakeSpawn();
    await openWithShellHandler("https://example.com/", spawn, { SystemRoot: "C:\\Windows" });
    expect(calls[0]?.command).toBe("C:\\Windows\\System32\\rundll32.exe");
  });

  it("kinds has uri and exec", () => {
    expect(createWindowsProcessLauncher({ allowedSchemes: [] }).kinds).toEqual(["uri", "exec"]);
  });

  const bad: [string, string][] = [
    ["scheme not in list", "gog://launch/1"],
    ["http", "http://example.com/"],
    ["https", "https://example.com/"],
    ["file", "file:///C:/Windows/System32/calc.exe"],
    ["upper-case scheme", "STEAM://rungameid/1"],
    ["no scheme", "rungameid/1"],
    ["space", "steam://rungameid/1 2"],
    ["control char", "steam://rungameid/1\n"],
    ["tab", "steam://rungameid/1\t"],
    ["NUL", "steam://rungameid/1\0"],
    ["double quote", 'steam://rungameid/1"'],
    ["single quote", "steam://rungameid/1'"],
    ["backtick", "steam://rungameid/1`"],
    ["bad percent", "steam://rungameid/%zz"],
    ["trailing percent", "steam://rungameid/1%"],
    ["non-ASCII", "steam://rungameid/ñ"],
    ["empty body", "steam:"],
    ["too long", "steam://" + "a".repeat(2050)],
  ];
  for (const [name, uri] of bad) {
    it(`rejects ${name} without spawning`, async () => {
      const { spawn, calls } = fakeSpawn();
      const launcher = createWindowsProcessLauncher({ allowedSchemes: ["steam"], spawn });
      await expect(launcher.openUri(uri)).rejects.toThrow();
      expect(calls).toHaveLength(0);
    });
  }

  it("accepts valid percent escapes and refuses http even if listed", () => {
    expect(validateLaunchUri("steam://run/1%20x", ["steam"])).toBe("steam");
    expect(() => validateLaunchUri("https://a.b/", ["https"])).toThrow();
  });
});

describe("folder picker", () => {
  it("parses the answers", () => {
    expect(parsePickFolderResponse('{"path":"D:\\\\Games"}\n')).toBe("D:\\Games");
    expect(parsePickFolderResponse('{"cancelled":true}\n')).toBeNull();
    expect(() => parsePickFolderResponse('{"error":"dialog-failed"}')).toThrow(/dialog-failed/);
    expect(() => parsePickFolderResponse('{"path":"relative\\\\dir"}')).toThrow();
    expect(() => parsePickFolderResponse("nonsense")).toThrow();
  });

  it("sends the title and opens a single dialog at a time", async () => {
    let calls = 0;
    let release!: (value: string) => void;
    const inputs: string[] = [];
    const picker = new HelperProcessFolderPicker((args, input) => {
      calls++;
      expect(args).toEqual(["--pick-folder"]);
      inputs.push(input);
      return new Promise<string>((resolve) => (release = resolve));
    });
    const first = picker.pick({ title: "Elegir carpeta" });
    const second = picker.pick({ title: "Otra" });
    release('{"path":"D:\\\\Games"}');
    expect(await first).toBe("D:\\Games");
    expect(await second).toBe("D:\\Games");
    expect(calls).toBe(1);
    expect(JSON.parse(inputs[0] ?? "")).toEqual({ title: "Elegir carpeta" });
    // After it closes, a new dialog may open.
    const third = picker.pick({ title: "x" });
    release('{"cancelled":true}');
    expect(await third).toBeNull();
    expect(calls).toBe(2);
  });
});

describe("HelperProcessFilePicker (ADR 93)", () => {
  it("calls --pick-file, joins a second call and treats the answer as untrusted", async () => {
    let calls = 0;
    let release!: (value: string) => void;
    const inputs: string[] = [];
    const picker = new HelperProcessFilePicker((args, input) => {
      calls++;
      expect(args).toEqual(["--pick-file"]);
      inputs.push(input);
      return new Promise<string>((resolve) => (release = resolve));
    });
    const first = picker.pickExecutable({ title: "Elegir", filterName: "Programas" });
    const second = picker.pickExecutable({ title: "Otro", filterName: "x" });
    release('{"path":"D:\\\\Games\\\\a.exe"}');
    expect(await first).toBe("D:\\Games\\a.exe");
    expect(await second).toBe("D:\\Games\\a.exe");
    expect(calls).toBe(1);
    expect(JSON.parse(inputs[0] ?? "")).toEqual({ title: "Elegir", filterName: "Programas" });
    const bad = picker.pickExecutable({ title: "x", filterName: "y" });
    release('{"path":"relative\\\\a.exe"}');
    await expect(bad).rejects.toThrow();
    const cancelled = picker.pickExecutable({ title: "x", filterName: "y" });
    release('{"cancelled":true}');
    expect(await cancelled).toBeNull();
  });
});

describe("helper runner dispose (a dialog must not outlive the server)", () => {
  it("kills a helper that is still running, rejects its caller and refuses new calls", async () => {
    // node itself plays the helper: it ignores stdin and would run for a minute if nobody killed it.
    const runner = createHelperRunner(process.execPath);
    const started = Date.now();
    const pending = runner(["-e", "setInterval(() => {}, 1000)"], "", { timeoutMs: 60_000 });
    const assertion = expect(pending).rejects.toThrow(/disposed/);
    await new Promise((r) => setTimeout(r, 200));
    runner.dispose();
    await assertion;
    expect(Date.now() - started).toBeLessThan(20_000);
    await expect(runner(["-e", "0"], "")).rejects.toThrow(/disposed/);
    runner.dispose(); // idempotent
  });
});

describe("exec (ADR 76 second barrier)", () => {
  const GAME = "D:\\GOG Games\\Demo";
  const EXE = `${GAME}\\demo.exe`;
  // Fake disk: EXE is a file, GAME a folder.
  const stat = (async (p: string) => {
    if (p === EXE) return { isFile: () => true, isDirectory: () => false } as Stats;
    if (p === GAME) return { isFile: () => false, isDirectory: () => true } as Stats;
    throw Object.assign(new Error("missing"), { code: "ENOENT" });
  }) as never;
  const make = (spawn: SpawnFn = fakeSpawn().spawn, env: NodeJS.ProcessEnv = {}) =>
    createWindowsProcessLauncher({ allowedSchemes: [], spawn, stat, env });
  const reason = async (p: Promise<void>) => ((await p.then(() => null, (e: unknown) => e)) as ExecError | null)?.reason;

  it.each([
    ["relative path", { executable: "demo.exe", args: [] }],
    ["drive-relative", { executable: "D:demo.exe", args: [] }],
    ["forward slashes", { executable: "D:/GOG Games/Demo/demo.exe", args: [] }],
    ["UNC", { executable: "\\\\srv\\share\\demo.exe", args: [] }],
    ["verbatim", { executable: `\\\\?\\${EXE}`, args: [] }],
    ["device", { executable: `\\\\.\\${EXE}`, args: [] }],
    ["not an exe", { executable: `${GAME}\\demo.dll`, args: [] }],
    ["bat", { executable: `${GAME}\\demo.bat`, args: [] }],
    ["cmd", { executable: `${GAME}\\demo.CMD`, args: [] }],
    ["missing", { executable: `${GAME}\\other.exe`, args: [] }],
    ["folder named .exe", { executable: GAME + ".exe", args: [] }],
    ["quote in the path", { executable: `${GAME}\\de"mo.exe`, args: [] }],
    ["control character in the path", { executable: `${GAME}\\demo\n.exe`, args: [] }],
    ["NUL in an argument", { executable: EXE, args: ["a\0b"] }],
    ["control character in an argument", { executable: EXE, args: ["a\nb"] }],
    ["cwd that is a file", { executable: EXE, args: [], cwd: EXE }],
    ["cwd relative", { executable: EXE, args: [], cwd: "Demo" }],
    ["cwd UNC", { executable: EXE, args: [], cwd: "\\\\srv\\share" }],
    ["mixed separators", { executable: `${GAME}/demo.exe`, args: [] }],
    ["conin$", { executable: `D:\\conin$\\demo.exe`, args: [] }],
    ["reserved superscript", { executable: `D:\\com¹.txt\\demo.exe`, args: [] }],
    ["reserved with trailing space before the extension", { executable: `D:\\nul .txt\\demo.exe`, args: [] }],
    ["alternate data stream", { executable: `${EXE}:evil.exe`, args: [] }],
    ["alternate data stream in cwd", { executable: EXE, args: [], cwd: `${GAME}:s` }],
    ["reserved name", { executable: `${GAME}\\NUL.exe`, args: [] }],
    ["reserved name as a folder", { executable: `D:\\com1\\demo.exe`, args: [] }],
    ["reserved name with extension", { executable: `D:\\lpt9.txt\\demo.exe`, args: [] }],
    ["component ending in a dot", { executable: `D:\\GOG Games.\\demo.exe`, args: [] }],
    ["component ending in a space", { executable: `D:\\GOG \\demo.exe`, args: [] }],
    ["parent component", { executable: `${GAME}\\..\\demo.exe`, args: [] }],
    ["command line too long", { executable: EXE, args: Array.from({ length: 5 }, () => "x".repeat(7000)) }],
  ])("rejects %s without spawning", async (_n, spec) => {
    const { spawn, calls } = fakeSpawn();
    expect(await reason(make(spawn).exec(spec))).toBe("rejected");
    expect(calls).toEqual([]);
  });

  it("spawns with exactly the safe options and strips LUDIARY_* and NODE_OPTIONS from the env", async () => {
    const { spawn, calls } = fakeSpawn();
    const env = { PATH: "C:\\x", LUDIARY_TEST_HOOK: "1", ludiary_other: "1", Node_Options: "--inspect", node_extra: "1", KEEP: "y" };
    await make(spawn, env).exec({ executable: EXE, args: ["-a", "b c"], cwd: GAME });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.command).toBe(EXE);
    expect(calls[0]?.args).toEqual(["-a", "b c"]);
    expect(calls[0]?.options).toEqual({ cwd: GAME, detached: true, stdio: "ignore", windowsHide: false, env: { PATH: "C:\\x", KEEP: "y" } });
    expect(calls[0]?.options).not.toHaveProperty("shell");
    expect(calls[0]?.options).not.toHaveProperty("windowsVerbatimArguments");
  });

  it("calls unref after the spawn event", async () => {
    let unref = 0;
    const spawn: SpawnFn = () => {
      const child = new EventEmitter() as ChildProcess;
      child.unref = () => void unref++;
      queueMicrotask(() => child.emit("spawn"));
      return child;
    };
    await make(spawn).exec({ executable: EXE, args: [] });
    expect(unref).toBe(1);
  });

  const failing = (code: string): SpawnFn => () => {
    const child = new EventEmitter() as ChildProcess;
    queueMicrotask(() => child.emit("error", Object.assign(new Error("x"), { code })));
    return child;
  };
  it("maps EACCES and EPERM to denied and anything else to failed", async () => {
    expect(await reason(make(failing("EACCES")).exec({ executable: EXE, args: [] }))).toBe("denied");
    expect(await reason(make(failing("EPERM")).exec({ executable: EXE, args: [] }))).toBe("denied");
    expect(await reason(make(failing("ENOENT")).exec({ executable: EXE, args: [] }))).toBe("failed");
    const throws: SpawnFn = () => {
      throw new Error("boom");
    };
    expect(await reason(make(throws).exec({ executable: EXE, args: [] }))).toBe("failed");
  });

  it("the ExecError carries neither the path nor the arguments of the failed spawn", async () => {
    const spawn: SpawnFn = () => {
      const child = new EventEmitter() as ChildProcess;
      queueMicrotask(() => child.emit("error", Object.assign(new Error(`spawn ${EXE} EACCES`), { code: "EACCES", path: EXE, spawnargs: ["--token=secret"] })));
      return child;
    };
    const err = (await make(spawn).exec({ executable: EXE, args: ["--token=secret"] }).then(() => null, (e: unknown) => e)) as ExecError;
    expect(err.reason).toBe("denied");
    expect(err.cause).toBeUndefined();
    expect(JSON.stringify({ ...err, message: err.message, stack: err.stack })).not.toMatch(/GOG|secret|demo/);
  });

  it("childEnv keeps everything else", () => {
    expect(childEnv({ A: "1", LUDIARY_X: "2" })).toEqual({ A: "1" });
  });
});
