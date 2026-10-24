import { EventEmitter } from "node:events";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HelperProcessEmbeddedLogin, helperEnv, removeTree, type EmbeddedLoginSpawn } from "../src";

const REQ = {
  title: "Ubisoft",
  startUrl: "https://connect.ubisoft.com/login",
  doneUrl: "https://connect.ubisoft.com/ready",
  captureUrl: "https://connect.ubisoft.com/change_domain/",
  allowedHosts: ["connect.ubisoft.com"],
  capture: [{ name: "rememberMeTicket", storageKeys: ["PRODrememberMe"], jsonField: "rememberMeTicket", maxLength: 100 }],
};

class FakeChild extends EventEmitter {
  stdin = new PassThrough();
  stdout = new PassThrough();
  written = "";
  stdinEnded = false;
  killed = false;
  constructor() {
    super();
    this.stdin.on("data", (c: Buffer) => (this.written += c.toString()));
    this.stdin.on("end", () => (this.stdinEnded = true));
  }
  kill(): boolean {
    this.killed = true;
    this.emit("close", null);
    return true;
  }
  say(text: string): void {
    this.stdout.write(text);
  }
  exit(code: number): void {
    this.emit("close", code);
  }
}

let root: string;
let child: FakeChild;
let seenEnv: NodeJS.ProcessEnv | undefined;
let seenArgs: readonly string[] | undefined;
const spawnFake: EmbeddedLoginSpawn = (_c, args, o) => {
  seenEnv = o.env;
  seenArgs = args;
  return child as never;
};
const make = (extra = {}) =>
  new HelperProcessEmbeddedLogin({
    helperPath: "helper.exe",
    tmpRoot: join(root, "tmp"),
    env: { PATH: "x", WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: "--remote-debugging-port=1", webview2_user_data_folder: "c:\\x" },
    spawn: spawnFake,
    killAfterMs: 30,
    cleanupWindowMs: 100,
    retryEveryMs: 10,
    ...extra,
  });
