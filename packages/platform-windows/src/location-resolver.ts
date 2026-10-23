import { stat } from "node:fs/promises";
import { LocationsUnreadableError, type LocalFiles, type LocationDeclaration, type LocationResolver, type LocationSource, type ResolvedLocation } from "@ludiary/contracts";
import type { HelperRunner } from "./helper-io";
import { buildRegistryRequest, parseRegistryResponse, type RegistryQuery } from "./registry-protocol";

export interface WindowsLocationResolverOptions {
  files: LocalFiles;
  /** Runs `ludiary-tray.exe <args>` with stdin; see createHelperRunner. */
  runHelper: HelperRunner;
  env: NodeJS.ProcessEnv;
  /** Existence check for resolved paths (files or folders). Defaults to fs.stat. */
  exists?: (path: string) => Promise<boolean>;
}

const KNOWN_FOLDER_ENV = {
  ProgramData: "ProgramData",
  ProgramFiles: "ProgramFiles",
  ProgramFilesX86: "ProgramFiles(x86)",
  LocalAppData: "LOCALAPPDATA",
  RoamingAppData: "APPDATA",
} as const;

/** ENOENT/ENOTDIR mean absent; any other error (permissions, I/O) is "could not tell" and throws (ADR 79). */
const defaultExists = async (path: string): Promise<boolean> => {
  try {
    await stat(path);
    return true;
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || code === "ENOTDIR") return false;
    throw e;
  }
};

/**
 * Generic LocationResolver for Windows (ADR 38, 72): registry through the Go helper (read-only) and known folders
 * from the environment. It knows nothing about any store.
 */
export class WindowsLocationResolver implements LocationResolver {
  private readonly exists: (path: string) => Promise<boolean>;

  constructor(private readonly opts: WindowsLocationResolverOptions) {
    this.exists = opts.exists ?? defaultExists;
  }

  async resolve(decl: LocationDeclaration): Promise<readonly ResolvedLocation[]> {
    if (!decl.os.includes("windows")) return [];
    const { files } = this.opts;

    // One helper call for all registry sources of the declaration; answers keep the source order.
    const queries: RegistryQuery[] = [];
    for (const source of decl.sources) {
      const q = this.toQuery(source);
      if (q) queries.push(q);
    }
    // null: the helper itself failed. Unreadable is not absent (ADR 79): the error is raised at the end, carrying what did resolve.
    let answers: ReturnType<typeof parseRegistryResponse> | null = [];
    if (queries.length > 0) {
      try {
        const text = await this.opts.runHelper(["--registry"], buildRegistryRequest(queries), { timeoutMs: 10_000 });
        answers = parseRegistryResponse(text, queries.length);
      } catch {
        answers = null;
      }
    }

    const seen = new Set<string>();
    const result: ResolvedLocation[] = [];
    let failure: string | null = null;
    let next = 0;
    for (const source of decl.sources) {
      let candidates: string[] = [];
      let subkeys: string[] | undefined;
      if (source.kind === "known-folder") {
        const folder = this.knownFolder(source);
        if (folder) candidates = [folder];
      } else if (answers === null) {
        failure ??= "registry helper unavailable";
      } else {
        const answer = answers[next++];
        if (answer?.ok) {
          candidates = answer.values;
          if (source.kind === "registry-subkeys") {
            subkeys = answer.names;
            // A subkeys answer without names (an old helper) cannot say which subkey each path came from: unusable.
            if (!subkeys && candidates.length > 0) {
              failure ??= "registry helper returned no subkey names";
              candidates = [];
            }
          }
        } else if (answer && answer.error !== "not-found" && answer.error !== "unsupported-type") {
          failure ??= `registry source unreadable (${answer.error})`;
        }
      }
      for (const [i, raw] of candidates.entries()) {
        // UNC and device paths are dropped before any stat: it could open an SMB connection (ADR 72).
        if (!files.isLocalPath(raw) || !files.isAbsolute(raw)) continue;
        const normalized = files.normalize(raw);
        const subkey = subkeys?.[i];
        // Two subkeys may share a path; they are different locations (ADR 79).
        const key = subkey === undefined ? files.compareKey(normalized) : `${files.compareKey(normalized)}\u0000${subkey}`;
        if (seen.has(key)) continue;
        try {
          if (!(await this.exists(normalized))) continue;
        } catch {
          failure ??= "location could not be checked";
          continue;
        }
        seen.add(key);
        result.push(subkey === undefined ? { declarationId: decl.id, path: normalized } : { declarationId: decl.id, path: normalized, subkey });
      }
    }
    if (failure) throw new LocationsUnreadableError(failure, result);
    return result;
  }

  private toQuery(source: LocationSource): RegistryQuery | null {
    if (source.kind === "known-folder") return null;
    const query: RegistryQuery = {
      hive: source.hive,
      key: source.key,
      value: source.value,
      kind: source.kind === "registry-value" ? "value" : "subkeys",
    };
    if (source.view) query.view = source.view;
    return query;
  }

  private knownFolder(source: Extract<LocationSource, { kind: "known-folder" }>): string | null {
    const base = this.opts.env[KNOWN_FOLDER_ENV[source.folder]];
    if (!base) return null;
    const { files } = this.opts;
    // The relative part comes from a connector declaration: it must stay below the base folder.
    if (files.isAbsolute(source.relative) || source.relative.split(/[\\/]+/).includes("..")) return null;
    return source.relative ? files.normalize(`${base}\\${source.relative}`) : files.normalize(base);
  }
}
