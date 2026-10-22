// Loads a fixture directory from disk (test tooling only; connectors never use this).
// Layout: <dir>/<DriveLetter>/<path...>  ->  "<DriveLetter>:\<path...>" in the MemoryTree.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { MemoryTree } from "./memory-files";

const SKIP = new Set([".gitkeep"]);

/** All files below `dir` (absolute paths) with their text, skipping .gitkeep. */
export function readFixtureFiles(dir: string): { path: string; content: string }[] {
  const out: { path: string; content: string }[] = [];
  const walk = (d: string): void => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (!SKIP.has(e.name)) out.push({ path: p, content: readFileSync(p, "utf8") });
    }
  };
  walk(dir);
  return out;
}

export function loadFixtureTree(dir: string): Record<string, string> {
  const tree: Record<string, string> = {};
  for (const f of readFixtureFiles(dir)) {
    const rel = f.path.slice(dir.length).replace(/^[\\/]+/, "").split(/[\\/]+/);
    const drive = rel.shift() as string;
    if (!/^[A-Za-z]$/.test(drive)) throw new Error(`fixture tree: first folder must be a drive letter: ${drive}`);
    tree[`${drive.toUpperCase()}:\\${rel.join("\\")}`] = f.content;
  }
  return tree satisfies MemoryTree;
}
