import {
  ConnectorError,
  PathEscapesRootsError,
  type ConnectorErrorCode,
  type DiscoveryContext,
  type InstalledEntry,
  type ResolvedLocation,
  type ScanContext,
  type ScanResult,
} from "@ludiary/contracts";
import { parseEpicItem } from "./item";
import { EPIC_DATA_ID } from "./manifest";

const ITEM_RE = /\.item$/i;
const MAX_ITEMS = 2000;

/** Same classification as Steam and GOG (ADR 76): disk-caused errors never stop the scan; other 'internal' propagate. */
function isHandled(e: unknown): e is ConnectorError {
  return (
    e instanceof PathEscapesRootsError ||
    (e instanceof ConnectorError && (e.code === "scan.root-unreadable" || e.code === "store.unexpected-response"))
  );
}

const norm = (p: string): string => p.replace(/\//g, "\\").replace(/\\+$/, "");
const key = (p: string): string => norm(p).toLowerCase();
const isInside = (path: string, root: string): boolean => key(path) === key(root) || key(path).startsWith(key(root) + "\\");

/** Names of the .item files of a Manifests folder, sorted, at most MAX_ITEMS. Missing folder: null. */
async function listItems(fs: ScanContext["fs"], manifests: string): Promise<string[] | null> {
  if (!(await fs.exists(manifests))) return null;
  return (await fs.readDir(manifests))
    .filter((e) => !e.isDirectory && ITEM_RE.test(e.name))
    .map((e) => e.name)
    .sort()
    .slice(0, MAX_ITEMS);
}

export async function discoverEpicRoots(ctx: DiscoveryContext): Promise<readonly ResolvedLocation[]> {
  const out: ResolvedLocation[] = [];
  const seen = new Set<string>();
  const add = (path: string, tag: string): void => {
    if (seen.has(key(path))) return;
    seen.add(key(path));
    out.push({ declarationId: EPIC_DATA_ID, path, tag });
  };
  for (const data of ctx.locations.filter((l) => l.declarationId === EPIC_DATA_ID)) {
    add(data.path, "manifests");
    try {
      const manifests = ctx.fs.join(data.path, "Manifests");
      for (const name of (await listItems(ctx.fs, manifests)) ?? []) {
        ctx.signal.throwIfAborted();
        try {
          const item = parseEpicItem(await ctx.fs.readText(ctx.fs.join(manifests, name)));
          if (typeof item === "string") continue;
          const loc = item.installLocation;
          const parent = loc.slice(0, loc.lastIndexOf("\\"));
          // Parent is a drive root ("D:"): scan only the game folder, not the whole drive.
          if (/^[A-Za-z]:$/.test(parent)) add(loc, "game");
          else add(parent, "library");
        } catch (e) {
          if (!isHandled(e)) throw e;
        }
      }
    } catch (e) {
      if (!isHandled(e)) throw e;
      ctx.log.warn("Epic manifests could not be read for root discovery", { code: e instanceof PathEscapesRootsError ? "link-escapes-roots" : e.code });
    }
  }
  return out;
}

export async function scanEpicInstalled(ctx: ScanContext): Promise<ScanResult> {
  const entries: InstalledEntry[] = [];
  // Only a discovered data folder counts: without it (switched off, or manual-folders-only mode) Epic detects nothing.
  const data = ctx.roots.find((r) => r.origin === "discovered" && r.declarationId === EPIC_DATA_ID && (r.tag === undefined || r.tag === "manifests"));
  if (data === undefined) return { entries, unreadableRoots: [] };
  const gameRoots = ctx.roots.filter((r) => key(r.path) !== key(data.path));
  const manifests = ctx.fs.join(data.path, "Manifests");
  const counts = { incomplete: 0, dlc: 0, notGame: 0, outsideRoots: 0, missing: 0, invalid: 0 };
  const seen = new Set<string>();
  // A failure to read the manifests means we cannot tell what is installed: every root is reported unreadable so the
  // core keeps what it knew (the games live in the other roots, not under the data folder; ADR 78, point 3).
  const allUnreadable = (code: ConnectorErrorCode): ScanResult => ({ entries: [], unreadableRoots: ctx.roots.map((root) => ({ root, code })) });
  let names: string[] | null;
  try {
    names = await listItems(ctx.fs, manifests);
  } catch (e) {
    if (!isHandled(e)) throw e;
    return allUnreadable("scan.root-unreadable");
  }
  let locked = false;
  let done = 0;
  for (const name of names ?? []) {
    ctx.signal.throwIfAborted();
    ctx.progress.report({ done: done++, total: names?.length ?? 0 });
    try {
      const item = parseEpicItem(await ctx.fs.readText(ctx.fs.join(manifests, name)));
      if (typeof item === "string") {
        if (item === "incomplete") counts.incomplete++;
        else if (item === "dlc") counts.dlc++;
        else counts.notGame++;
        continue;
      }
      if (seen.has(item.storeGameId)) continue;
      // Checked BEFORE touching the disk: ctx.fs treats a path outside the roots as a connector bug.
      if (!gameRoots.some((r) => isInside(item.installLocation, r.path))) {
        counts.outsideRoots++;
        continue;
      }
      if (!(await ctx.fs.exists(item.installLocation))) {
        counts.missing++;
        continue;
      }
      seen.add(item.storeGameId);
      entries.push({ storeGameId: item.storeGameId, kind: "game", title: item.title, installPath: item.installLocation });
    } catch (e) {
      if (!isHandled(e)) throw e;
      if (!(e instanceof PathEscapesRootsError) && e.code === "scan.root-unreadable") locked = true;
      else counts.invalid++;
    }
  }
  // Counters only: no paths, titles or Epic ids in the log.
  ctx.log.info("Epic scan finished", { games: entries.length, ...counts, locked });
  return { entries, unreadableRoots: locked ? ctx.roots.map((root) => ({ root, code: "scan.root-unreadable" as const })) : [] };
}
