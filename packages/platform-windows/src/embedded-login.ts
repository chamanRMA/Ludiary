import { spawn, type ChildProcessByStdio } from "node:child_process";
import { lstatSync, mkdirSync, mkdtempSync, readdirSync, rmdirSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import type { Readable, Writable } from "node:stream";
import { makeSecret, type EmbeddedLogin, type Secret } from "@ludiary/contracts";

type Request = Parameters<EmbeddedLogin["run"]>[0];
type Outcome = Awaited<ReturnType<EmbeddedLogin["run"]>>;
type Child = Pick<ChildProcessByStdio<Writable, Readable, null>, "stdin" | "stdout" | "kill" | "once">;

export type EmbeddedLoginSpawn = (command: string, args: readonly string[], options: { env: NodeJS.ProcessEnv }) => Child;

export interface HelperEmbeddedLoginOptions {
  helperPath: string;
  /** %LOCALAPPDATA%\Ludiary\tmp: the helper only accepts profile folders directly under it (ADR 80, B4). */
  tmpRoot: string;
  /** Environment of the server; every WEBVIEW2_* variable is dropped before the helper starts (ADR 80, A2). */
  env?: NodeJS.ProcessEnv;
  spawn?: EmbeddedLoginSpawn;
  /** Receives only a code, never a path or a value. */
  log?: (code: "webview-cleanup-failed") => void;
  killAfterMs?: number;
  cleanupWindowMs?: number;
  retryEveryMs?: number;
  sweepEveryMs?: number;
}

const MAX_LINE = 64 * 1024;
const MAX_BLOCKED = 32;
const HOST = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/;
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/;
const PREFIX = "webview-";

/** The environment for the helper: a copy without any WEBVIEW2_* variable (case-insensitive). */
export function helperEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const out: NodeJS.ProcessEnv = {};
  for (const [k, v] of Object.entries(env)) if (!k.toUpperCase().startsWith("WEBVIEW2_")) out[k] = v;
  return out;
}

/** Removes a tree without following links: a junction or symlink is removed as a link, its target stays intact. */
export function removeTree(path: string): void {
  const st = lstatSync(path);
  if (st.isSymbolicLink() || !st.isDirectory()) {
    try {
      unlinkSync(path);
    } catch {
      rmdirSync(path); // a junction is removed with rmdir
    }
    return;
  }
  for (const name of readdirSync(path)) removeTree(join(path, name));
  rmdirSync(path);
}

/**
 * EmbeddedLogin through `ludiary-tray.exe --embedded-login` (ADR 80). It has its own runner, not the HelperRunner:
 * stdin stays open after the request, because the helper reads its closing as "cancel".
 */
export class HelperProcessEmbeddedLogin implements EmbeddedLogin {
  private active: { abort: () => void } | null = null;
  private disposed = false;
  private timer: NodeJS.Timeout | null = null;
  private readonly background = new Set<Promise<void>>();
  private readonly o: Required<Omit<HelperEmbeddedLoginOptions, "spawn" | "log" | "env">> & HelperEmbeddedLoginOptions;

  constructor(options: HelperEmbeddedLoginOptions) {
    this.o = { killAfterMs: 3000, cleanupWindowMs: 5000, retryEveryMs: 250, sweepEveryMs: 10 * 60_000, ...options };
  }

  /** Server start: removes leftovers of earlier runs and keeps trying every 10 minutes. */
  start(): void {
    this.sweepOnce();
    this.timer = setInterval(() => this.active === null && this.sweepOnce(), this.o.sweepEveryMs);
    this.timer.unref();
  }

  /** Server shutdown: ends the window, stops the timer and tries once more to delete the profiles. */
  dispose(): void {
    this.disposed = true;
    this.active?.abort();
    if (this.timer) {
      clearInterval(this.timer);
      this.sweepOnce(); // only a server that started the sweeps (never the launcher) deletes profiles
    }
  }

  /** Resolves when background cleanups have finished (used by tests and by an orderly shutdown). */
  async idle(): Promise<void> {
    while (this.background.size > 0) await Promise.allSettled([...this.background]);
  }

  async run(req: Request, signal: AbortSignal): Promise<Outcome> {
    if (this.disposed) return { kind: "failed", reason: "failed" };
    if (this.active) return { kind: "unavailable", reason: "busy" };
    let abort: () => void = () => {};
    this.active = { abort: () => abort() }; // claimed before any await: one window at a time
    let dir = "";
    try {
      this.sweepOnce(); // retry what an earlier login could not delete (A3)
      mkdirSync(this.o.tmpRoot, { recursive: true });
      dir = mkdtempSync(join(this.o.tmpRoot, PREFIX));
      const line = JSON.stringify({ ...req, dataDir: dir });
      if (Buffer.byteLength(line) > MAX_LINE) return { kind: "failed", reason: "failed" };
      return await this.runChild(req, line, signal, (fn) => (abort = fn));
    } catch {
      return { kind: "failed", reason: "failed" };
    } finally {
      this.active = null;
      if (dir) this.cleanupInBackground(dir);
    }
  }

