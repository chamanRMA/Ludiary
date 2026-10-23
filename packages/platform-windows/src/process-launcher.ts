import { spawn as nodeSpawn, type ChildProcess, type SpawnOptions } from "node:child_process";
import { stat as nodeStat } from "node:fs/promises";
import { ExecError, isStrictLocalPath, type ProcessLauncher } from "@ludiary/contracts";

export type SpawnFn = (command: string, args: readonly string[], options: SpawnOptions) => ChildProcess;

/**
 * Absolute path of rundll32.exe: a bare name would be searched in the PATH and the current directory, so a planted
 * copy could run instead (ADR 72). SystemRoot comes from the environment and must be a local absolute path.
 */
export function rundll32Path(env: NodeJS.ProcessEnv = process.env): string {
  const root = env["SystemRoot"] ?? env["SYSTEMROOT"] ?? env["windir"];
  const base = root && /^[A-Za-z]:[\\/][^\0]*$/.test(root) ? root.replace(/[\\/]+$/, "") : "C:\\Windows";
  return `${base}\\System32\\rundll32.exe`;
}

/** Hands a target to its default handler with rundll32, with no shell (ADR 40 rule 5, 72). Shared by openUrl and openUri. */
export function openWithShellHandler(
  target: string,
  spawnFn: SpawnFn = nodeSpawn as SpawnFn,
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawnFn(rundll32Path(env), ["url.dll,FileProtocolHandler", target], {
      stdio: "ignore",
      windowsHide: true,
      detached: true,
    });
    child.once("error", reject);
    child.once("spawn", () => {
      child.unref();
      resolve();
    });
  });
}

const URI_SHAPE = /^([a-z][a-z0-9+.-]*):[\x21-\x7E]+$/;
const MAX_URI_LENGTH = 2048;

/** Second barrier (the core validated first). Returns the scheme or throws. */
export function validateLaunchUri(uri: string, allowedSchemes: readonly string[]): string {
  if (typeof uri !== "string" || uri.length > MAX_URI_LENGTH) throw new Error("invalid URI");
  const match = URI_SHAPE.exec(uri);
  if (!match) throw new Error("invalid URI"); // also rejects spaces and control characters
  if (/["'`]/.test(uri)) throw new Error("invalid URI");
  if (/%(?![0-9a-fA-F]{2})/.test(uri)) throw new Error("invalid URI");
  const scheme = match[1] as string;
  // http(s) opens the browser through PlatformInfo.openUrl, never as a launch.
  if (scheme === "http" || scheme === "https" || !allowedSchemes.includes(scheme)) {
    throw new Error("URI scheme not allowed");
  }
  return scheme;
}

const CONTROL = /\p{Cc}/u;
const MAX_COMMAND_LINE = 32_000; // CreateProcess limit is 32 767 (ADR 76)

/** Env of the game: the user's, without LUDIARY_* test hooks (ADR 65) or any NODE_* variable. Windows names are case-insensitive. */
export function childEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return Object.fromEntries(Object.entries(env).filter(([k]) => !/^(LUDIARY_|NODE_)/i.test(k)));
}

/** Upper bound of the quoted length of one argument (every quote or backslash counted as escaped). */
const quotedLength = (a: string): number => a.length + 2 + (a.match(/["\\]/g)?.length ?? 0);

const localPath = isStrictLocalPath;

/** Second barrier of exec (ADR 76 point 4). Throws ExecError('rejected'). */
async function checkExec(spec: { executable: string; args: readonly string[]; cwd?: string }, stat: typeof nodeStat): Promise<void> {
  const rejected = new ExecError("rejected");
  const { executable, args, cwd } = spec;
  if (!localPath(executable) || !/\.exe$/i.test(executable)) throw rejected; // .bat/.cmd need a shell since CVE-2024-27980
  if (!Array.isArray(args) || args.some((a) => typeof a !== "string" || CONTROL.test(a))) throw rejected;
  if (quotedLength(executable) + args.reduce((n, a) => n + 1 + quotedLength(a), 0) > MAX_COMMAND_LINE) throw rejected;
  if (cwd !== undefined && !localPath(cwd)) throw rejected;
  try {
    if (!(await stat(executable)).isFile()) throw rejected;
    if (cwd !== undefined && !(await stat(cwd)).isDirectory()) throw rejected;
  } catch {
    throw rejected;
  }
}

export interface WindowsProcessLauncherOptions {
  /** Schemes the connectors declared (lower-case), e.g. ["steam"]. */
  allowedSchemes: readonly string[];
  /** Injected in tests so nothing is really opened. */
  spawn?: SpawnFn;
  env?: NodeJS.ProcessEnv;
  /** Injected in tests. */
  stat?: typeof nodeStat;
}

/** ProcessLauncher for Windows: 'uri' through rundll32 (ADR 72) and 'exec' of a local .exe (ADR 76). */
export function createWindowsProcessLauncher(opts: WindowsProcessLauncherOptions): ProcessLauncher {
  const allowed = opts.allowedSchemes.map((s) => s.toLowerCase());
  return {
    kinds: ["uri", "exec"],
    async openUri(uri) {
      validateLaunchUri(uri, allowed);
      await openWithShellHandler(uri, opts.spawn, opts.env);
    },
    async exec(spec) {
      await checkExec(spec, opts.stat ?? nodeStat);
      await new Promise<void>((resolve, reject) => {
        let child: ChildProcess;
        try {
          // No shell, no windowsVerbatimArguments. windowsHide stays false: a game must not start with SW_HIDE.
          child = (opts.spawn ?? (nodeSpawn as SpawnFn))(spec.executable, spec.args, {
            ...(spec.cwd !== undefined ? { cwd: spec.cwd } : {}),
            detached: true,
            stdio: "ignore",
            windowsHide: false,
            env: childEnv(opts.env ?? process.env),
          });
        } catch {
          return reject(new ExecError("failed"));
        }
        child.once("error", (e: NodeJS.ErrnoException) => reject(new ExecError(e.code === "EACCES" || e.code === "EPERM" ? "denied" : "failed")));
        child.once("spawn", () => {
          child.unref();
          resolve();
        });
      });
    },
  };
}
