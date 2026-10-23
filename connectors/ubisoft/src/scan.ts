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
import { gameFolder } from "./paths";

const SUBKEY_RE = /^[1-9][0-9]{0,9}$/;
const TAG_RE = /^game-([1-9][0-9]{0,9})$/;
const DECLARATION = "ubisoft-installs";

/** Same classification as GOG (ADR 79): disk-caused errors never stop the scan; other 'internal' propagate. */
function isHandled(e: unknown): e is ConnectorError {
  return (
    e instanceof PathEscapesRootsError ||
    (e instanceof ConnectorError && (e.code === "scan.root-unreadable" || e.code === "store.unexpected-response"))
  );
}

/** One root per installed game, the id in the tag (ADR 79, point 3). Text only, no I/O. */
export async function discoverUbisoftRoots(ctx: DiscoveryContext): Promise<readonly ResolvedLocation[]> {
  let invalidIds = 0;
  let invalidPaths = 0;
  let duplicates = 0;
  const found: { id: string; path: string }[] = [];
  for (const loc of ctx.locations) {
    if (loc.declarationId !== DECLARATION) continue;
    const subkey = loc.subkey; // from the registry: untrusted (ADR 79)
    if (typeof subkey !== "string" || !SUBKEY_RE.test(subkey)) {
      invalidIds++;
      continue;
    }
    const path = gameFolder(loc.path);
    if (path === null) {
      invalidPaths++;
      continue;
    }
    found.push({ id: subkey, path });
  }
  found.sort((a, b) => Number(a.id) - Number(b.id));
  const seen = new Set<string>();
  const out: ResolvedLocation[] = [];
  for (const g of found) {
    const key = g.path.toLowerCase();
    if (seen.has(key)) {
      duplicates++;
      ctx.log.info("duplicate Ubisoft folder skipped", { gameId: g.id });
      continue;
    }
    seen.add(key);
    out.push({ declarationId: DECLARATION, path: g.path, tag: `game-${g.id}` });
  }
  if (invalidIds + invalidPaths + duplicates > 0) ctx.log.warn("Ubisoft installs skipped", { invalidIds, invalidPaths, duplicates });
  return out;
}

function titleOf(path: string, id: string): string {
  const last = path.slice(path.lastIndexOf("\\") + 1);
  const t = [...last.replace(/\p{Cc}/gu, "").trim()].slice(0, 200).join("").trim();
  return t === "" ? `Ubisoft ${id}` : t;
}

/** Reads no file: only checks that each discovered folder still exists (ADR 79, point 3). */
export async function scanUbisoftInstalled(ctx: ScanContext): Promise<ScanResult> {
  const entries: InstalledEntry[] = [];
  const unreadableRoots: { root: ScanRoot; code: ConnectorErrorCode }[] = [];
  const seen = new Set<string>();
  for (const root of ctx.roots) {
    ctx.signal.throwIfAborted();
    if (root.origin !== "discovered" || root.declarationId !== DECLARATION) continue;
    const m = root.tag === undefined ? null : TAG_RE.exec(root.tag);
    if (!m) continue;
    const id = m[1] as string;
    if (seen.has(id)) continue;
    seen.add(id);
    try {
      if (await ctx.fs.exists(root.path)) {
        entries.push({ storeGameId: id, kind: "game", title: titleOf(root.path, id), installPath: root.path });
      }
    } catch (e) {
      if (!isHandled(e)) throw e;
      // Only the id and a code are logged: a message could carry a path.
      const code: ConnectorErrorCode = e instanceof PathEscapesRootsError ? "scan.root-unreadable" : e.code;
      ctx.log.warn("Ubisoft folder unreadable", { gameId: id, code });
      unreadableRoots.push({ root, code });
    }
  }
  return { entries, unreadableRoots };
}
