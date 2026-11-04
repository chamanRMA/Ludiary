import type { UserFolders } from "@ludiary/contracts";
import type { HelperRunner } from "./helper-io";

/** Parses the answer of `ludiary-tray.exe --known-folder documents`: {"path"} on success, anything else is null (ADR 89). */
export function parseKnownFolderResponse(text: string): string | null {
  try {
    const obj = (JSON.parse(text.trim().split("\n")[0] ?? "") ?? {}) as { path?: unknown };
    const path = obj.path;
    return typeof path === "string" && /^([a-z]:[\\/]|\\\\[^\\/])/i.test(path) && !path.includes("\0") ? path : null;
  } catch {
    return null;
  }
}

/** UserFolders through the Go helper; follows OneDrive redirection. The helper reads no stdin. */
export class HelperProcessUserFolders implements UserFolders {
  constructor(private readonly runHelper: HelperRunner) {}

  async documents(): Promise<string | null> {
    try {
      return parseKnownFolderResponse(await this.runHelper(["--known-folder", "documents"], "", { timeoutMs: 10_000 }));
    } catch {
      return null;
    }
  }
}
