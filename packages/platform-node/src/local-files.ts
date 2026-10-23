import { open, opendir, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { ConnectorError, PathEscapesRootsError, type LocalFiles, type ScopedFileReader } from "@ludiary/contracts";

/** ADR 72: limits of the scoped reader. */
export const MAX_TEXT_BYTES = 1024 * 1024;
export const MAX_DIR_ENTRIES = 10_000;

export interface NodeLocalFilesOptions {
  /** Path semantics to use; defaults to process.platform. Mainly for tests. */
  platform?: NodeJS.Platform;
}

type PathApi = typeof path.posix;

/** LocalFiles on top of node:fs and node:path with the path semantics of the platform (ADR 38, 72). */
export function createNodeLocalFiles(options: NodeLocalFilesOptions = {}): LocalFiles {
  const win = (options.platform ?? process.platform) === "win32";
  const p: PathApi = win ? path.win32 : path.posix;

  const stripExtendedPrefix = (value: string): string => {
    if (!win) return value;
    // "\\?\C:\x" -> "C:\x"; "\\?\UNC\srv\share" -> "\\srv\share".
    if (/^\\\\\?\\UNC\\/i.test(value)) return "\\\\" + value.slice(8);
    if (/^\\\\\?\\[a-z]:/i.test(value)) return value.slice(4);
    return value;
  };

  const normalize = (value: string): string => {
    if (value.includes("\0")) throw new Error("path contains a NUL character");
    let result = p.resolve(stripExtendedPrefix(value));
    const root = p.parse(result).root;
    while (result.length > root.length && (result.endsWith(p.sep) || result.endsWith("/"))) {
      result = result.slice(0, -1);
    }
    return result;
  };

  const compareKey = (value: string): string => {
    const normalized = normalize(value);
    return win ? normalized.toLowerCase() : normalized;
  };

  const isAbsolute = (value: string): boolean => {
    if (value.includes("\0")) return false;
    const plain = stripExtendedPrefix(value);
    // On Windows "\foo" and "C:foo" are not absolute for us: they depend on the current drive or directory.
    return win ? /^([a-z]:[\\/]|\\\\[^\\/])/i.test(plain) : p.isAbsolute(plain);
  };

  /** Lexical containment of two paths, with a separator boundary ('D:\Games2' is not in 'D:\Games'). */
  const lexicallyInside = (target: string, root: string): boolean => {
    const t = compareKey(target);
    const r = compareKey(root);
    if (t === r) return true;
    const prefix = r.endsWith(p.sep) ? r : r + p.sep;
    return t.startsWith(prefix);
  };

  /** realpath of the deepest existing ancestor, with the missing tail appended unchanged. */
  const realpathLoose = async (value: string): Promise<string> => {
    let current = normalize(value);
    const tail: string[] = [];
    for (;;) {
      try {
        const real = normalize(await realpath(current));
        return tail.length === 0 ? real : p.join(real, ...tail.reverse());
      } catch (err) {
        const code = (err as NodeJS.ErrnoException).code;
        const parent = p.dirname(current);
        if ((code !== "ENOENT" && code !== "ENOTDIR") || parent === current) throw err;
        tail.push(p.basename(current));
        current = parent;
      }
    }
  };

  const isInside = async (target: string, root: string): Promise<boolean> => {
    try {
      const [t, r] = await Promise.all([realpathLoose(target), realpathLoose(root)]);
      return lexicallyInside(t, r);
    } catch {
      return false;
    }
  };

  const isDirectory = async (value: string): Promise<boolean> => {
    try {
      return (await stat(value)).isDirectory();
    } catch {
      return false;
    }
  };

  const isDirectoryStrict = async (value: string): Promise<boolean> => {
    try {
      return (await stat(value)).isDirectory();
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code;
      if (code === "ENOENT" || code === "ENOTDIR") return false;
      throw e;
    }
  };

  const scoped = (roots: readonly string[]): ScopedFileReader => {
    const lexicalRoots = roots.filter(isAbsolute).map(normalize);
    let realRoots: Promise<string[]> | null = null;
    const getRealRoots = (): Promise<string[]> =>
      (realRoots ??= Promise.all(lexicalRoots.map((r) => realpathLoose(r).catch(() => null))).then((list) =>
        list.filter((r): r is string => r !== null),
      ));

    const outside = (): ConnectorError => new ConnectorError("internal", "path is outside the allowed roots");
    const unreadable = (what: string, err: unknown): ConnectorError => {
      if (err instanceof ConnectorError) return err;
      const code = (err as NodeJS.ErrnoException | undefined)?.code ?? "unknown";
      // No path in the message: it may contain the user name (ADR 35).
      return new ConnectorError("scan.root-unreadable", `cannot ${what} (${code})`, { cause: err });
    };

    /** Throws 'internal' when the path is not under a root: PathEscapesRootsError after realpath (a link), plain 'internal' lexically. Returns the real path. */
    const confine = async (input: string, mustExist: boolean): Promise<string> => {
      if (typeof input !== "string" || !isAbsolute(input)) throw outside();
      // Windows alternate data streams ("file.txt:stream") are never a legitimate target.
      if (win && stripExtendedPrefix(input).replace(/^[a-z]:/i, "").includes(":")) throw outside();
      const lexical = normalize(input);
      if (!lexicalRoots.some((r) => lexicallyInside(lexical, r))) throw outside();
      let real: string;
      try {
        real = mustExist ? normalize(await realpath(lexical)) : await realpathLoose(lexical);
      } catch (err) {
        throw unreadable("resolve path", err);
      }
      const rr = await getRealRoots();
      if (!rr.some((r) => lexicallyInside(real, r))) throw new PathEscapesRootsError();
      return real;
    };

    return {
      join: (...parts) => p.join(...parts),

      async exists(target) {
        const real = await confine(target, false);
        try {
          await stat(real);
          return true;
        } catch (err) {
          const code = (err as NodeJS.ErrnoException).code;
          if (code === "ENOENT" || code === "ENOTDIR") return false;
          throw unreadable("stat", err);
        }
      },

      async readText(target) {
        const real = await confine(target, true);
        let handle;
        try {
          handle = await open(real, "r");
          const info = await handle.stat();
          if (!info.isFile()) throw new ConnectorError("scan.root-unreadable", "not a regular file");
          if (info.size > MAX_TEXT_BYTES) throw new ConnectorError("scan.root-unreadable", "file is larger than 1 MiB");
          // Read one byte more than the limit so a file that grows after stat() is still caught.
          const buffer = Buffer.alloc(MAX_TEXT_BYTES + 1);
          let total = 0;
          while (total < buffer.length) {
            const { bytesRead } = await handle.read(buffer, total, buffer.length - total, total);
            if (bytesRead === 0) break;
            total += bytesRead;
          }
          if (total > MAX_TEXT_BYTES) throw new ConnectorError("scan.root-unreadable", "file is larger than 1 MiB");
          let text = buffer.subarray(0, total).toString("utf8");
          if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
          return text;
        } catch (err) {
          throw unreadable("read file", err);
        } finally {
          await handle?.close().catch(() => {});
        }
      },

      async readDir(target) {
        const real = await confine(target, true);
        const result: { name: string; isDirectory: boolean }[] = [];
        try {
          const dir = await opendir(real);
          for await (const entry of dir) {
            if (result.length >= MAX_DIR_ENTRIES) {
              throw new ConnectorError("scan.root-unreadable", "directory has more than 10000 entries");
            }
            let isDir = entry.isDirectory();
            if (entry.isSymbolicLink()) {
              // A link (or junction) counts as a directory only if it stays inside the roots.
              try {
                const linked = await confine(p.join(real, entry.name), true);
                isDir = (await stat(linked)).isDirectory();
              } catch {
                isDir = false;
              }
            }
            result.push({ name: entry.name, isDirectory: isDir });
          }
          return result;
        } catch (err) {
          throw unreadable("read directory", err);
        }
      },
    };
  };

  // Looks at the raw value: a "\\?\" prefix makes it a device path even when it names a local drive.
  const isLocalPath = (value: string): boolean => {
    if (typeof value !== "string" || value.includes("\0")) return false;
    return win ? /^[a-z]:[\\/]/i.test(value) : p.isAbsolute(value);
  };

  return { scoped, normalize, isAbsolute, isInside, compareKey, isDirectory, isDirectoryStrict, isLocalPath, realPath: realpathLoose };
}
