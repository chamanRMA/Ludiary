import { stat } from "node:fs/promises";
import type { LocalFiles, LocationDeclaration, LocationResolver, LocationSource, ResolvedLocation } from "@ludiary/contracts";
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

const defaultExists = async (path: string): Promise<boolean> => {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
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
    let answers: ReturnType<typeof parseRegistryResponse> = [];
    if (queries.length > 0) {
      try {
        const text = await this.opts.runHelper(["--registry"], buildRegistryRequest(queries), { timeoutMs: 10_000 });
        answers = parseRegistryResponse(text, queries.length);
      } catch {
        // Without the helper only known folders resolve; callers see fewer locations, not an error.
        answers = queries.map(() => ({ ok: false as const, error: "failed" }));
      }
    }

    const seen = new Set<string>();
    const result: ResolvedLocation[] = [];
    let next = 0;
    for (const source of decl.sources) {
      let candidates: string[] = [];
      if (source.kind === "known-folder") {
        const folder = this.knownFolder(source);
        if (folder) candidates = [folder];
      } else {
        const answer = answers[next++];
        if (answer?.ok) candidates = answer.values;
      }
      for (const raw of candidates) {
        // UNC and device paths are dropped before any stat: it could open an SMB connection (ADR 72).
        if (!files.isLocalPath(raw) || !files.isAbsolute(raw)) continue;
        const normalized = files.normalize(raw);
        const key = files.compareKey(normalized);
        if (seen.has(key)) continue;
        if (!(await this.exists(normalized))) continue;
        seen.add(key);
        result.push({ declarationId: decl.id, path: normalized });
      }
    }
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
