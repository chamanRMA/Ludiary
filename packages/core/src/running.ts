// ADR 92 point 6: is a game running? Pure comparison of process paths against stored install folders.
import type { Env } from "./env";

const RUNNING_TIMEOUT_MS = 5_000;
const norm = (p: string) => p.toLowerCase().replace(/\//g, "\\");
const DRIVE_ROOT = /^[a-z]:\\?$/;

/** Folders to match against: lowercase, `\` at the end; a drive root would make any process count, so it is dropped. */
export function installFolders(paths: readonly string[]): string[] {
  return paths
    .map(norm)
    .filter((p) => p !== "" && !DRIVE_ROOT.test(p))
    .map((p) => (p.endsWith("\\") ? p : `${p}\\`));
}

export function anyInside(processes: readonly string[], folders: readonly string[]): boolean {
  return processes.some((raw) => {
    const p = norm(raw);
    return folders.some((f) => p.startsWith(f));
  });
}

export function createRunningCheck(env: Env): () => Promise<boolean> {
  const { deps } = env;
  return async () => {
    if (!deps.processes) return false;
    try {
      const folders = installFolders(await deps.library.listGameInstallPaths());
      if (folders.length === 0) return false;
      return anyInside(await deps.processes.listExecutables(deps.clock.timeout(RUNNING_TIMEOUT_MS)), folders);
    } catch (e) {
      deps.log.warn("Could not list running processes", { error: e instanceof Error ? e.name : "unknown" });
      return false;
    }
  };
}
