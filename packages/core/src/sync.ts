// Scan and synchronization (ADR 40 rules 1-4, ADR 42, 50, 72).
import { ConnectorError } from "@ludiary/contracts";
import type { ConnectorLogger, ResolvedLocation, ScanRoot, StoreConnector, StoreId } from "@ludiary/contracts";
import { CONNECTOR_TIMEOUT_MS, SCAN_WAIT_MS, type Env } from "./env";
import { asKey, toErrorInfo } from "./errors";
import type { CoreErrorInfo, ScanRootRecord, ScannedEntry, StoreStatus, SyncStateRecord } from "./model";
import { computeScanPlan, planDiscoveredRoots } from "./scan-plan";
import { effectiveLocale, readOnboarding, readSettings } from "./settings";
import { validateDiscoveredRoots, validateEntries, type ValidatedRoot } from "./validate";

function timeoutError(): ConnectorError {
  return new ConnectorError("internal", "Connector call timed out", { messageKey: asKey("core.errors.timeout") });
}

/** Races the work against the abort signal, so a connector that ignores the signal cannot hang the scan. */
async function withTimeout<T>(signal: AbortSignal, work: () => Promise<T>): Promise<T> {
  if (signal.aborted) throw timeoutError();
  let onAbort: (() => void) | undefined;
  const aborted = new Promise<never>((_, reject) => {
    onAbort = () => reject(timeoutError());
    signal.addEventListener("abort", onAbort, { once: true });
  });
  try {
    const running = work();
    running.catch(() => undefined); // a late failure after the timeout must not become an unhandled rejection
    return await Promise.race([running, aborted]);
  } finally {
    if (onAbort) signal.removeEventListener("abort", onAbort);
  }
}

export interface SyncService {
  /** Starts scans (all stores or the given ones). Resolves when they are accepted and marked 'running'. */
  schedule(opts: { stores?: readonly StoreId[]; force: boolean }): Promise<void>;
  whenIdle(): Promise<void>;
  storeStatus(): Promise<readonly StoreStatus[]>;
}

export function createSyncService(env: Env): SyncService {
  const { deps } = env;
  const inFlight = new Map<StoreId, Promise<void>>();
  const queued = new Set<StoreId>();

  const connectorLog = (id: StoreId): ConnectorLogger => ({
    debug: (m, f) => deps.log.debug(m, { connector: id, ...f }),
    info: (m, f) => deps.log.info(m, { connector: id, ...f }),
    warn: (m, f) => deps.log.warn(m, { connector: id, ...f }),
  });

  async function schedule(opts: { stores?: readonly StoreId[]; force: boolean }): Promise<void> {
    const onboarding = await readOnboarding(env);
    if (onboarding.completedAt === null) return; // ADR 72: nothing is scanned before the first run is completed
    const accepted: Promise<void>[] = [];
    for (const c of env.connectors.values()) {
      if (!c.capabilities.scan || !c.scanInstalled) continue;
      if (opts.stores && !opts.stores.includes(c.id)) continue;
      if (inFlight.has(c.id)) {
        if (opts.force) queued.add(c.id);
        continue;
      }
      let markAccepted: () => void = () => undefined;
      accepted.push(new Promise<void>((resolve) => (markAccepted = resolve)));
      inFlight.set(
        c.id,
        runLoop(c, opts.force, markAccepted).finally(() => inFlight.delete(c.id)),
      );
    }
    await Promise.all(accepted);
  }

  async function runLoop(c: StoreConnector, force: boolean, accepted: () => void): Promise<void> {
    let first = true;
    do {
      queued.delete(c.id);
      await runScan(c, force || !first, first ? accepted : () => undefined);
      first = false;
    } while (queued.has(c.id));
    accepted();
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
    let entries: ScannedEntry[] = [];
    let unreadable: string[] = [];
    let error: CoreErrorInfo | null = null;

    try {
      if (mode !== "later") {
        for (const r of stored) if (r.origin === "user" && r.enabled) roots.push({ origin: "user", path: r.path });

        // ADR 72: 'manual-only' scans only the user's folders. Stored discovered folders count only in 'auto-and-manual'.
        let discoveredActive: readonly ScanRootRecord[] =
          mode === "auto-and-manual" ? stored.filter((r) => r.origin === "discovered" && r.store === c.id && r.enabled) : [];
        if (mode === "auto-and-manual" && deps.locations) {
          const found = await discover(c, signal, locale, log);
          if (found) {
            discovered = planDiscoveredRoots(c.id, found, stored, newId);
            discoveredActive = discovered.upsert.filter((r) => r.enabled);
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
      : { ...base, lastSuccessAt: at, status: "idle", error: null };

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
    await deps.library.applyScanPlan(plan);
  }

  /** Locations -> discoverRoots (ADR 42, 72). Returns null when it could not be done: stored roots are then left as they are. */
  async function discover(c: StoreConnector, signal: AbortSignal, locale: string, log: ConnectorLogger): Promise<ValidatedRoot[] | null> {
    const resolver = deps.locations;
    if (!resolver) return null;
    try {
      const resolved: ResolvedLocation[] = [];
      for (const decl of c.locations.filter((l) => l.purpose === "scan")) {
        try {
          resolved.push(...(await withTimeout(signal, () => resolver.resolve(decl))));
        } catch (e) {
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
      return await validateDiscoveredRoots(returned, c, deps.files, deps.log);
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
      const states = await deps.syncState.list();
      return [...env.connectors.values()].map(
        (c): StoreStatus => ({
          store: c.id,
          access: c.access,
          connection: c.connection ? "disconnected" : "not-applicable",
          mode: "installed-only",
          sync: states.filter((s) => s.store === c.id),
        }),
      );
    },
  };
}
