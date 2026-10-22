// In-memory doubles for the core tests: no database, no disk, no OS.
import type {
  Clock,
  ConnectorCapabilities,
  EntryMedia,
  I18nKey,
  InstalledEntry,
  LocalFiles,
  LocationResolver,
  ProcessLauncher,
  ResolvedLocation,
  ScanContext,
  ScanResult,
  StoreConnector,
  StoreId,
  FolderPicker,
} from "@ludiary/contracts";
import { createCore, type CoreDeps, type LudiaryCore } from "../src";
import type {
  GameDetail,
  GameSummary,
  InstallationRecord,
  LaunchTarget,
  PropertyRecord,
  ScanPlan,
  ScanRootRecord,
  SyncStateRecord,
} from "../src/model";
import type { LibraryRepository, ScanRootRepository, SettingsRepository, SyncStateRepository, IdentityRepository } from "../src/ports";

export const key = (s: string) => s as I18nKey;

export class FakeFiles implements LocalFiles {
  dirs = new Set<string>();
  files = new Set<string>();
  constructor(dirs: string[] = [], files: string[] = []) {
    dirs.forEach((d) => this.dirs.add(this.compareKey(d)));
    files.forEach((f) => this.files.add(this.compareKey(f)));
  }
  normalize(p: string) {
    const n = p.replace(/\//g, "\\");
    return /^[A-Za-z]:\\$/.test(n) ? n : n.replace(/\\+$/, "");
  }
  isAbsolute(p: string) {
    return /^[A-Za-z]:[\\/]/.test(p);
  }
  isLocalPath(p: string) {
    return /^[A-Za-z]:[\\/]/.test(p);
  }
  compareKey(p: string) {
    return this.normalize(p).toLowerCase();
  }
  async isInside(p: string, root: string) {
    const a = this.compareKey(p);
    const r = this.compareKey(root);
    return a === r || a.startsWith(r.endsWith("\\") ? r : `${r}\\`);
  }
  async isDirectory(p: string) {
    return this.dirs.has(this.compareKey(p));
  }
  scoped(roots: readonly string[]) {
    return {
      readText: async () => "",
      readDir: async () => [],
      exists: async (p: string) => {
        const inside = await Promise.all(roots.map((r) => this.isInside(p, r)));
        return inside.some(Boolean) && (this.files.has(this.compareKey(p)) || this.dirs.has(this.compareKey(p)));
      },
      join: (...parts: string[]) => parts.join("\\"),
    };
  }
}

export class FakeClock implements Clock {
  time = 1_000_000;
  controllers: AbortController[] = [];
  now() {
    return this.time;
  }
  timeout(_ms: number) {
    const c = new AbortController();
    this.controllers.push(c);
    return c.signal;
  }
  /** Fires every pending timeout. */
  fire() {
    this.controllers.forEach((c) => c.abort());
  }
}

export class MemoryStore implements LibraryRepository, IdentityRepository {
  canonical = new Map<string, { id: string; title: string; media?: object }>();
  properties = new Map<string, PropertyRecord>();
  installs = new Map<string, InstallationRecord>();
  roots = new Map<string, ScanRootRecord>();
  sync = new Map<string, SyncStateRecord>();
  kv = new Map<string, unknown>();
  applied: ScanPlan[] = [];
  deviceId = "dev";

