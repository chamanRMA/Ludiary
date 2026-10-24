// Scan and synchronization (ADR 40 rules 1-4, ADR 42, 50, 72).
import { ConnectorError, LocationsUnreadableError } from "@ludiary/contracts";
import type { ConnectorLogger, ResolvedLocation, ScanRoot, ScopedFileReader, StoreConnector, StoreId } from "@ludiary/contracts";
import { storedActiveRoots } from "./active-roots";
import { connectorLogger, epochOf, LIBRARY_MAX_BYTES, syncContext } from "./contexts";
import {
  AUTO_SYNC_DEFAULT_MS,
  AUTO_SYNC_MS,
  CONNECTOR_TIMEOUT_MS,
  ERROR_BACKOFF_FACTOR,
  LIBRARY_TIMEOUT_MS,
  MAX_BACKOFF_MS,
  SCAN_WAIT_MS,
  type Env,
} from "./env";
import { asKey, toErrorInfo } from "./errors";
import { computeLibraryPlan } from "./library-plan";
import type { CoreErrorInfo, LibraryEntry, ScanRootRecord, ScannedEntry, StoreStatus, SyncOperation, SyncStateRecord } from "./model";
import { computeScanPlan, planDiscoveredRoots } from "./scan-plan";
import { effectiveLocale, readOnboarding, readSettings } from "./settings";
import { createMediaStep } from "./media";
import { withTimeout } from "./timeout";
import { validateDiscoveredRoots, validateEntries, validateLibraryEntries, type ValidatedRoot } from "./validate";

export interface ScheduleOptions {
  stores?: readonly StoreId[];
  /** true: no waits (the user changed something, or a store was just connected). */
  force: boolean;
  /** Decides the library timing when not forced (ADR 50). Defaults to 'manual'. */
  trigger?: "open" | "manual";
  /** Defaults to ['scan']. 'library' runs first when both are asked (ADR 74). */
  operations?: readonly SyncOperation[];
}

export interface SyncService {
  /** Starts the operations (all stores or the given ones). Resolves when they are accepted and marked 'running'. */
  schedule(opts: ScheduleOptions): Promise<void>;
  whenIdle(): Promise<void>;
  storeStatus(): Promise<readonly StoreStatus[]>;
}

/** Minimum time between two forced (manual) library syncs of one store. */
export const MANUAL_SYNC_FLOOR_MS = 60_000;
const STATUS_TIMEOUT_MS = 10_000;
const LIBRARY_AUTH_CODES: readonly string[] = ["auth.invalid", "auth.expired", "auth.required"];

