import type {
  ConnectorLogger,
  DiscoveryContext,
  I18nKey,
  HttpClient,
  LaunchContext,
  MediaContext,
  ProgressReporter,
  ResolvedLocation,
  ScanContext,
  ScanRoot,
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
