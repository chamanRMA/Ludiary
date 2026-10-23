// Copy of the strict local-path rule of platform-windows (process-launcher.ts); a connector must not import it (ADR 38, 79).
const CONTROL = /\p{Cc}/u;
const LOCAL_ABSOLUTE = /^[A-Za-z]:\\/; // UNC, \\?\ and \\.\ start with two backslashes
const RESERVED = /^(con|prn|aux|nul|conin\$|conout\$|(com|lpt)[0-9¹²³])\s*(\..*)?$/i;

export const localPath = (p: unknown): p is string =>
  typeof p === "string" &&
  LOCAL_ABSOLUTE.test(p) &&
  !CONTROL.test(p) &&
  !/["<>|?*/]/.test(p) &&
  !p.includes(":", 2) && // NTFS alternate data streams
  p.slice(3).split("\\").every((c) => !RESERVED.test(c) && !/[. ]$/.test(c) && c !== "..");

/**
 * Registry paths come with '/' and a trailing slash (U1). Returns the backslash form without trailing slash, or null
 * if it is not a local folder strictly below a drive root ("D:\" is not a game folder).
 */
export function gameFolder(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const p = raw.replace(/\//g, "\\").replace(/\\+$/, "");
  // Empty components ("D:\a\\b") are rejected too: stricter than the platform on purpose.
  return p.length > 3 && localPath(p) && !p.includes("\\\\") ? p : null;
}
