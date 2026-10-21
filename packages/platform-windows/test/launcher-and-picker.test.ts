import { EventEmitter } from "node:events";
import type { ChildProcess } from "node:child_process";
import { describe, expect, it } from "vitest";
import {
  createWindowsProcessLauncher,
  createHelperRunner,
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

  it("kinds has uri only and exec rejects", async () => {
    const launcher = createWindowsProcessLauncher({ allowedSchemes: ["steam"], spawn: fakeSpawn().spawn });
    expect(launcher.kinds).toEqual(["uri"]);
    await expect(launcher.exec({ executable: "C:\\x.exe", args: [] })).rejects.toThrow();
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
