// In-memory Windows file tree implementing ScopedFileReader with the same limits and errors as the real one (ADR 72).
import { win32 } from "node:path";
import { ConnectorError, PathEscapesRootsError, type ScopedFileReader } from "@ludiary/contracts";

/**
 * Absolute Windows path -> file text (or raw bytes, ADR 80). A key ending in a separator is an (empty) directory.
 * Parent directories of files are implicit. Separators and case are not significant.
 */
export type MemoryTree = Readonly<Record<string, string | Uint8Array>>;

export interface MemoryFilesOptions {
  os?: "windows";
  /** Confine the reader to these roots (outside -> ConnectorError 'internal'). Default: no confinement. */
  roots?: readonly string[];
  /** Paths that fail with 'scan.root-unreadable' (permissions, locked...). */
  unreadable?: readonly string[];
  /** Paths (and everything below) that are links leaving the roots: PathEscapesRootsError, as the real reader does. */
  escaping?: readonly string[];
}

export const READ_TEXT_MAX_BYTES = 1024 * 1024;
export const READ_DIR_MAX_ENTRIES = 10_000;
export const READ_BYTES_CEILING = 64 * 1024 * 1024;

const ERR_KEY = "connectors.common.errors.scan.root-unreadable";

/** Windows normalisation: backslashes, no `.`/`..`, no trailing separator except for a drive root. */
export function winNormalize(path: string): string {
  const n = win32.normalize(path.replace(/\//g, "\\"));
  return /^[A-Za-z]:\\$/.test(n) ? n : n.replace(/\\+$/, "");
}
export function winKey(path: string): string {
  return winNormalize(path).toLowerCase();
}

interface DirEntries {
  name: string;
  children: Map<string, { name: string; isDirectory: boolean }>;
}

export interface MemoryFiles extends ScopedFileReader {
  /** Every read path, normalised, in call order (for assertions). */
  readonly reads: readonly string[];
}

export function memoryFiles(tree: MemoryTree, opts: MemoryFilesOptions = {}): MemoryFiles {
  const files = new Map<string, string | Uint8Array>();
  const dirs = new Map<string, DirEntries>();
  const reads: string[] = [];

  const ensureDir = (path: string): DirEntries => {
    const key = winKey(path);
    let d = dirs.get(key);
    if (!d) {
      d = { name: win32.basename(winNormalize(path)) || winNormalize(path), children: new Map() };
      dirs.set(key, d);
      const parent = win32.dirname(winNormalize(path));
      if (winKey(parent) !== key) {
        const p = ensureDir(parent);
        if (!p.children.has(key)) p.children.set(key, { name: d.name, isDirectory: true });
      }
    }
    return d;
  };

  for (const [rawPath, content] of Object.entries(tree)) {
    if (!/^([A-Za-z]:[\\/]|\\\\)/.test(rawPath)) throw new Error(`memoryFiles: path is not absolute: ${rawPath}`);
    if (/[\\/]$/.test(rawPath)) {
      ensureDir(rawPath);
      continue;
    }
    const path = winNormalize(rawPath);
    files.set(winKey(path), content);
    const parent = ensureDir(win32.dirname(path));
    parent.children.set(winKey(path), { name: win32.basename(path), isDirectory: false });
  }

  const roots = opts.roots?.map(winKey);
  const unreadable = new Set((opts.unreadable ?? []).map(winKey));

  const escaping = (opts.escaping ?? []).map(winKey);

  const guard = (path: string): string => {
    if (!/^([A-Za-z]:[\\/]|\\\\)/.test(path)) throw new ConnectorError("internal", "Relative path passed to the file reader");
    const key = winKey(path);
    reads.push(winNormalize(path));
    if (roots && !roots.some((r) => key === r || key.startsWith(r.endsWith("\\") ? r : r + "\\"))) {
      throw new ConnectorError("internal", "Path outside the allowed roots (connector bug)");
    }
    if (escaping.some((e) => key === e || key.startsWith(e + "\\"))) throw new PathEscapesRootsError();
    if (unreadable.has(key)) {
      throw new ConnectorError("scan.root-unreadable", "Path is not readable", { messageKey: ERR_KEY as never });
    }
    return key;
  };
  const unreadableError = (what: string): ConnectorError =>
    new ConnectorError("scan.root-unreadable", what, { messageKey: ERR_KEY as never });

  return {
    reads,
    join: (...parts: string[]) => winNormalize(win32.join(...parts)),
    async exists(path) {
      const key = guard(path);
      return files.has(key) || dirs.has(key);
    },
    async readText(path) {
      const key = guard(path);
      const content = files.get(key);
      if (content === undefined && dirs.has(key)) throw new ConnectorError("store.unexpected-response", "Not a regular file");
      if (content === undefined) throw unreadableError("File not found or not a file");
      const bytes = typeof content === "string" ? new TextEncoder().encode(content) : content;
      if (bytes.length > READ_TEXT_MAX_BYTES) throw new ConnectorError("store.unexpected-response", "File larger than 1 MiB");
      return typeof content === "string" ? content : new TextDecoder().decode(content);
    },
    async readBytes(path, maxBytes) {
      const key = guard(path);
      if (!Number.isInteger(maxBytes) || maxBytes < 1 || maxBytes > READ_BYTES_CEILING) {
        throw new ConnectorError("internal", "maxBytes must be an integer from 1 to 64 MiB");
      }
      const content = files.get(key);
      if (content === undefined) throw unreadableError("File not found or not a file");
      const bytes = typeof content === "string" ? new TextEncoder().encode(content) : content;
      if (bytes.length > maxBytes) throw unreadableError("File larger than maxBytes");
      return new Uint8Array(bytes);
    },
    async readDir(path) {
      const key = guard(path);
      const d = dirs.get(key);
      if (!d) throw unreadableError("Directory not found");
      if (d.children.size > READ_DIR_MAX_ENTRIES) throw unreadableError("Directory has more than 10 000 entries");
      return [...d.children.values()].map((c) => ({ name: c.name, isDirectory: c.isDirectory }));
    },
  };
}
