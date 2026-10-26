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
import { parseAppManifest } from "./appmanifest";
import { parseLibraryFolders } from "./libraryfolders";
import { steamMedia } from "./media";

/** Steam tools that are not games. Maintained here, with tests. */
export const EXCLUDED_APP_IDS: ReadonlySet<string> = new Set([
  "228980", // Steamworks Common Redistributables
]);

const MANIFEST_RE = /^appmanifest_(\d{1,10})\.acf$/i;
const MAX_MANIFESTS = 5000;
const MAX_ENTRIES = 10_000; // the core's limit (validate.ts): games + DLC must not exceed it (ADR 84, M3)

/**
 * Errors caused by what is on the user's disk, which never stop the scan (ADR 72). A link that leaves the roots is
 * one of them; any other 'internal' is a connector bug and still propagates.
 */
function isHandled(e: unknown): e is ConnectorError {
  return (
    e instanceof PathEscapesRootsError ||
    (e instanceof ConnectorError && (e.code === "scan.root-unreadable" || e.code === "store.unexpected-response"))
  );
}

function baseName(p: string): string {
  const parts = p.split(/[\\/]+/).filter((s) => s !== "");
  return parts[parts.length - 1] ?? "";
}

export async function discoverSteamRoots(ctx: DiscoveryContext): Promise<readonly ResolvedLocation[]> {
  const out: ResolvedLocation[] = [];
  const seen = new Set<string>();
  const add = (path: string): void => {
    const key = path.replace(/\//g, "\\").replace(/\\+$/, "").toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ declarationId: "steam-root", path, tag: "library" });
  };
  for (const loc of ctx.locations) {
    ctx.signal.throwIfAborted();
    if (loc.declarationId !== "steam-root") continue;
    add(loc.path);
    const file = ctx.fs.join(loc.path, "steamapps", "libraryfolders.vdf");
    try {
      if (!(await ctx.fs.exists(file))) continue;
      for (const p of parseLibraryFolders(await ctx.fs.readText(file))) add(p);
    } catch (e) {
      if (!isHandled(e)) throw e;
      ctx.log.warn("libraryfolders.vdf could not be read; using the Steam folder only", {
        code: e instanceof PathEscapesRootsError ? "link-escapes-roots" : e.code,
      });
    }
  }
  return out;
}

export async function scanSteamInstalled(ctx: ScanContext): Promise<ScanResult> {
  const entries: InstalledEntry[] = [];
  const unreadableRoots: { root: ScanRoot; code: ConnectorErrorCode }[] = [];
  const seenApps = new Set<string>();
  // ADR 84: DLC are emitted after all games; the base always comes from the manifest.
  const dlcs: { id: string; base: string; installPath: string }[] = [];
  let dlcCapped = 0;
  let done = 0;
  // Roots where some appmanifest could not be read right now (locked, I/O error): reported as unreadable so the core
  // keeps what it knew installed there (scan-plan) instead of retiring those games for a passing failure.
  const partial = new Map<string, { root: ScanRoot; code: ConnectorErrorCode }>();

  for (const root of ctx.roots) {
    ctx.signal.throwIfAborted();
    ctx.progress.report({ done, total: ctx.roots.length });
    done++;
    try {
      let steamapps: string;
      if (await ctx.fs.exists(ctx.fs.join(root.path, "steamapps"))) steamapps = ctx.fs.join(root.path, "steamapps");
      else if (baseName(root.path).toLowerCase() === "steamapps") steamapps = root.path;
      else continue; // not a Steam library: other stores may use this folder

      const names = (await ctx.fs.readDir(steamapps))
        .filter((e) => !e.isDirectory && MANIFEST_RE.test(e.name))
        .map((e) => e.name)
        .sort()
        .slice(0, MAX_MANIFESTS);

      for (const name of names) {
        ctx.signal.throwIfAborted();
        const fileId = (MANIFEST_RE.exec(name) as RegExpExecArray)[1] as string;
        try {
          const m = parseAppManifest(await ctx.fs.readText(ctx.fs.join(steamapps, name)));
          if (EXCLUDED_APP_IDS.has(m.appId)) continue;
          if (m.appId !== fileId) {
            ctx.log.warn("appmanifest appid differs from its file name; skipped", { appId: fileId });
            continue;
          }
          if (seenApps.has(m.appId)) {
            ctx.log.info("duplicate appmanifest skipped", { appId: m.appId });
            continue;
          }
          if (m.installDir === null) {
            ctx.log.info("appmanifest without a usable installdir; skipped", { appId: m.appId });
            continue;
          }
          const installPath = ctx.fs.join(steamapps, "common", m.installDir);
          if (!(await ctx.fs.exists(installPath))) continue;
          seenApps.add(m.appId);
          // Never hold more DLC than could be emitted: forged manifests would otherwise fill memory.
          for (const id of m.dlcAppIds) {
            if (dlcs.length < MAX_ENTRIES) dlcs.push({ id, base: m.appId, installPath });
            else dlcCapped++;
          }
          dlcCapped += m.dlcDropped;
          entries.push({
            storeGameId: m.appId,
            kind: "game",
            title: m.name ?? `Steam ${m.appId}`,
            installPath,
            externalIds: { steamAppId: m.appId },
            media: steamMedia(m.appId),
          });
        } catch (e) {
          if (!isHandled(e)) throw e;
          // Only appId and code are logged: a message could carry a path.
          ctx.log.warn("appmanifest skipped", { appId: fileId, code: e instanceof PathEscapesRootsError ? "link-escapes-roots" : e.code });
          if (e.code === "scan.root-unreadable") partial.set(root.path, { root, code: e.code });
        }
      }
    } catch (e) {
      if (!isHandled(e)) throw e;
      // A steamapps folder that is a junction leaving the roots counts as an unreadable root.
      const code: ConnectorErrorCode = e instanceof PathEscapesRootsError ? "scan.root-unreadable" : e.code;
      partial.delete(root.path);
      unreadableRoots.push({ root, code });
    }
  }
  unreadableRoots.push(...partial.values());
  let dlc = 0;
  let dlcDuplicate = 0;
  const seenDlc = new Set<string>();
  for (const d of dlcs) {
    if (EXCLUDED_APP_IDS.has(d.id)) continue;
    if (seenApps.has(d.id) || seenDlc.has(d.id)) {
      dlcDuplicate++;
      continue;
    }
    if (entries.length >= MAX_ENTRIES) {
      dlcCapped++;
      continue;
    }
    seenDlc.add(d.id);
    entries.push({ storeGameId: d.id, kind: "dlc", baseStoreGameId: d.base, title: `Steam ${d.id}`, installPath: d.installPath });
    dlc++;
  }
  if (dlc + dlcDuplicate + dlcCapped > 0) ctx.log.info("Steam DLC found in appmanifests", { dlc, dlcDuplicate, dlcCapped });
  return { entries, unreadableRoots };
}
