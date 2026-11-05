import type { ProcessWatcher } from "@ludiary/contracts";
import type { HelperRunner } from "./helper-io";

export const PROCESS_LIST_TIMEOUT_MS = 5_000;
export const PROCESS_LIST_MAX_BYTES = 4 * 1024 * 1024;
const MAX_PATHS = 8192;
const MAX_PATH_CHARS = 32_767;

/**
 * Parses the one line of `ludiary-tray.exe --processes`: {"paths":[...]}. The helper is trusted less than the code around it:
 * only strings that are local absolute paths (drive letter, not UNC) of at most 32767 characters without NUL are kept.
 * Anything malformed is an empty list. The paths are personal data and are never logged.
 */
export function parseProcessList(text: string): string[] {
  try {
    const paths = (JSON.parse(text.trim().split("\n")[0] ?? "") as { paths?: unknown } | null)?.paths;
    if (!Array.isArray(paths)) return [];
    return paths.filter((p): p is string => typeof p === "string" && p.length <= MAX_PATH_CHARS && /^[a-z]:[\\/]/i.test(p) && !p.includes("\0")).slice(0, MAX_PATHS);
  } catch {
    return [];
  }
}

/** ProcessWatcher through the Go helper (a native snapshot of the processes; no PowerShell, ADR 92). The helper reads no stdin. */
export class HelperProcessWatcher implements ProcessWatcher {
  constructor(private readonly runHelper: HelperRunner) {}

  async listExecutables(signal: AbortSignal): Promise<readonly string[]> {
    const out = await this.runHelper(["--processes"], "", { timeoutMs: PROCESS_LIST_TIMEOUT_MS, maxBytes: PROCESS_LIST_MAX_BYTES, signal });
    return parseProcessList(out);
  }
}
