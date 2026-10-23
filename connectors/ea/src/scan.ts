import {
  ConnectorError,
  PathEscapesRootsError,
  type ConnectorErrorCode,
  type InstalledEntry,
  type ScanContext,
  type ScanResult,
  type ScanRoot,
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