const tick = () => new Promise((r) => setTimeout(r, 5));
const profileOf = () => (JSON.parse(child.written) as { dataDir: string }).dataDir;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "ludiary-el-"));
  child = new FakeChild();
  seenEnv = undefined;
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe("HelperProcessEmbeddedLogin", () => {
  it("starts the helper without WEBVIEW2_* variables and with the request on one line, stdin left open", async () => {
    const p = make().run(REQ, new AbortController().signal);
    await tick();
    expect(seenArgs).toEqual(["--embedded-login"]);
    expect(seenEnv).toEqual({ PATH: "x" });
    expect(child.written.endsWith("\n")).toBe(true);
    const req = JSON.parse(child.written.trimEnd()) as { title: string; dataDir: string };
    expect(req.title).toBe("Ubisoft");
    expect(req.dataDir.startsWith(join(root, "tmp", "webview-"))).toBe(true);
    expect(existsSync(req.dataDir)).toBe(true);
    expect(child.stdinEnded).toBe(false);
    child.say('{"cancelled":true,"blockedHosts":[]}\n');
    child.exit(0);
    await p;
  });

  it("needs the first line AND the exit", async () => {
    let done = false;
    const p = make()
      .run(REQ, new AbortController().signal)
      .then((r) => ((done = true), r));
    await tick();
    child.say('{"captured":{"rememberMeTicket":"abc"},"blockedHosts":["x.example.com"]}\n');
    await tick();
    expect(done).toBe(false);
    child.exit(0);
    const r = await p;
    expect(r.kind).toBe("captured");
    if (r.kind === "captured") {
      expect(r.values["rememberMeTicket"]?.reveal()).toBe("abc");
      expect(String(r.values["rememberMeTicket"])).toBe("[redacted]");
      expect(r.blockedHosts).toEqual(["x.example.com"]);
    }
  });

  it("exit without a line is failed", async () => {
    const p = make().run(REQ, new AbortController().signal);
    await tick();
    child.exit(1);
    expect(await p).toEqual({ kind: "failed", reason: "failed" });
  });

  it.each([
    ['{"error":"runtime-missing"}', 1, { kind: "unavailable", reason: "runtime-missing" }],
    ['{"error":"capture-missing"}', 1, { kind: "failed", reason: "capture-missing" }],
    ['{"error":"bad-request"}', 2, { kind: "failed", reason: "failed" }],
    ['{"cancelled":true,"blockedHosts":["a.example.com"]}', 0, { kind: "cancelled", blockedHosts: ["a.example.com"] }],
    ['{"cancelled":true,"blockedHosts":[]}', 1, { kind: "failed", reason: "failed" }],
    ["not json", 0, { kind: "failed", reason: "failed" }],
    ['{"captured":{"rememberMeTicket":"a","other":"b"},"blockedHosts":[]}', 0, { kind: "failed", reason: "failed" }],
    ['{"captured":{"rememberMeTicket":5},"blockedHosts":[]}', 0, { kind: "failed", reason: "capture-missing" }],
    ['{"captured":{"rememberMeTicket":"a\\u0000b"},"blockedHosts":[]}', 0, { kind: "failed", reason: "capture-missing" }],
    [`{"captured":{"rememberMeTicket":"${"a".repeat(101)}"},"blockedHosts":[]}`, 0, { kind: "failed", reason: "capture-missing" }],
    ['{"cancelled":true,"blockedHosts":["not a host","nucleus:","a.example.com"]}', 0, { kind: "cancelled", blockedHosts: ["a.example.com"] }],
    ['{"cancelled":true,"blockedHosts":[5]}', 0, { kind: "failed", reason: "failed" }],
  ])("interprets %s (exit %i)", async (line, code, expected) => {
    const p = make().run(REQ, new AbortController().signal);
    await tick();
    child.say(line + "\n");
    child.exit(code);
    expect(await p).toEqual(expected);
  });

  it("rejects more than 32 blocked hosts", async () => {
    const hosts = Array.from({ length: 33 }, (_, i) => `h${i}.example.com`);
    const p = make().run(REQ, new AbortController().signal);
    await tick();
    child.say(JSON.stringify({ cancelled: true, blockedHosts: hosts }) + "\n");
    child.exit(0);
    expect(await p).toEqual({ kind: "failed", reason: "failed" });
  });

  it("a second login while one is open is busy", async () => {
    const login = make();
    const p = login.run(REQ, new AbortController().signal);
    await tick();
    expect(await login.run(REQ, new AbortController().signal)).toEqual({ kind: "unavailable", reason: "busy" });
    child.exit(1);
    await p;
  });

  it("abort closes stdin and kills the helper after the grace period", async () => {
    const ac = new AbortController();
    const p = make().run(REQ, ac.signal);
    await tick();
    ac.abort();
    await tick();
    expect(child.stdinEnded).toBe(true);
    expect(child.killed).toBe(false);
    expect((await p).kind).toBe("cancelled");
    expect(child.killed).toBe(true);
  });

  it("an already aborted signal never leaves the window open", async () => {
    const ac = new AbortController();
    ac.abort();
    const p = make().run(REQ, ac.signal);
    await tick();
    expect(child.stdinEnded).toBe(true);
    child.exit(0);
    expect((await p).kind).toBe("cancelled");
  });

  it("dispose() aborts the helper in use and refuses new logins", async () => {
    const login = make();
    const p = login.run(REQ, new AbortController().signal);
    await tick();
    login.dispose();
    await tick();
    expect(child.stdinEnded).toBe(true);
    child.exit(0);
    expect((await p).kind).toBe("cancelled");
    expect(await login.run(REQ, new AbortController().signal)).toEqual({ kind: "failed", reason: "failed" });
  });

  it("deletes the profile when the helper is gone", async () => {
    const login = make();
    const p = login.run(REQ, new AbortController().signal);
    await tick();
    const dir = profileOf();
    writeFileSync(join(dir, "Cookies"), "x");
    child.say('{"cancelled":true,"blockedHosts":[]}\n');
    child.exit(0);
    await p;
    await login.idle();
    expect(existsSync(dir)).toBe(false);
  });

  // A process running in the folder makes Windows refuse to delete it, like a WebView2 process that is slow to let go.
  it.runIf(process.platform === "win32")("a profile that cannot be deleted stays pending, logs only a code and goes at the next login", async () => {
    const log = vi.fn();
    const login = make({ log });
    const p = login.run(REQ, new AbortController().signal);
    await tick();
    const dir = profileOf();
    const holder = spawn(process.execPath, ["-e", "setTimeout(()=>{},60000)"], { cwd: dir, stdio: "ignore" }); // a process whose folder it is
    await new Promise((r) => holder.once("spawn", r));
    await new Promise((r) => setTimeout(r, 300)); // let the process settle in its folder
    child.say('{"cancelled":true,"blockedHosts":[]}\n');
    child.exit(0);
    await p;
    await login.idle();
    expect(log).toHaveBeenCalledWith("webview-cleanup-failed");
    expect(JSON.stringify(log.mock.calls)).not.toContain(root);
    expect(existsSync(dir)).toBe(true);
    holder.kill();
    await new Promise((r) => holder.once("exit", r));
    child = new FakeChild();
    const p2 = login.run(REQ, new AbortController().signal);
    await tick();
    expect(existsSync(dir)).toBe(false);
    child.exit(1);
    await p2;
  });

  it("start() removes webview-* leftovers and nothing else", () => {
    const tmp = join(root, "tmp");
    mkdirSync(join(tmp, "webview-old", "sub"), { recursive: true });
    mkdirSync(join(tmp, "keep"), { recursive: true });
    const login = make();
    login.start();
    login.dispose();
    expect(readdirSync(tmp)).toEqual(["keep"]);
  });

  it("dispose() without start() deletes nothing (the launcher must not touch a running login)", () => {
    const tmp = join(root, "tmp");
    mkdirSync(join(tmp, "webview-live"), { recursive: true });
    make().dispose();
    expect(readdirSync(tmp)).toEqual(["webview-live"]);
  });
});

describe("helperEnv", () => {
  it("drops WEBVIEW2_* in any case and keeps the rest", () => {
    expect(helperEnv({ A: "1", WEBVIEW2_X: "2", Webview2_Y: "3", WEBVIEW: "4" })).toEqual({ A: "1", WEBVIEW: "4" });
  });
});

describe("removeTree", () => {
  it.runIf(process.platform === "win32")("removes a junction as a link and leaves its target intact", () => {
    const outside = join(root, "outside");
    mkdirSync(outside);
    writeFileSync(join(outside, "precious.txt"), "keep");
    const prof = join(root, "webview-j");
    mkdirSync(prof);
    writeFileSync(join(prof, "a"), "x");
    symlinkSync(outside, join(prof, "link"), "junction");
    removeTree(prof);
    expect(existsSync(prof)).toBe(false);
    expect(existsSync(join(outside, "precious.txt"))).toBe(true);
  });
});