  async ensure() {
    return { userId: "user", deviceId: this.deviceId };
  }
  async listLibrary(): Promise<GameSummary[]> {
    const out: GameSummary[] = [];
    for (const g of this.canonical.values()) {
      const ps = [...this.properties.values()].filter((p) => p.canonicalGameId === g.id && p.removedAt === null && p.kind === "game");
      if (ps.length === 0) continue;
      out.push({
        id: g.id,
        title: g.title,
        stores: ps.map((p) => p.store as StoreId),
        installed: ps.some((p) => [...this.installs.values()].some((i) => i.propertyId === p.id)),
        favorite: false,
        playtimeMinutes: 0,
        tags: [],
      });
    }
    return out;
  }
  async getGame(id: string): Promise<GameDetail | null> {
    const g = (await this.listLibrary()).find((x) => x.id === id);
    if (!g) return null;
    const ps = [...this.properties.values()].filter((p) => p.canonicalGameId === id && p.removedAt === null);
    return {
      ...g,
      properties: ps.map((p) => {
        const i = [...this.installs.values()].find((x) => x.propertyId === p.id);
        return { id: p.id, store: p.store, installed: !!i, ...(i ? { installPath: i.installPath } : {}), actions: [] };
      }),
      dlc: [],
      collections: [],
    };
  }
  async getLaunchTargets(id: string): Promise<LaunchTarget[]> {
    return [...this.properties.values()]
      .filter((p) => p.canonicalGameId === id)
      .map((p) => ({ canonicalGameId: id, property: p, installation: [...this.installs.values()].find((i) => i.propertyId === p.id) ?? null }));
  }
  async listProperties(store: StoreId) {
    return [...this.properties.values()].filter((p) => p.store === store);
  }
  async listInstallations(store: StoreId) {
    return [...this.installs.values()].filter((i) => this.properties.get(i.propertyId)?.store === store);
  }
  /** ADR 73: resolved media per storeGameId: [media, resolvedAt]. */
  resolved = new Map<string, { media: EntryMedia; at: number }>();
  async listMediaPending(store: StoreId, olderThan: number, limit: number) {
    return [...this.properties.values()]
      .filter((p) => p.store === store && p.kind === "game" && p.removedAt === null && p.storeGameId !== null)
      .map((p) => p.storeGameId as string)
      .filter((id) => {
        const r = this.resolved.get(id);
        return !r || r.at < olderThan;
      })
      .slice(0, limit);
  }
  async setResolvedMedia(_store: StoreId, media: ReadonlyMap<string, EntryMedia>, requested: readonly string[], at: number) {
    for (const id of requested) this.resolved.set(id, { media: media.get(id) ?? {}, at });
  }
  async applyScanPlan(plan: ScanPlan) {
    this.applied.push(plan);
    const inst = (id: string, propertyId: string, e: { installPath: string; launchData: Readonly<Record<string, string>> | null }) => {
      const prev = [...this.installs.values()].find((i) => i.propertyId === propertyId);
      const rec = { id: prev?.id ?? id, propertyId, deviceId: this.deviceId, installPath: e.installPath, launchData: e.launchData };
      this.installs.set(rec.id, rec);
    };
    for (const c of plan.create) {
      this.canonical.set(c.canonicalId, { id: c.canonicalId, title: c.entry.title });
      this.properties.set(c.propertyId, {
        id: c.propertyId,
        canonicalGameId: c.canonicalId,
        store: plan.store,
        storeGameId: c.entry.storeGameId,
        kind: "game",
        title: c.entry.title,
        normalizedTitle: c.entry.normalizedTitle,
        owned: false,
        removedAt: null,
      });
      inst(c.installationId, c.propertyId, c.entry);
    }
    for (const u of plan.update) {
      const p = this.properties.get(u.propertyId)!;
      this.properties.set(p.id, { ...p, title: u.entry.title, normalizedTitle: u.entry.normalizedTitle });
      if (p.canonicalGameId) this.canonical.set(p.canonicalGameId, { id: p.canonicalGameId, title: u.entry.title });
      inst(u.installationId, u.propertyId, u.entry);
    }
    plan.removeInstallations.forEach((id) => this.installs.delete(id));
    plan.retireProperties.forEach((id) => this.properties.set(id, { ...this.properties.get(id)!, removedAt: plan.at }));
    plan.reviveProperties.forEach((id) => this.properties.set(id, { ...this.properties.get(id)!, removedAt: null }));
    plan.upsertDiscoveredRoots.forEach((r) => this.roots.set(r.id, r));
    plan.deleteRoots.forEach((id) => this.roots.delete(id));
    this.sync.set(`${plan.sync.store}:${plan.sync.operation}`, plan.sync);
  }