  private runChild(req: Request, line: string, signal: AbortSignal, setAbort: (fn: () => void) => void): Promise<Outcome> {
    return new Promise<Outcome>((resolve) => {
      const start = this.o.spawn ?? defaultSpawn(this.o.helperPath);
      let child: Child;
      try {
        child = start(this.o.helperPath, ["--embedded-login"], { env: helperEnv(this.o.env ?? process.env) });
      } catch {
        resolve({ kind: "failed", reason: "failed" });
        return;
      }
      let first: string | null = null;
      let buffered = "";
      let exited = false;
      let aborted = false;
      let killer: NodeJS.Timeout | null = null;

      const finish = (code: number | null): void => {
        if (exited) return;
        exited = true;
        if (killer) clearTimeout(killer);
        signal.removeEventListener("abort", onAbort);
        if (aborted) return resolve({ kind: "cancelled", blockedHosts: [] });
        resolve(first === null ? { kind: "failed", reason: "failed" } : interpret(first, code, req));
      };
      const onAbort = (): void => {
        if (aborted || exited) return;
        aborted = true;
        child.stdin.end(); // the helper reads the closing of stdin as "cancel"
        killer = setTimeout(() => child.kill(), this.o.killAfterMs);
      };
      setAbort(onAbort);

      child.stdout.setEncoding("utf8");
      child.stdout.on("data", (chunk: string) => {
        if (first !== null) return;
        buffered += chunk;
        const nl = buffered.indexOf("\n");
        if (nl >= 0) first = buffered.slice(0, nl);
        else if (buffered.length > MAX_LINE) {
          buffered = "";
          first = ""; // too long: it will not parse
          child.kill();
        }
        if (first !== null && first.length > MAX_LINE) first = "";
      });
      child.stdin.on("error", () => {});
      child.once("error" as never, () => finish(null));
      child.once("close", (code: number | null) => finish(code));
      if (signal.aborted) onAbort();
      else signal.addEventListener("abort", onAbort, { once: true });
      if (!aborted) child.stdin.write(line + "\n"); // no end(): stdin stays open
    });
  }

  private sweepOnce(): void {
    let names: string[];
    try {
      names = readdirSync(this.o.tmpRoot).filter((n) => n.startsWith(PREFIX));
    } catch {
      return; // no tmp folder yet
    }
    for (const n of names) this.tryRemove(join(this.o.tmpRoot, n));
  }

  private tryRemove(path: string): boolean {
    try {
      removeTree(path);
      return true;
    } catch (e) {
      return (e as NodeJS.ErrnoException).code === "ENOENT";
    }
  }

  /** Deletes the profile once the helper is gone, retrying for a while: WebView2 processes release it late. */
  private cleanupInBackground(dir: string): void {
    const job = (async () => {
      const until = Date.now() + this.o.cleanupWindowMs;
      for (;;) {
        if (this.tryRemove(dir)) return;
        if (Date.now() >= until || this.disposed) break;
        await new Promise((r) => setTimeout(r, this.o.retryEveryMs));
      }
      this.o.log?.("webview-cleanup-failed"); // no path; the next login, the timer or shutdown retry
    })().finally(() => this.background.delete(job));
    this.background.add(job);
  }
}

function defaultSpawn(helperPath: string): EmbeddedLoginSpawn {
  return (_command, args, options) =>
    spawn(helperPath, [...args], { stdio: ["pipe", "pipe", "ignore"], windowsHide: false, env: options.env, shell: false });
}

const failed = (reason: "capture-missing" | "failed"): Outcome => ({ kind: "failed", reason });

/** Validates the helper's line: only the requested names, text, within maxLength, no control characters. */
export function interpret(line: string, exitCode: number | null, req: Request): Outcome {
  let data: unknown;
  try {
    data = JSON.parse(line);
  } catch {
    return failed("failed");
  }
  if (typeof data !== "object" || data === null || Array.isArray(data)) return failed("failed");
  const obj = data as Record<string, unknown>;
  if (typeof obj["error"] === "string") {
    if (obj["error"] === "runtime-missing") return { kind: "unavailable", reason: "runtime-missing" };
    return failed(obj["error"] === "capture-missing" ? "capture-missing" : "failed");
  }
  if (exitCode !== 0) return failed("failed");
  const blocked = obj["blockedHosts"];
  if (!Array.isArray(blocked) || blocked.length > MAX_BLOCKED || !blocked.every((h) => typeof h === "string" && HOST.test(h))) {
    return failed("failed");
  }
  const blockedHosts = blocked as string[];
  if (obj["cancelled"] === true) return { kind: "cancelled", blockedHosts };
  const captured = obj["captured"];
  if (typeof captured !== "object" || captured === null || Array.isArray(captured)) return failed("failed");
  const got = captured as Record<string, unknown>;
  const wanted = new Set(req.capture.map((c) => c.name));
  if (Object.keys(got).some((k) => !wanted.has(k))) return failed("failed");
  const values: Record<string, Secret> = {};
  for (const c of req.capture) {
    const v = got[c.name];
    if (typeof v !== "string" || v.length === 0 || v.length > c.maxLength || CONTROL.test(v)) return failed("capture-missing");
    values[c.name] = makeSecret(v);
  }
  return { kind: "captured", values, blockedHosts };
}
