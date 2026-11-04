// Windows side of the updater port (ADR 90 point 12): where the stable launcher lives and how to hand over to it.
import { spawn } from "node:child_process";
import { statfs } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

export interface WindowsUpdatePlatform {
  readonly target: "windows-x64";
  readonly installRoot: string | null;
  freeBytes(dir: string): Promise<number>;
  restartIntoLauncher(): Promise<void>;
}

/** `installDir` is the folder of the running Ludiary.exe; it is managed by the stable launcher only when it is `app-<version>`. */
export function createWindowsUpdatePlatform(opts: { installDir: string; version: string }): WindowsUpdatePlatform {
  const installRoot = basename(opts.installDir) === `app-${opts.version}` ? dirname(opts.installDir) : null;
  return {
    target: "windows-x64",
    installRoot,
    async freeBytes(dir) {
      const s = await statfs(dir);
      return Number(s.bavail) * Number(s.bsize);
    },
    async restartIntoLauncher() {
      if (installRoot === null) throw new Error("not running from an app-<version> folder");
      // Detached and independent: the server stops right after and the launcher waits for its instance lock to be released.
      const child = spawn(join(installRoot, "Ludiary.exe"), ["--after-stop"], { detached: true, stdio: "ignore", windowsHide: true });
      await new Promise<void>((resolve, reject) => {
        child.once("error", reject);
        child.once("spawn", resolve);
      });
      child.unref();
    },
  };
}