  async addUser(root: ScanRootRecord) {
    if ([...this.roots.values()].some((r) => r.origin === "user" && r.pathKey === root.pathKey)) return null;
    this.roots.set(root.id, root);
    return root;
  }
  async setEnabled(id: string, enabled: boolean) {
    this.roots.set(id, { ...this.roots.get(id)!, enabled });
  }
  async remove(id: string) {
    return this.roots.get(id)?.origin === "user" && this.roots.delete(id);
  }
  async put(state: SyncStateRecord) {
    this.sync.set(`${state.store}:${state.operation}`, state);
  }
  async resetRunning() {
    let n = 0;
    for (const [k, s] of this.sync) {
      if (s.status === "running") {
        this.sync.set(k, { ...s, status: "idle" });
        n++;
      }
    }
    return n;
  }
  async set(k: string, v: unknown) {
    this.kv.set(k, v);
  }
  async delete(k: string) {
    this.kv.delete(k);
  }
}

// Roots, sync state and settings share method names, so the core gets small views over the same store.
export function views(store: MemoryStore) {
  return {
    library: store as LibraryRepository,
    identity: store as IdentityRepository,
    scanRoots: {
      list: async () => [...store.roots.values()],
      get: async (id: string) => store.roots.get(id) ?? null,
      addUser: (r: ScanRootRecord) => store.addUser(r),
      setEnabled: (id: string, e: boolean) => store.setEnabled(id, e),
      remove: async (id: string) => Boolean(await store.remove(id)),
    } satisfies ScanRootRepository,
    syncState: {
      get: async (s: StoreId, o: "library" | "scan") => store.sync.get(`${s}:${o}`) ?? null,
      list: async () => [...store.sync.values()],
      put: (s: SyncStateRecord) => store.put(s),
      resetRunning: () => store.resetRunning(),
    } satisfies SyncStateRepository,
    settings: {
      get: async (k: string) => store.kv.get(k),
      set: (k: string, v: unknown) => store.set(k, v),
      delete: (k: string) => store.delete(k),
    } satisfies SettingsRepository,
  };
}

export const STEAM_CAPS: ConnectorCapabilities = {
  library: false,
  scan: true,
  dlc: "none",
  actions: ["play"],
  launchKinds: ["uri"],
  uriSchemes: ["steam"],
  storePlaytime: false,
  price: false,
};

export interface ConnectorOptions {
  id?: StoreId;
  caps?: Partial<ConnectorCapabilities>;
  scan?: (ctx: ScanContext) => Promise<ScanResult>;
  discover?: StoreConnector["discoverRoots"];
  resolveAction?: StoreConnector["resolveAction"];
  locations?: StoreConnector["locations"];
  resolveMedia?: StoreConnector["resolveMedia"];
  apiHosts?: string[];
}

export function makeConnector(o: ConnectorOptions = {}): StoreConnector {
  const base = {
    contractVersion: 1 as const,
    id: o.id ?? ("steam" as StoreId),
    nameKey: key("connectors.test.name"),
    access: "official-api" as const,
    capabilities: { ...STEAM_CAPS, ...o.caps },
    minSyncIntervalMs: 600_000,
    authHosts: [],
    mediaHosts: ["shared.akamai.steamstatic.com"],
    apiHosts: o.apiHosts ?? (o.resolveMedia ? ["api.example.com"] : []),
    locations: o.locations ?? [
      { id: "steam-root", purpose: "scan" as const, os: ["windows" as const], sources: [{ kind: "known-folder" as const, folder: "ProgramFilesX86" as const, relative: "Steam" }] },
      { id: "steam-client", purpose: "launcher" as const, os: ["windows" as const], sources: [{ kind: "known-folder" as const, folder: "ProgramFilesX86" as const, relative: "Steam\\steam.exe" }] },
    ],
    externalTools: [],
    scanInstalled: o.scan ?? (async () => ({ entries: [], unreadableRoots: [] })),
    resolveAction: o.resolveAction ?? (async (p) => ({ kind: "uri", uri: `steam://rungameid/${p.storeGameId}` })),
    ...(o.discover ? { discoverRoots: o.discover } : {}),
    ...(o.resolveMedia ? { resolveMedia: o.resolveMedia } : {}),
  };
  return base as StoreConnector;
}

export function entry(id: string, title: string, path: string, extra: Partial<InstalledEntry> = {}): InstalledEntry {
  return { storeGameId: id, kind: "game", title, installPath: path, ...extra };
}

export interface Harness {
  core: LudiaryCore;
  store: MemoryStore;
  files: FakeFiles;
  clock: FakeClock;
  logs: string[];
  opened: string[];
  execs: unknown[];
  deps: CoreDeps;
  ids: () => string;
}

export async function harness(
  opts: {
    connectors?: StoreConnector[];
    dirs?: string[];
    files?: string[];
    locations?: LocationResolver | null;
    launcher?: Partial<ProcessLauncher> | null;
    picker?: FolderPicker | null;
    onboarded?: boolean;
    mode?: "auto-and-manual" | "manual-only" | "later" | null;
    http?: CoreDeps["http"];
  } = {},
): Promise<Harness> {
  const store = new MemoryStore();
  const files = new FakeFiles(opts.dirs ?? [], opts.files ?? []);
  const clock = new FakeClock();
  const logs: string[] = [];
  const opened: string[] = [];
  const execs: unknown[] = [];
  let n = 0;
  const ids = () => `id${++n}`;
  const launcher: ProcessLauncher | undefined =
    opts.launcher === null
      ? undefined
      : { kinds: ["uri"], openUri: async (u) => void opened.push(u), exec: async (s) => void execs.push(s), ...opts.launcher };
  const log = (level: string) => (m: string, f?: object) => void logs.push(`${level}: ${m} ${JSON.stringify(f ?? {})}`);
  const v = views(store);
  if (opts.onboarded !== false) {
    store.kv.set("onboarding.completedAt", 1);
    if (opts.mode !== null) store.kv.set("detection.mode", opts.mode ?? "manual-only");
  }
  const deps: CoreDeps = {
    connectors: opts.connectors ?? [makeConnector()],
    ...v,
    files,
    ...(opts.locations === null || opts.locations === undefined ? {} : { locations: opts.locations }),
    ...(launcher ? { launcher } : {}),
    ...(opts.picker ? { folderPicker: opts.picker } : {}),
    ...(opts.http ? { http: opts.http } : {}),
    clock,
    newId: ids,
    log: { debug: log("debug"), info: log("info"), warn: log("warn"), error: log("error") },
    t: (k) => k,
  };
  const core = await createCore(deps);
  return { core, store, files, clock, logs, opened, execs, deps, ids };
}

export const resolver = (map: Record<string, ResolvedLocation[]>): LocationResolver => ({
  resolve: async (d) => map[d.id] ?? [],
});

export function addUserRoot(h: Harness, path: string, enabled = true): ScanRootRecord {
  const r: ScanRootRecord = { id: `root-${path}`, origin: "user", path, pathKey: h.files.compareKey(path), declarationId: null, store: null, tag: null, enabled };
  h.store.roots.set(r.id, r);
  return r;
}

export async function scanNow(h: Harness) {
  await h.core.requestSync({ trigger: "manual" });
  await h.core.whenIdle();
}
