// Validation of everything a connector returns (ADR 40 rule 4, ADR 72). Pure except for LocalFiles lookups.
import type { EntryMedia, ExternalIds, InstalledEntry, LocalFiles, ResolvedLocation, StoreConnector, StoreEntry } from "@ludiary/contracts";
import { ConnectorError, normalizeTitle } from "@ludiary/contracts";
import type { CoreLogger, LibraryEntry, ScannedEntry } from "./model";

export const MAX_ENTRIES = 10_000;
export const MAX_DISCOVERED_ROOTS = 64;
const CONTROL = /\p{Cc}/u;
const ID_FORBIDDEN = /[\p{Cc}\p{Zl}\p{Zp}]/u;
const MAX_URL = 2048;

export const isNonEmptyText = (s: unknown, max: number): s is string =>
  typeof s === "string" && s.trim().length > 0 && s.length <= max && !CONTROL.test(s);

/** ADR 84: a title given by resolveTitles. Control characters become spaces, then trimmed; empty or over 300: undefined. */
export function cleanTitle(t: unknown): string | undefined {
  if (typeof t !== "string") return undefined;
  const v = t.replace(/\p{Cc}/gu, " ").trim();
  return v.length > 0 && v.length <= 300 ? v : undefined;
}

export function validateMedia(media: unknown, hosts: readonly string[]): EntryMedia | undefined {
  if (!media || typeof media !== "object") return undefined;
  const out: { coverUrl?: string; heroUrl?: string; iconUrl?: string } = {};
  for (const key of ["coverUrl", "heroUrl", "iconUrl"] as const) {
    const v = (media as Record<string, unknown>)[key];
    if (typeof v !== "string" || v.length > MAX_URL || CONTROL.test(v)) continue;
    let u: URL;
    try {
      u = new URL(v);
    } catch {
      continue;
    }
    if (u.protocol !== "https:" || u.username !== "" || u.password !== "" || u.port !== "" || !hosts.includes(u.hostname.toLowerCase()) || u.href.length > MAX_URL) continue;
    out[key] = u.href;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function validateExternalIds(ids: unknown): ExternalIds | undefined {
  if (!ids || typeof ids !== "object") return undefined;
  const out: { igdb?: string; rawg?: string; steamAppId?: string } = {};
  for (const key of ["igdb", "rawg", "steamAppId"] as const) {
    const v = (ids as Record<string, unknown>)[key];
    if (typeof v === "string" && v.length > 0 && v.length <= 64 && !CONTROL.test(v)) out[key] = v;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function validateLaunchData(d: unknown): Record<string, string> | null | "invalid" {
  if (d === undefined || d === null) return null;
  if (typeof d !== "object" || Array.isArray(d)) return "invalid";
  const entries = Object.entries(d as Record<string, unknown>);
  if (entries.length > 16) return "invalid";
  const out: Record<string, string> = {};
  for (const [k, v] of entries) {
    if (k.length === 0 || k.length > 64 || typeof v !== "string" || v.length > 1024) return "invalid";
    out[k] = v;
  }
  return out;
}

const validId = (id: unknown): id is string =>
  typeof id === "string" && id.length >= 1 && id.length <= 160 && id.trim() !== "" && !ID_FORBIDDEN.test(id);

/** ADR 83 point 13: an invalid base id is treated as absent (orphan) and counted; it never makes the snapshot lossy. */
function cleanBase(base: unknown, id: string, c: { dlcNoBase: number; dlcBadBase: number }): string | null {
  if (base === undefined || base === null || base === id) {
    c.dlcNoBase++;
    return null;
  }
  if (!validId(base)) {
    c.dlcBadBase++;
    return null;
  }
  return base;
}

export interface ValidateEntriesArgs {
  entries: unknown;
  /** Paths of the roots of the scan context. */
  roots: readonly string[];
  connector: Pick<StoreConnector, "id" | "mediaHosts" | "capabilities">;
  files: LocalFiles;
  log: CoreLogger;
}

export async function insideAny(files: LocalFiles, path: string, roots: readonly string[]): Promise<boolean> {
  for (const r of roots) if (await files.isInside(path, r)) return true;
  return false;
}

/**
 * Keeps the valid entries; an invalid one is dropped and logged (no title or path in the log). A repeated id keeps the first.
 * Entries without a store id are dropped and counted. A DLC entry is kept only if the connector declares `dlc` for scans (ADR 83).
 */
export async function validateEntries(a: ValidateEntriesArgs): Promise<ScannedEntry[]> {
  if (!Array.isArray(a.entries)) {
    throw new ConnectorError("store.unexpected-response", "scanInstalled returned entries that are not a list");
  }
  const list = a.entries as readonly InstalledEntry[];
  if (list.length > MAX_ENTRIES) a.log.warn("Scan returned too many entries; extra ones ignored", { connector: a.connector.id, count: list.length });
  const out: ScannedEntry[] = [];
  const seen = new Set<string>();
  let invalid = 0;
  let unsupported = 0;
  let duplicates = 0;
  const dlcCounts = { dlc: 0, dlcUnsupported: 0, dlcNoBase: 0, dlcBadBase: 0 };
  const dlcOk = a.connector.capabilities.dlc === "scan" || a.connector.capabilities.dlc === "library-and-scan";
  for (const e of list.slice(0, MAX_ENTRIES)) {
    if (!e || typeof e !== "object") {
      invalid++;
      continue;
    }
    const id = e.storeGameId;
    if (id === undefined) {
      unsupported++;
      continue;
    }
    if (typeof id !== "string" || id.length < 1 || id.length > 160 || id.trim() === "" || ID_FORBIDDEN.test(id)) {
      invalid++;
      continue;
    }
    if (e.kind !== "game" && e.kind !== "dlc") {
      invalid++;
      continue;
    }
    if (!isNonEmptyText(e.title, 300)) {
      invalid++;
      continue;
    }
    if (typeof e.installPath !== "string" || !a.files.isAbsolute(e.installPath) || !(await insideAny(a.files, e.installPath, a.roots))) {
      invalid++;
      continue;
    }
    if (e.kind === "dlc" && !dlcOk) {
      dlcCounts.dlcUnsupported++;
      continue;
    }
    // A DLC keeps no launch data (ADR 83): ignored, not validated.
    const launchData = e.kind === "dlc" ? null : validateLaunchData(e.launchData);
    if (launchData === "invalid") {
      invalid++;
      continue;
    }
    if (seen.has(id)) {
      duplicates++;
      continue;
    }
    seen.add(id);
    const title = e.title.trim();
    if (e.kind === "dlc") {
      dlcCounts.dlc++;
      out.push({
        storeGameId: id,
        kind: "dlc",
        baseStoreGameId: cleanBase(e.baseStoreGameId, id, dlcCounts),
        title,
        normalizedTitle: normalizeTitle(title),
        installPath: a.files.normalize(e.installPath),
        launchData: null,
      });
      continue;
    }
    const media = validateMedia(e.media, a.connector.mediaHosts);
    const externalIds = validateExternalIds(e.externalIds);
    out.push({
      storeGameId: id,
      kind: "game",
      title,
      normalizedTitle: normalizeTitle(title),
      installPath: a.files.normalize(e.installPath),
      launchData,
      ...(externalIds ? { externalIds } : {}),
      ...(media ? { media } : {}),
    });
  }
  if (invalid + unsupported + duplicates + dlcCounts.dlcUnsupported + dlcCounts.dlcBadBase > 0) {
    a.log.warn("Some scan entries were not stored", { connector: a.connector.id, invalid, unsupported, duplicates, ...dlcCounts });
  } else if (dlcCounts.dlc > 0) a.log.info("Scan DLC entries", { connector: a.connector.id, ...dlcCounts });
  return out;
}

export interface ValidatedRoot {
  path: string;
  pathKey: string;
  declarationId: string;
  tag: string | null;
}

/** Discovered roots (ADR 72): absolute, existing directory, at most 64, declared by the connector, no repeats. */
export async function validateDiscoveredRoots(
  returned: unknown,
  connector: Pick<StoreConnector, "id" | "locations">,
  files: LocalFiles,
  log: CoreLogger,
): Promise<{ roots: ValidatedRoot[]; truncated: boolean; unresolved: Set<string> }> {
  if (!Array.isArray(returned)) throw new ConnectorError("store.unexpected-response", "discoverRoots did not return a list");
  const declared = new Set(connector.locations.map((l) => l.id));
  const out: ValidatedRoot[] = [];
  const keys = new Set<string>();
  let dropped = 0;
  let truncated = false;
  // Strict variant (ADR 79): an unreadable folder throws instead of looking absent, and the caller keeps the stored roots.
  const unresolved = new Set<string>();
  for (const r of returned as readonly ResolvedLocation[]) {
    if (out.length >= MAX_DISCOVERED_ROOTS) {
      truncated = true;
      dropped++;
      continue;
    }
    if (!r || typeof r.path !== "string" || typeof r.declarationId !== "string" || !declared.has(r.declarationId) || !files.isAbsolute(r.path) || !files.isLocalPath(r.path)) {
      dropped++;
      continue;
    }
    const path = files.normalize(r.path);
    const key = files.compareKey(path);
    if (keys.has(key)) {
      dropped++;
      continue;
    }
    let isDir: boolean;
    try {
      isDir = await files.isDirectoryStrict(path);
    } catch {
      // Could not tell (not absent): only this declaration is unresolved, its stored roots stay (ADR 79).
      unresolved.add(r.declarationId);
      dropped++;
      continue;
    }
    if (!isDir) {
      dropped++;
      continue;
    }
    keys.add(key);
    const tag = typeof r.tag === "string" && /^[a-z0-9-]{1,32}$/.test(r.tag) ? r.tag : null;
    out.push({ path, pathKey: key, declarationId: r.declarationId, tag });
  }
  if (dropped > 0) log.warn("Some discovered roots were ignored", { connector: connector.id, dropped });
  return { roots: out, truncated, unresolved };
}

export const MAX_LIBRARY_ENTRIES = 50_000;
const MAX_PLAYTIME_MINUTES = 100_000_000;

export interface LibraryValidation {
  entries: LibraryEntry[];
  /** An entry was invalid or the list was cut: the snapshot can no longer prove that a missing game is gone. */
  lossy: boolean;
}

/**
 * Library snapshot entries (ADR 74 point 7): the same rules as scan entries, plus playtime and last played.
 * An invalid entry is dropped and logged (no title in the log); a repeated id keeps the first. A DLC entry is kept only if the
 * connector declares `dlc` for the library (ADR 83), without media, ids or playtime. Dropping an invalid entry makes the snapshot `lossy`, so the core never disowns on it.
 */
export function validateLibraryEntries(a: {
  entries: unknown;
  connector: Pick<StoreConnector, "id" | "mediaHosts" | "capabilities">;
  log: CoreLogger;
}): LibraryValidation {
  if (!Array.isArray(a.entries)) throw new ConnectorError("store.unexpected-response", "listLibrary returned entries that are not a list");
  const list = a.entries as readonly StoreEntry[];
  const out: LibraryEntry[] = [];
  const seen = new Set<string>();
  let invalid = 0;
  let duplicates = 0;
  const dlcCounts = { dlc: 0, dlcUnsupported: 0, dlcNoBase: 0, dlcBadBase: 0 };
  const dlcOk = a.connector.capabilities.dlc === "library" || a.connector.capabilities.dlc === "library-and-scan";
  for (const e of list.slice(0, MAX_LIBRARY_ENTRIES)) {
    if (!e || typeof e !== "object") {
      invalid++;
      continue;
    }
    const id = e.storeGameId;
    if (typeof id !== "string" || id.length < 1 || id.length > 160 || id.trim() === "" || ID_FORBIDDEN.test(id) || !isNonEmptyText(e.title, 300)) {
      invalid++;
      continue;
    }
    if (e.kind !== "game" && e.kind !== "dlc") {
      invalid++;
      continue;
    }
    const minutes = e.storePlaytimeMinutes;
    if (minutes !== undefined && (!Number.isInteger(minutes) || minutes < 0 || minutes > MAX_PLAYTIME_MINUTES)) {
      invalid++;
      continue;
    }
    let lastPlayed: number | null = null;
    if (e.storeLastPlayedAt !== undefined) {
      lastPlayed = typeof e.storeLastPlayedAt === "string" && e.storeLastPlayedAt.length <= 40 ? Date.parse(e.storeLastPlayedAt) : Number.NaN;
      if (!Number.isFinite(lastPlayed)) {
        invalid++;
        continue;
      }
    }
    if (e.kind === "dlc" && !dlcOk) {
      dlcCounts.dlcUnsupported++; // not a loss: the store does not declare DLC
      continue;
    }
    if (seen.has(id)) {
      duplicates++;
      continue;
    }
    seen.add(id);
    const title = e.title.trim();
    if (e.kind === "dlc") {
      dlcCounts.dlc++;
      out.push({
        storeGameId: id,
        kind: "dlc",
        baseStoreGameId: cleanBase(e.baseStoreGameId, id, dlcCounts),
        ...(e.storeMetadata?.dlcInferred === true ? { dlcInferred: true as const } : {}),
        title,
        normalizedTitle: normalizeTitle(title),
        storePlaytimeMinutes: null,
        storeLastPlayedAt: null,
      });
      continue;
    }
    const media = validateMedia(e.media, a.connector.mediaHosts);
    const externalIds = validateExternalIds(e.externalIds);
    out.push({
      storeGameId: id,
      kind: "game",
      title,
      normalizedTitle: normalizeTitle(title),
      ...(externalIds ? { externalIds } : {}),
      ...(media ? { media } : {}),
      storePlaytimeMinutes: minutes ?? null,
      storeLastPlayedAt: lastPlayed,
    });
  }
  const cut = list.length > MAX_LIBRARY_ENTRIES;
  if (invalid + duplicates + dlcCounts.dlcUnsupported + dlcCounts.dlcBadBase > 0 || cut) {
    a.log.warn("Some library entries were not stored", { connector: a.connector.id, invalid, duplicates, cut, ...dlcCounts });
  } else if (dlcCounts.dlc > 0) a.log.info("Library DLC entries", { connector: a.connector.id, ...dlcCounts });
  return { entries: out, lossy: invalid > 0 || cut };
}
