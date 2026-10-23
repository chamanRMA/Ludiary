// The strict local-path rule (ADR 76 point 4, ADR 78 and 79 audits), in one place so the launcher and the connectors that
// read paths from untrusted files or the registry cannot drift apart. Pure text check, no I/O.
const CONTROL = /\p{Cc}/u;
const LOCAL_ABSOLUTE = /^[A-Za-z]:\\/; // drive letter + backslash: UNC, \\?\ and \\.\ start with two backslashes
const RESERVED = /^(con|prn|aux|nul|conin\$|conout\$|(com|lpt)[0-9¹²³])\s*(\..*)?$/i;

/**
 * True for an absolute Windows path on a drive letter with backslashes only: no UNC or device paths, no control
 * characters, none of `"<>|?*` nor a forward slash, no `:` after the drive (NTFS alternate data streams), no reserved device names, no `..`
 * and no component ending in a dot or a space. Empty components and drive roots are left to the caller.
 */
export const isStrictLocalPath = (p: unknown): p is string =>
  typeof p === "string" &&
  LOCAL_ABSOLUTE.test(p) &&
  !CONTROL.test(p) &&
  !/["<>|?*/]/.test(p) &&
  !p.includes(":", 2) &&
  p.slice(3).split("\\").every((c) => !RESERVED.test(c) && !/[. ]$/.test(c) && c !== "..");
