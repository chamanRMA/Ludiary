import { spawn as nodeSpawn, type ChildProcess, type SpawnOptions } from "node:child_process";
import type { ProcessLauncher } from "@ludiary/contracts";

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

export interface WindowsProcessLauncherOptions {
  /** Schemes the connectors declared (lower-case), e.g. ["steam"]. */
  allowedSchemes: readonly string[];
  /** Injected in tests so nothing is really opened. */
  spawn?: SpawnFn;
  env?: NodeJS.ProcessEnv;
}

/** ProcessLauncher for Windows. This cut supports only 'uri'; 'exec' arrives with the GOG connector. */
export function createWindowsProcessLauncher(opts: WindowsProcessLauncherOptions): ProcessLauncher {
  const allowed = opts.allowedSchemes.map((s) => s.toLowerCase());
  return {
    kinds: ["uri"],
    async openUri(uri) {
      validateLaunchUri(uri, allowed);
      await openWithShellHandler(uri, opts.spawn, opts.env);
    },
    exec() {
      return Promise.reject(new Error("exec is not supported in this build"));
    },
  };
}
