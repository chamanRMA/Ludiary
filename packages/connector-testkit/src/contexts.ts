import {
  ConnectorError,
  makeSecret,
  type ConnectorLogger,
  type ExternalToolRunner,
  type Secret,
  type SecretVault,
  type SyncContext,
  type WizardContext,
  type DiscoveryContext,
  type I18nKey,
  type HttpClient,
  type LaunchContext,
  type MediaContext,
  type ProgressReporter,
  type ResolvedLocation,
  type ScanContext,
  type ScanRoot,
} from "@ludiary/contracts";
import { fakeHttp } from "./http";
import { memoryFiles, type MemoryFiles, type MemoryTree } from "./memory-files";

export interface LogEntry {
  level: "debug" | "info" | "warn";
  msg: string;
  fields: Readonly<Record<string, string | number | boolean>> | undefined;
}
export interface ProgressEvent {
  done: number;
  total?: number;
  phaseKey?: I18nKey;
}

export interface Captured {
  readonly logs: LogEntry[];
  readonly progressEvents: ProgressEvent[];
}

function capture(): { captured: Captured; log: ConnectorLogger; progress: ProgressReporter } {
  const captured: Captured = { logs: [], progressEvents: [] };
  const add = (level: LogEntry["level"]) => (msg: string, fields?: LogEntry["fields"]) => {
    captured.logs.push({ level, msg, fields });
  };
  return {
    captured,
    log: { debug: add("debug"), info: add("info"), warn: add("warn") },
    progress: { report: (p) => void captured.progressEvents.push({ ...p }) },
  };
}

interface Common {
  tree?: MemoryTree;
  signal?: AbortSignal;
  locale?: string;
}

export function scanContext(opts: Common & { roots: readonly (string | ScanRoot)[] }): ScanContext & Captured & { files: MemoryFiles } {
  const roots: ScanRoot[] = opts.roots.map((r) => (typeof r === "string" ? { origin: "user", path: r } : r));
  const c = capture();
  const files = memoryFiles(opts.tree ?? {}, { roots: roots.map((r) => r.path) });
  return {
    roots,
    fs: files,
    files,
    progress: c.progress,
    log: c.log,
    signal: opts.signal ?? new AbortController().signal,
    locale: opts.locale ?? "en",
    ...c.captured,
  };
}

export function discoveryContext(
  opts: Common & { locations: readonly ResolvedLocation[] },
): DiscoveryContext & Captured & { files: MemoryFiles } {
  const c = capture();
  const files = memoryFiles(opts.tree ?? {}, { roots: opts.locations.map((l) => l.path) });
  return {
    locations: opts.locations,
    fs: files,
    files,
    log: c.log,
    signal: opts.signal ?? new AbortController().signal,
    locale: opts.locale ?? "en",
    ...c.captured,
  };
}

export function launchContext(
  opts: Common & { launchers?: readonly ResolvedLocation[]; launchersResolved?: boolean; installPaths?: readonly string[] },
): LaunchContext & Captured & { files: MemoryFiles } {
  const c = capture();
  const launchers = opts.launchers ?? [];
  const files = memoryFiles(opts.tree ?? {}, {
    roots: [...launchers.map((l) => l.path), ...(opts.installPaths ?? [])],
  });
  return {
    launchers,
    launchersResolved: opts.launchersResolved ?? true,
    fs: files,
    files,
    log: c.log,
    signal: opts.signal ?? new AbortController().signal,
    locale: opts.locale ?? "en",
    ...c.captured,
  };
}

export function mediaContext(opts: Common & { http?: HttpClient } = {}): MediaContext & Captured & { http: HttpClient } {
  const c = capture();
  return {
    http: opts.http ?? fakeHttp(() => ({ status: 500 })),
    log: c.log,
    signal: opts.signal ?? new AbortController().signal,
    locale: opts.locale ?? "en",
    ...c.captured,
  };
}

// ---------- ADR 74: sync and wizard contexts ----------

export interface MemoryVault extends SecretVault {
  /** Plain values, for assertions only. */
  readonly values: Map<string, string>;
  /** Names passed to set(), in order. */
  readonly sets: string[];
}

export function memoryVault(initial: Readonly<Record<string, string>> = {}): MemoryVault {
  const values = new Map(Object.entries(initial));
  const sets: string[] = [];
  return {
    values,
    sets,
    async get(name): Promise<Secret | null> {
      const v = values.get(name);
      return v === undefined ? null : makeSecret(v);
    },
    async set(name, value) {
      sets.push(name);
      values.set(name, typeof value === "string" ? value : value.reveal());
    },
    async delete(name) {
      values.delete(name);
    },
  };
}

/** The core's stand-in in this cut (ADR 74): every call is 'tool.missing'. */
const noTools: ExternalToolRunner = {
  async run() {
    throw new ConnectorError("tool.missing", "No external tools in this context");
  },
};

export function syncContext(
  opts: Common & { http?: HttpClient; secrets?: SecretVault | Readonly<Record<string, string>> } = {},
): SyncContext & Captured & { http: HttpClient; secrets: SecretVault } {
  const c = capture();
  const s = opts.secrets;
  return {
    http: opts.http ?? fakeHttp(() => ({ status: 500 })),
    secrets: s && "get" in s && typeof s.get === "function" ? (s as SecretVault) : memoryVault(s as Record<string, string> | undefined),
    tools: noTools,
    progress: c.progress,
    log: c.log,
    signal: opts.signal ?? new AbortController().signal,
    locale: opts.locale ?? "en",
    ...c.captured,
  };
}

export function wizardContext(
  opts: Parameters<typeof syncContext>[0] & { callbackUrl?: string; now?: number | (() => number); state?: Readonly<Record<string, string>> } = {},
): WizardContext & Captured & { http: HttpClient; secrets: MemoryVault; wizardState: MemoryVault } {
  const base = syncContext(opts);
  const now = opts.now ?? Date.parse("2026-10-22T12:00:00Z");
  return {
    ...base,
    secrets: base.secrets as MemoryVault,
    callbackUrl: opts.callbackUrl ?? "http://ludiary.localhost:4780/connect/return?w=00000000-0000-4000-8000-000000000000",
    wizardState: memoryVault(opts.state),
    now: typeof now === "function" ? now : () => now,
  };
}