export function createSyncService(env: Env): SyncService {
  const { deps } = env;
  const media = createMediaStep(env);
  const inFlight = new Map<StoreId, Promise<void>>();
  const queued = new Map<StoreId, Set<SyncOperation>>();

  const connectorLog = (id: StoreId): ConnectorLogger => connectorLogger(env, id);

  async function libraryEligible(c: StoreConnector): Promise<boolean> {
    if (!c.capabilities.library || !c.listLibrary || !deps.http) return false;
    return (await deps.connections.get(c.id))?.status === "connected";
  }

  async function schedule(opts: ScheduleOptions): Promise<void> {
    const onboarding = await readOnboarding(env);
    if (onboarding.completedAt === null) return; // ADR 72: nothing is scanned before the first run is completed
    const ops = new Set<SyncOperation>(opts.operations ?? ["scan"]);
    const trigger = opts.trigger ?? "manual";
    const accepted: Promise<void>[] = [];
    for (const c of env.connectors.values()) {
      if (opts.stores && !opts.stores.includes(c.id)) continue;
      const mine = new Set<SyncOperation>();
      if (ops.has("scan") && c.capabilities.scan && c.scanInstalled) mine.add("scan");
      if (ops.has("library") && (await libraryEligible(c))) mine.add("library");
      if (mine.size === 0) continue;
      if (inFlight.has(c.id)) {
        if (opts.force) queued.set(c.id, new Set([...(queued.get(c.id) ?? []), ...mine]));
        continue;
      }
      let markAccepted: () => void = () => undefined;
      accepted.push(new Promise<void>((resolve) => (markAccepted = resolve)));
      inFlight.set(
        c.id,
        runLoop(c, mine, opts.force, trigger, markAccepted).finally(() => inFlight.delete(c.id)),
      );
    }
    await Promise.all(accepted);
  }

  async function runLoop(c: StoreConnector, first: Set<SyncOperation>, force: boolean, trigger: "open" | "manual", accepted: () => void): Promise<void> {
    let ops = first;
    let firstRun = true;
    do {
      queued.delete(c.id);
      // ADR 74: 'library' before 'scan', never at the same time, so their writes to properties do not cross.
      if (ops.has("library")) await runLibrary(c, force || !firstRun, trigger, accepted);
      if (ops.has("scan")) await runScan(c, force || !firstRun, accepted);
      firstRun = false;
      ops = queued.get(c.id) ?? new Set();
    } while (ops.size > 0);
    accepted();
  }

  function libraryDue(c: StoreConnector, prev: SyncStateRecord | null, now: number, trigger: "open" | "manual"): boolean {
    if (!prev || prev.lastAttemptAt === null) return true;
    const floor = c.minSyncIntervalMs;
    // Decision 50 (revised 24-10-2026): the user may force a sync inside the connector's interval, never twice within a minute.
    if (trigger === "manual") return now >= prev.lastAttemptAt + MANUAL_SYNC_FLOOR_MS;
    if (now < prev.lastAttemptAt + floor) return false;
    if (prev.status === "error") return now >= prev.lastAttemptAt + Math.min(ERROR_BACKOFF_FACTOR * floor, MAX_BACKOFF_MS);
    if (prev.lastSuccessAt === null) return true;
    return now - prev.lastSuccessAt > (AUTO_SYNC_MS[c.id] ?? AUTO_SYNC_DEFAULT_MS);
  }

  async function runLibrary(c: StoreConnector, force: boolean, trigger: "open" | "manual", accepted: () => void): Promise<void> {
    const base = { store: c.id, operation: "library" } as const;
    let prev: SyncStateRecord | null = null;
    let t0 = 0;
    try {
      prev = await deps.syncState.get(c.id, "library");
      t0 = deps.clock.now();
      if (!force && !libraryDue(c, prev, t0, trigger)) {
        accepted();
        return;
      }
      if (!(await libraryEligible(c))) {
        accepted();
        return;
      }
      await deps.syncState.put({
        ...base,
        lastAttemptAt: t0,
        lastSuccessAt: prev?.lastSuccessAt ?? null,
        status: "running",
        error: null,
        nextAllowedAt: t0 + c.minSyncIntervalMs,
      });
      accepted();
      await doLibrary(c, t0, prev);
    } catch (e) {
      deps.log.error("Library sync failed while saving", { connector: c.id, error: e instanceof Error ? e.name : "unknown" });
      accepted();
      try {
        await deps.syncState.put({
          ...base,
          lastAttemptAt: t0,
          lastSuccessAt: prev?.lastSuccessAt ?? null,
          status: "error",
          error: toErrorInfo(e),
          nextAllowedAt: t0 + c.minSyncIntervalMs,
        });
      } catch {
        /* the database is gone; the startup reset handles a stuck 'running' */
      }
    }
  }

  /**
   * ADR 80: 'library' locations, only with auto-detection (the permission to look at launcher folders, ADR 42).
   * Absent proves nothing and gives an empty reader; unreadable is `scan.discovery-unavailable` and the sync fails (ADR 79).
   */
  async function libraryFiles(c: StoreConnector): Promise<{ fs: ScopedFileReader; locations: readonly ResolvedLocation[] } | undefined> {
    const decls = c.locations.filter((l) => l.purpose === "library");
    if (decls.length === 0 || !deps.locations || (await readSettings(env)).detection !== "auto-and-manual") return undefined;
    const found: ResolvedLocation[] = [];
    for (const decl of decls) {
      try {
        found.push(...(await deps.locations.resolve(decl)));
      } catch (e) {
        deps.log.warn("Could not resolve a library location", { connector: c.id, location: decl.id, error: e instanceof Error ? e.name : "unknown" });
        throw new ConnectorError("scan.discovery-unavailable", "A library location could not be read");
      }
    }
    return { fs: deps.files.scoped(found.map((r) => r.path)), locations: found };
  }

  async function doLibrary(c: StoreConnector, t0: number, prev: SyncStateRecord | null): Promise<void> {
    const listLibrary = c.listLibrary;
    if (!listLibrary) return;
    const log = connectorLog(c.id);
    const signal = deps.clock.timeout(LIBRARY_TIMEOUT_MS);
    const base = { store: c.id, operation: "library", lastAttemptAt: t0 } as const;
    let entries: LibraryEntry[] = [];
    let complete = false;
    let error: CoreErrorInfo | null = null;
    let retryAfterMs = 0;
    let authLost = false;

    const epoch = epochOf(env, c.id);
    try {
      const lib = await libraryFiles(c);
      const ctx = await syncContext(env, c, signal, { maxBytes: LIBRARY_MAX_BYTES, epoch: "guard", ...(lib ? { fs: lib.fs, libraryLocations: lib.locations } : {}) });
      const snapshot = await withTimeout(signal, () => listLibrary.call(c, ctx));
      if (!snapshot || typeof snapshot !== "object") throw new ConnectorError("store.unexpected-response", "listLibrary returned nothing");
      const valid = validateLibraryEntries({ entries: snapshot.entries, connector: c, log: deps.log });
      entries = valid.entries;
      complete = snapshot.complete === true && !valid.lossy;
      // Steam sometimes answers an empty list for a public profile (ADR 74, S5): never let that empty the library.
      if (complete && entries.length === 0 && (await deps.library.countOwned(c.id)) > 0) {
        complete = false;
        deps.log.warn("The store returned an empty library; kept what was owned", { connector: c.id });
      }
    } catch (e) {
      error = toErrorInfo(e);
      if (e instanceof ConnectorError) {
        retryAfterMs = e.details.retryAfterMs ?? 0;
        authLost = LIBRARY_AUTH_CODES.includes(e.code);
      }
      deps.log.warn("Library sync failed", { connector: c.id, code: error.code });
    }

    // Disconnected or reconnected while the call was in flight: write nothing, the state belongs to the new session.
    if (epochOf(env, c.id) !== epoch) return;

    const wait = Math.max(c.minSyncIntervalMs, Math.min(retryAfterMs, MAX_BACKOFF_MS));
    if (error) {
      // A failed sync changes nothing in the library; an authentication failure only flips the connection (ADR 74 point 9).
      if (authLost) await deps.connections.setStatus(c.id, "expired");
      await deps.syncState.put({ ...base, nextAllowedAt: t0 + wait, lastSuccessAt: prev?.lastSuccessAt ?? null, status: "error", error });
      return;
    }

    // Disconnected (or expired) while the call was in flight: the result is dropped.
    const connection = await deps.connections.get(c.id);
    if (!connection) return;
    if (connection.status !== "connected") {
      const lost = toErrorInfo(new ConnectorError("auth.expired", "The connection expired during the sync"));
      await deps.syncState.put({ ...base, nextAllowedAt: t0 + wait, lastSuccessAt: prev?.lastSuccessAt ?? null, status: "error", error: lost });
      return;
    }

    if (epochOf(env, c.id) !== epoch) return;
    const at = deps.clock.now();
    const sync: SyncStateRecord = { ...base, nextAllowedAt: t0 + c.minSyncIntervalMs, lastSuccessAt: at, status: "idle", error: null };
    const plan = computeLibraryPlan({
      store: c.id,
      at,
      newId: deps.newId,
      entries,
      complete,
      properties: await deps.library.listProperties(c.id),
      installations: await deps.library.listInstallations(c.id),
      sync,
    });
    if (!media.canRun(c)) {
      await deps.library.applyLibraryPlan(plan);
      return;
    }
    // ADR 73: 'running' until the media step ends, as in the scan.
    await deps.library.applyLibraryPlan({ ...plan, sync: { ...plan.sync, status: "running", error: null } });
    await media.run(c, await effectiveLocale(env), log);
    await deps.syncState.put(plan.sync);
  }

  async function runScan(c: StoreConnector, force: boolean, accepted: () => void): Promise<void> {
    const base = { store: c.id, operation: "scan" } as const;
    let prev: SyncStateRecord | null = null;
    let t0 = 0;
    try {
      prev = await deps.syncState.get(c.id, "scan");
      t0 = deps.clock.now();
      if (!force && prev?.lastAttemptAt != null && t0 < prev.lastAttemptAt + SCAN_WAIT_MS) {
        accepted();
        return; // ADR 72: 60 s since the last attempt, in every store
      }
      await deps.syncState.put({
        ...base,
        lastAttemptAt: t0,
        lastSuccessAt: prev?.lastSuccessAt ?? null,
        status: "running",
        error: null,
        nextAllowedAt: t0 + SCAN_WAIT_MS,
      });
      accepted();
      await doScan(c, t0, prev);
    } catch (e) {
      // Persistence failed: nothing else to do but record it if we still can.
      deps.log.error("Scan failed while saving", { connector: c.id, error: e instanceof Error ? e.name : "unknown" });
      accepted();
      try {
        await deps.syncState.put({
          ...base,
          lastAttemptAt: t0,
          lastSuccessAt: prev?.lastSuccessAt ?? null,
          status: "error",
          error: toErrorInfo(e),
          nextAllowedAt: t0 + SCAN_WAIT_MS,
        });
      } catch {
        /* the database is gone; the startup reset handles a stuck 'running' */
      }
    }
  }

  async function doScan(c: StoreConnector, t0: number, prev: SyncStateRecord | null): Promise<void> {
    const scanInstalled = c.scanInstalled;
    if (!scanInstalled) return;
    const { files, newId } = deps;
    const mode = (await readSettings(env)).detection ?? "later";
    const [stored, properties, installations] = await Promise.all([
      deps.scanRoots.list(),
      deps.library.listProperties(c.id),
      deps.library.listInstallations(c.id),
    ]);
    const log = connectorLog(c.id);
    const locale = await effectiveLocale(env);
    const signal = deps.clock.timeout(CONNECTOR_TIMEOUT_MS);

    const roots: ScanRoot[] = [];
    let discovered: { upsert: ScanRootRecord[]; delete: string[] } = { upsert: [], delete: [] };
    let discoveryUnavailable = false;
    let entries: ScannedEntry[] = [];
    let unreadable: string[] = [];
    let error: CoreErrorInfo | null = null;

    try {
      if (mode !== "later") {
        for (const r of storedActiveRoots(mode, stored, c.id)) if (r.origin === "user") roots.push({ origin: "user", path: r.path });

        // ADR 72: 'manual-only' scans only the user's folders. Stored discovered folders count only in 'auto-and-manual'.
        let discoveredActive: readonly ScanRootRecord[] =
          storedActiveRoots(mode, stored, c.id).filter((r) => r.origin === "discovered");
        if (mode === "auto-and-manual" && deps.locations) {
          const found = await discover(c, signal, locale, log);
          discoveryUnavailable = !found || found.unresolved.size > 0 || found.lossy;
          if (found) {
            const plan = planDiscoveredRoots(c.id, found.roots, stored, newId, { keepDeclarations: found.unresolved, lossy: found.lossy });
            if (plan.conflicts > 0) deps.log.warn("Discovered folders already belong to another store", { connector: c.id, count: plan.conflicts });
            discovered = plan;
            discoveredActive = [...plan.upsert, ...plan.kept].filter((r) => r.enabled);
          }
        }
        for (const r of discoveredActive) {
          roots.push({ origin: "discovered", declarationId: r.declarationId ?? "", path: r.path, ...(r.tag ? { tag: r.tag } : {}) });
        }
      }

      const rootPaths = roots.map((r) => r.path);
      if (rootPaths.length > 0) {
        const result = await withTimeout(signal, () =>
          scanInstalled.call(c, { signal, log, locale, roots, fs: files.scoped(rootPaths), progress: { report: () => undefined } }),
        );
        if (!result || typeof result !== "object") throw new ConnectorError("store.unexpected-response", "scanInstalled returned nothing");
        entries = await validateEntries({ entries: result.entries, roots: rootPaths, connector: c, files, log: deps.log });
        const bad = Array.isArray(result.unreadableRoots) ? result.unreadableRoots : [];
        unreadable = bad.filter((u) => u && u.root && typeof u.root.path === "string").map((u) => u.root.path);
      }
    } catch (e) {
      error = toErrorInfo(e);
      deps.log.warn("Scan failed", { connector: c.id, code: error.code });
    }

    const at = deps.clock.now();
    const base = { store: c.id, operation: "scan", lastAttemptAt: t0, nextAllowedAt: t0 + SCAN_WAIT_MS } as const;
    if (error) {
      // A failed scan changes nothing in the library (the plan is not applied).
      await deps.syncState.put({ ...base, lastSuccessAt: prev?.lastSuccessAt ?? null, status: "error", error });
      return;
    }

    const rootPaths = roots.map((r) => r.path);
    const unreadableKeys = new Set(unreadable.map((p) => files.compareKey(p)));
    const allUnreadable = rootPaths.length > 0 && rootPaths.every((p) => unreadableKeys.has(files.compareKey(p)));
    const sync: SyncStateRecord = allUnreadable
      ? {
          ...base,
          lastSuccessAt: prev?.lastSuccessAt ?? null,
          status: "error",
          error: { code: "scan.root-unreadable", key: asKey("connectors.common.errors.scan.root-unreadable") },
        }
      : {
          ...base,
          lastSuccessAt: at,
          status: "idle",
          // ADR 79: a warning, not a failure. The scan ran on the stored folders.
          error: discoveryUnavailable ? { code: "scan.discovery-unavailable", key: asKey("connectors.common.errors.scan.discovery-unavailable") } : null,
        };

    const plan = await computeScanPlan({
      store: c.id,
      at,
      newId,
      files,
      entries,
      roots: rootPaths,
      unreadableRoots: unreadable,
      properties,
      installations,
      discovered,
      sync,
    });
    if (!media.canRun(c)) {
      await deps.library.applyScanPlan(plan);
      return;
    }
    // ADR 73: the state stays 'running' until the media step ends, so the web sees the covers when it refreshes.
    await deps.library.applyScanPlan({ ...plan, sync: { ...plan.sync, status: "running", error: null } });
    await media.run(c, locale, connectorLog(c.id));
    await deps.syncState.put(plan.sync);
  }

  /**
   * Locations -> discoverRoots (ADR 42, 72, 79). Returns null when it could not be done: stored roots are then left as they are.
   * A declaration that cannot be read (but did not make everything fail) goes to `unresolved`: its stored roots are kept.
   * `lossy`: the list was cut, so nothing stored may be deleted from it.
   */
  async function discover(
    c: StoreConnector,
    signal: AbortSignal,
    locale: string,
    log: ConnectorLogger,
  ): Promise<{ roots: ValidatedRoot[]; unresolved: Set<string>; lossy: boolean } | null> {
    const resolver = deps.locations;
    if (!resolver) return null;
    try {
      const resolved: ResolvedLocation[] = [];
      const unresolved = new Set<string>();
      for (const decl of c.locations.filter((l) => l.purpose === "scan")) {
        try {
          resolved.push(...(await withTimeout(signal, () => resolver.resolve(decl))));
        } catch (e) {
          if (e instanceof LocationsUnreadableError) resolved.push(...e.partial);
          unresolved.add(decl.id);
          deps.log.warn("Could not resolve a location", { connector: c.id, location: decl.id, error: e instanceof Error ? e.name : "unknown" });
        }
      }
      let returned: readonly ResolvedLocation[] = resolved;
      const discoverRoots = c.discoverRoots;
      if (discoverRoots && resolved.length > 0) {
        returned = await withTimeout(signal, () =>
          discoverRoots.call(c, { signal, log, locale, locations: resolved, fs: deps.files.scoped(resolved.map((l) => l.path)) }),
        );
      }
      const validated = await validateDiscoveredRoots(returned, c, deps.files, deps.log);
      for (const id of validated.unresolved) unresolved.add(id);
      return { roots: validated.roots, unresolved, lossy: validated.truncated };
    } catch (e) {
      deps.log.warn("Root discovery failed", { connector: c.id, code: toErrorInfo(e).code });
      return null;
    }
  }

  return {
    schedule,
    async whenIdle() {
      while (inFlight.size > 0) await Promise.allSettled([...inFlight.values()]);
    },
    async storeStatus() {
      const [states, rows] = await Promise.all([deps.syncState.list(), deps.connections.list()]);
      const byStore = new Map(rows.map((r) => [r.store, r]));
      return Promise.all(
        [...env.connectors.values()].map(async (c): Promise<StoreStatus> => {
          const sync = states.filter((st) => st.store === c.id);
          const wizard = c.connection;
          const row = byStore.get(c.id);
          if (!wizard) return { store: c.id, access: c.access, connection: "not-applicable", mode: "installed-only", sync };
          if (!row) return { store: c.id, access: c.access, connection: "disconnected", mode: "installed-only", sync };
          // ADR 74 point 6: the row says one thing, the connector another (it reads its secrets, no network). Any 'expired' wins.
          let state: "connected" | "expired" = row.status;
          let label = row.accountLabel;
          try {
            const signal = deps.clock.timeout(STATUS_TIMEOUT_MS);
            const st = await withTimeout(signal, async () => wizard.status(await syncContext(env, c, signal)));
            if (st.state !== "connected") state = "expired";
            label = label ?? st.accountLabel ?? null;
          } catch {
            deps.log.warn("Could not check the connection", { connector: c.id });
          }
          return {
            store: c.id,
            access: c.access,
            connection: state,
            mode: state === "connected" ? "library" : "installed-only",
            ...(label ? { accountLabel: label } : {}),
            sync,
          };
        }),
      );
    },
  };
}
