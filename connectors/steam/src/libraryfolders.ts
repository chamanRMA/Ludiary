// libraryfolders.vdf: new format ("0" { "path" ... }) and old format ("1" "D:\\SteamLibrary").
import { parseVdf, vdfObject, vdfString } from "./vdf";

const MAX_LIBRARIES = 64;
const MAX_PATH_CHARS = 1024;
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f]/;

function plausiblePath(p: string | undefined): p is string {
  if (p === undefined) return false;
  if (p.length === 0 || p.length > MAX_PATH_CHARS || CONTROL.test(p)) return false;
  // Drive-letter paths only: UNC and device (\\?\, \\.\) paths would make the core stat the network (ADR 72).
  return /^[A-Za-z]:[\\/]/.test(p);
}

/** Returns the library paths in file order, deduplicated (case and separator insensitive). */
export function parseLibraryFolders(text: string): string[] {
  const folders = vdfObject(parseVdf(text), "libraryfolders");
  const out: string[] = [];
  if (!folders) return out;
  const seen = new Set<string>();
  // Only numeric keys: the old format also has TimeNextStatsReport, ContentStatsID...
  const keys = [...folders.keys()].filter((k) => /^\d{1,4}$/.test(k)).sort((a, b) => Number(a) - Number(b));
  for (const key of keys) {
    const v = folders.get(key);
    const path = typeof v === "string" ? v : vdfString(v, "path");
    if (!plausiblePath(path)) continue;
    const dedupe = path.replace(/\//g, "\\").replace(/\\+$/, "").toLowerCase();
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);
    out.push(path);
    if (out.length >= MAX_LIBRARIES) break;
  }
  return out;
}
