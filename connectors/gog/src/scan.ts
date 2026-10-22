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
} from "@ludiary/contracts";
import { parseGogInfo } from "./info";

const INFO_RE = /^goggame-(\d{1,20})\.info$/i;
const MAX_CANDIDATES = 2000;

/** Same classification as Steam (ADR 76): disk-caused errors never stop the scan; other 'internal' propagate. */
function isHandled(e: unknown): e is ConnectorError {
  return (
    e instanceof PathEscapesRootsError ||
    (e instanceof ConnectorError && (e.code === "scan.root-unreadable" || e.code === "store.unexpected-response"))
  );
}

const norm = (p: string): string => p.replace(/\//g, "\\").replace(/\\+$/, "");

export async function discoverGogRoots(ctx: DiscoveryContext): Promise<readonly ResolvedLocation[]> {
  const out: ResolvedLocation[] = [];
  const seen = new Set<string>();
  const add = (declarationId: string, path: string, tag: string): void => {
    const key = norm(path).toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ declarationId, path, tag });
  };
  for (const loc of ctx.locations) {
    if (loc.declarationId === "gog-library") add(loc.declarationId, loc.path, "library");
    else if (loc.declarationId === "gog-games") {
      const p = norm(loc.path);
      const parent = p.slice(0, Math.max(0, p.lastIndexOf("\\")));
      // Parent is a drive root ("D:") or there is none: scan only the game folder, not the whole drive.
      if (/^[A-Za-z]:$/.test(parent) || parent === "") add(loc.declarationId, loc.path, "game");
      else add(loc.declarationId, parent, "library");
    }
  }
  return out;
}

export async function scanGogInstalled(ctx: ScanContext): Promise<ScanResult> {
  const entries: InstalledEntry[] = [];
  const unreadableRoots: { root: ScanRoot; code: ConnectorErrorCode }[] = [];
  const seen = new Set<string>();
  let dlcs = 0;
  let done = 0;
  // Roots where some file could not be read right now (locked, I/O): reported unreadable so the core keeps
  // what it knew installed there instead of retiring those games for a passing failure (ADR 72).
  const partial = new Map<string, { root: ScanRoot; code: ConnectorErrorCode }>();

  /** Reads the .info files of one folder. Returns true if some file was unreadable. */
  const scanFolder = async (dir: string): Promise<boolean> => {
    const files = (await ctx.fs.readDir(dir))
      .filter((e) => !e.isDirectory && INFO_RE.test(e.name))
      .sort((a, b) => (a.name < b.name ? -1 : 1));
    let locked = false;
    for (const f of files) {
      ctx.signal.throwIfAborted();
      const fileId = (INFO_RE.exec(f.name) as RegExpExecArray)[1] as string;
      try {
        const info = parseGogInfo(await ctx.fs.readText(ctx.fs.join(dir, f.name)));
        if (info.gameId !== fileId) {
          ctx.log.warn("goggame info id differs from its file name; skipped", { productId: fileId });
          continue;
        }
        if (info.rootGameId !== undefined && info.rootGameId !== info.gameId) {
          dlcs++;
          continue;
        }
        if (seen.has(info.gameId)) {
          ctx.log.info("duplicate GOG game skipped", { productId: info.gameId });
          continue;
        }
        seen.add(info.gameId);
        entries.push({ storeGameId: info.gameId, kind: "game", title: info.name ?? `GOG ${info.gameId}`, installPath: dir });
      } catch (e) {
        if (!isHandled(e)) throw e;
        // Only the id and a code are logged: a message could carry a path.
        ctx.log.warn("goggame info skipped", { productId: fileId, code: e instanceof PathEscapesRootsError ? "link-escapes-roots" : e.code });
        if (!(e instanceof PathEscapesRootsError) && e.code === "scan.root-unreadable") locked = true;
      }
    }
    return locked;
  };

  for (const root of ctx.roots) {
    ctx.signal.throwIfAborted();
    ctx.progress.report({ done, total: ctx.roots.length });
    done++;
    try {
      const subdirs = (await ctx.fs.readDir(root.path))
        .filter((e) => e.isDirectory)
        .map((e) => e.name)
        .sort()
        .slice(0, MAX_CANDIDATES);
      let locked = await scanFolder(root.path);
      for (const name of subdirs) {
        ctx.signal.throwIfAborted();
        try {
          locked = (await scanFolder(ctx.fs.join(root.path, name))) || locked;
        } catch (e) {
          if (!isHandled(e)) throw e;
          if (e instanceof PathEscapesRootsError) ctx.log.warn("GOG candidate folder leaves the roots; skipped");
          else locked = true;
        }
      }
      if (locked) partial.set(root.path, { root, code: "scan.root-unreadable" });
    } catch (e) {
      if (!isHandled(e)) throw e;
      // A root that is a link leaving the roots counts as unreadable.
      partial.delete(root.path);
      unreadableRoots.push({ root, code: e instanceof PathEscapesRootsError ? "scan.root-unreadable" : e.code });
    }
  }
  unreadableRoots.push(...partial.values());
  if (dlcs > 0) ctx.log.info("GOG DLC entries skipped", { dlcs });
  return { entries, unreadableRoots };
}
