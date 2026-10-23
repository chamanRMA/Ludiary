import { appendFileSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { homedir, userInfo } from "node:os";
import { join } from "node:path";

/** Content of runtime.json (ADR 53). Written atomically; never holds secrets. */
export interface RuntimeInfo {
  version: string;
  port: number;
  /** PID of the live server, or null after a clean shutdown (the port stays as the preferred one). */
  pid: number | null;
}

export const runtimeFilePath = (dataDir: string) => join(dataDir, "runtime.json");

export function readRuntimeInfo(dataDir: string): RuntimeInfo | null {
  try {
    const raw = JSON.parse(readFileSync(runtimeFilePath(dataDir), "utf8")) as Partial<RuntimeInfo>;
    if (typeof raw.port !== "number" || !Number.isInteger(raw.port) || raw.port < 1 || raw.port > 65535) return null;
    return {
      version: typeof raw.version === "string" ? raw.version : "unknown",
      port: raw.port,
      pid: typeof raw.pid === "number" ? raw.pid : null,
    };
  } catch {
    return null;
  }
}

export function writeRuntimeInfo(dataDir: string, info: RuntimeInfo): void {
  const target = runtimeFilePath(dataDir);
  const tmp = `${target}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(info, null, 2));
  renameSync(tmp, target);
}

const MAX_LOG_BYTES = 512 * 1024;

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const NAME_CHAR = "[\\p{L}\\p{N}_.-]";

function userName(): string {
  try {
    return userInfo().username;
  } catch {
    return "";
  }
}

// Digit/hex lookarounds instead of \b, so an encoded value (id%2F7656119…) is still caught.
// shortcut: a key right after "%3D" (encoded "=") joins the D to the run and is missed; no code path logs encoded queries.
const STEAM_KEY = /(?<![0-9A-Fa-f])[0-9A-Fa-f]{32}(?![0-9A-Fa-f])/g;
const STEAM_ID = /(?<!\d)7656119\d{10}(?!\d)/g;
// ADR 80 point 8: Ubisoft authorization headers, whatever follows "t=".
const UBI_HEADER = /\b(?:Ubi_v1|rm_v1) t=\S+/gi;
// ADR 77 point 5 and ADR 80 (B3): long opaque tokens (GOG, Ubisoft tickets), 64+ chars. Superset of the Ubisoft accepted
// form (adds + / = .). Replaces the ADR 77 pattern. Accepted false positives: long paths, hashes and texts without spaces.
const LONG_TOKEN = /(?<![A-Za-z0-9+/=_.-])[A-Za-z0-9+/=_.-]{64,}/g;

const EPIC_TOKEN = /eg1~[A-Za-z0-9._-]+/g;

/** Builds the redaction patterns for one home folder and user name (exported for tests). */
export function makeRedactor(home: string, user: string): (text: string) => string {
  // Windows paths are case-insensitive and stack traces may use either slash; the lookahead stops
  // C:\Users\ana from matching inside C:\Users\anabel.
  const homePattern = home
    ? new RegExp(`(?:${[home, home.replace(/\\/g, "/")].map(escapeRegExp).join("|")})(?!${NAME_CHAR})`, "giu")
    : null;
  // The bare user name also shows up in redirected folders and messages; very short names would hit ordinary words.
  const userPattern = user.length >= 3 ? new RegExp(`(?<!${NAME_CHAR})${escapeRegExp(user)}(?!${NAME_CHAR})`, "giu") : null;
  return (text) => {
    let out = homePattern ? text.replace(homePattern, "~") : text;
    if (userPattern) out = out.replace(userPattern, "<user>");
    // ADR 74 point 6: the net under Secret. A Steam Web API key (32 hex) and a SteamID64 are never written to a log.
    // Long tokens first: a hex run inside one must not split it below the 64-char threshold.
    // ADR 78: Epic eg1~ tokens (JWT with dots), before the long-token pattern.
    return out.replace(EPIC_TOKEN, "[redacted]").replace(UBI_HEADER, "[redacted]").replace(LONG_TOKEN, "[redacted]").replace(STEAM_KEY, "[redacted]").replace(STEAM_ID, "[redacted]");
  };
}

/**
 * Replaces the user's home folder with "~" and the user name with "<user>" so logs never carry it (ADR 35, invariant 5).
 * shortcut: 8.3 short paths (C:\Users\EXAMPL~1) are not covered; revisit with the real logger of decision 59.
 */
export const redactHome = makeRedactor(homedir(), userName());

/**
 * Minimal file logger with a size cap (one rotated file). Only a stand-in for decision 59.
 * Callers must never pass secrets or personal data (ADR 35).
 */
export function createFileLogger(dataDir: string, name: string) {
  const dir = join(dataDir, "logs");
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${name}.log`);
  return (level: "info" | "warn" | "error", message: string): void => {
    try {
      if (statSync(file).size > MAX_LOG_BYTES) renameSync(file, `${file}.1`);
    } catch {
      /* no log yet */
    }
    appendFileSync(file, `${new Date().toISOString()} ${level} [${process.pid}] ${redactHome(message)}\n`);
  };
}
export type Logger = ReturnType<typeof createFileLogger>;
