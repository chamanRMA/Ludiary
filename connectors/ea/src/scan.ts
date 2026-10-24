import {
  ConnectorError,
  PathEscapesRootsError,
  type ConnectorErrorCode,
  type DiscoveryContext,
  type InstalledEntry,
  type ResolvedLocation,
  type ScanContext,
  type ScanResult,
  type ScanRoot,
  isStrictLocalPath,
} from "@ludiary/contracts";
import { MAX_IDS, parseInstallerData } from "./installerdata";

const MAX_CANDIDATES = 2000;
export const INSTALLER_DATA = ["__Installer", "installerdata.xml"] as const;

/** Same classification as GOG (ADR 81): disk-caused errors never stop the scan; other 'internal' propagate. */
export function isHandled(e: unknown): e is ConnectorError {
  return (
    e instanceof PathEscapesRootsError ||
    (e instanceof ConnectorError && (e.code === "scan.root-unreadable" || e.code === "store.unexpected-response"))
  );
}

/** Title of the file, else the folder name, else "EA <id>" (data, not interface text). */
export function titleOf(fromFile: string | null, folder: string, id: string): string {
  if (fromFile !== null && fromFile !== "") return fromFile;
  const trimmed = folder.replace(/[\\/]+$/, "");
  const last = trimmed.slice(trimmed.lastIndexOf("\\") + 1);
  const t = [...last.replace(/\p{Cc}/gu, "").trim()].slice(0, 200).join("").trim();
  return t === "" ? `EA ${id}` : t;
}

/** __Installer\installerdata.xml in each root and its direct subfolders (ADR 81, point 3). */
export async function scanEaInstalled(ctx: ScanContext): Promise<ScanResult> {
  const entries: InstalledEntry[] = [];
  const unreadableRoots: { root: ScanRoot; code: ConnectorErrorCode }[] = [];
  const seen = new Set<string>();
  const counts = { invalidFiles: 0, ignoredIds: 0, duplicates: 0 };
  let done = 0;
  // A file locked right now makes the root unreadable so the core keeps what it knew there (ADR 72).
  const partial = new Map<string, { root: ScanRoot; code: ConnectorErrorCode }>();

  /** Returns true if the file could not be read now. Nothing handled escapes: a bad candidate is skipped. */
  const scanFolder = async (dir: string): Promise<boolean> => {
    const file = ctx.fs.join(dir, ...INSTALLER_DATA);
    try {
      if (!(await ctx.fs.exists(file))) return false;
      const data = parseInstallerData(await ctx.fs.readText(file));
      if (data === null) {
        counts.invalidFiles++;
        ctx.log.warn("EA installerdata skipped", { code: "store.unexpected-response" });
        return false;
      }
      counts.ignoredIds += Math.max(0, data.ids.length - MAX_IDS);
      const id = data.ids[0] as string;
      if (seen.has(id)) {
        counts.duplicates++;
        ctx.log.info("duplicate EA game skipped", { gameId: id });
        return false;
      }
      seen.add(id);
      entries.push({ storeGameId: id, kind: "game", title: titleOf(data.title, dir, id), installPath: dir });
      return false;
    } catch (e) {
      if (!isHandled(e)) throw e;
      if (e instanceof PathEscapesRootsError) {
        ctx.log.warn("EA candidate folder leaves the roots; skipped");
        return false;
      }
      if (e.code === "store.unexpected-response") {
        // Over 1 MiB or not a regular file: counts as an invalid file.
        counts.invalidFiles++;
        ctx.log.warn("EA installerdata skipped", { code: e.code });
        return false;
      }
      ctx.log.warn("EA installerdata unreadable", { code: e.code });
      return true;
    }
  };

  for (const root of ctx.roots) {
    ctx.signal.throwIfAborted();
    ctx.progress.report({ done, total: ctx.roots.length });
    done++;
    try {
      const subdirs = (await ctx.fs.readDir(root.path))
        .filter((e) => e.isDirectory)
        .map((e) => e.name)
        .sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" }))
        .slice(0, MAX_CANDIDATES);
      let locked = await scanFolder(root.path);
      for (const name of subdirs) {
        ctx.signal.throwIfAborted();
        locked = (await scanFolder(ctx.fs.join(root.path, name))) || locked;
      }
      if (locked) partial.set(root.path, { root, code: "scan.root-unreadable" });
    } catch (e) {
      if (!isHandled(e)) throw e;
      partial.delete(root.path);
      unreadableRoots.push({ root, code: e instanceof PathEscapesRootsError ? "scan.root-unreadable" : e.code });
    }
  }
  unreadableRoots.push(...partial.values());
  if (counts.invalidFiles + counts.ignoredIds + counts.duplicates > 0) ctx.log.warn("EA installs skipped", counts);
  return { entries, unreadableRoots };
}

