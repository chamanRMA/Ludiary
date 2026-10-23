import { isStrictLocalPath } from "@ludiary/contracts";

/**
 * Registry paths come with '/' and a trailing slash (U1). Returns the backslash form without trailing slash, or null
 * if it is not a local folder strictly below a drive root ("D:\" is not a game folder).
 */
export function gameFolder(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const p = raw.replace(/\//g, "\\").replace(/\\+$/, "");
  // Empty components ("D:\a\\b") are rejected too: stricter than the platform on purpose.
  return p.length > 3 && isStrictLocalPath(p) && !p.includes("\\\\") ? p : null;
}