const SETTINGS_FILE_RE = /^(?:machine|user_\d{1,24})\.ini$/i;
const MAX_SETTINGS_FILES = 16;
const MAX_SETTINGS_BYTES = 64 * 1024;
const MAX_PATH_CHARS = 520;
const KEYS = ["user.downloadinplacedir", "machine.downloadinplacedir"];

/** Value of `downloadinplacedir` as a clean local path, or null (missing key or invalid path). Pure. */
export function parseDownloadInPlaceDir(text: string): { found: boolean; path: string | null } {
  for (const line of text.split(/\r?\n/)) {
    const eq = line.indexOf("=");
    if (eq < 0 || !KEYS.includes(line.slice(0, eq).trim().toLowerCase())) continue;
    let v = line.slice(eq + 1).trim();
    if (v.length > MAX_PATH_CHARS) return { found: true, path: null };
    let end = v.length;
    while (end > 3 && v[end - 1] === "\\") end--; // keeps the backslash of a drive root such as F:\
    v = v.slice(0, end);
    return { found: true, path: isStrictLocalPath(v) ? v : null };
  }
  return { found: false, path: null };
}

/**
 * Library folders (ADR 81, EAD6): the default folders that exist plus `downloadinplacedir` of the EA app settings.
 * The settings folders are only read, never returned. Counters only in the log: file names carry the account id.
 */
export async function discoverEaRoots(ctx: DiscoveryContext): Promise<readonly ResolvedLocation[]> {
  const out: ResolvedLocation[] = [];
  const seen = new Set<string>();
  const add = (path: string): void => {
    const key = (path.length > 3 && path.endsWith("\\") ? path.slice(0, -1) : path).toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ declarationId: "ea-libraries", path, tag: "library" });
  };
  for (const loc of ctx.locations) if (loc.declarationId === "ea-libraries") add(loc.path);

  const c = { files: 0, unreadable: 0, invalidPaths: 0 };
  for (const loc of ctx.locations) {
    if (loc.declarationId !== "ea-settings") continue;
    ctx.signal.throwIfAborted();
    try {
      if (!(await ctx.fs.exists(loc.path))) continue; // absent (no EA app) is not unreadable
      const names = (await ctx.fs.readDir(loc.path))
        .filter((e) => !e.isDirectory && SETTINGS_FILE_RE.test(e.name))
        .map((e) => e.name)
        .sort()
        .slice(0, MAX_SETTINGS_FILES);
      for (const name of names) {
        ctx.signal.throwIfAborted();
        try {
          c.files++;
          const r = parseDownloadInPlaceDir(new TextDecoder().decode(await ctx.fs.readBytes(ctx.fs.join(loc.path, name), MAX_SETTINGS_BYTES)));
          if (r.path !== null) add(r.path);
          else if (r.found) c.invalidPaths++;
        } catch (e) {
          if (!isHandled(e)) throw e;
          c.unreadable++;
        }
      }
    } catch (e) {
      if (!isHandled(e)) throw e;
      c.unreadable++;
    }
  }
  if (c.unreadable + c.invalidPaths > 0) ctx.log.warn("EA settings skipped", c);
  // Partial roots must not replace the saved ones (a root like F:\ would vanish): the core keeps them on this error.
  if (c.unreadable > 0) throw new ConnectorError("scan.root-unreadable", "Some EA settings could not be read");
  return out;
}
