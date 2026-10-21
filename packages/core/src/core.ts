// LudiaryCore: the facade that the HTTP layer consumes (ADR 72, point 4).
import { checkConnectorManifest } from "@ludiary/contracts";
import type { GameAction, StoreConnector, StoreId } from "@ludiary/contracts";
import type { CoreCapabilities, CoreDeps, Env, LudiaryCore } from "./env";
import { CoreError } from "./errors";
import { createLaunchService } from "./launch";
import type { GameDetail, ScanRootRecord } from "./model";
import {
  completeOnboarding,
  readOnboarding,
  readSettings,
  requireRoot,
  resetOnboarding,
  writeSettings,
} from "./settings";
import { createSyncService } from "./sync";

/** A connector was refused at startup (ADR 40 rule 11, ADR 72). `problems` are English, for developers. */
export class ConnectorRegistrationError extends Error {
  constructor(
    readonly connectorId: string,
    readonly problems: readonly string[],
  ) {
    super(`Connector '${connectorId}' refused: ${problems.join("; ")}`);
    this.name = "ConnectorRegistrationError";
  }
}

function registerConnectors(deps: CoreDeps): Map<StoreId, StoreConnector> {
  const map = new Map<StoreId, StoreConnector>();
  for (const c of deps.connectors) {
    const problems = [...checkConnectorManifest(c)];
    if (map.has(c.id)) problems.push("duplicate connector id");
    if (deps.launcher) {
      for (const k of c.capabilities.launchKinds) {
        if (!deps.launcher.kinds.includes(k)) problems.push(`the platform cannot run launch kind '${k}'`);
      }
    }
    if (problems.length > 0) throw new ConnectorRegistrationError(String(c.id), problems);
    map.set(c.id, c);
  }
  return map;
}

export async function createCore(deps: CoreDeps): Promise<LudiaryCore> {
  const connectors = registerConnectors(deps);
  const { userId, deviceId } = await deps.identity.ensure(deps.newId, deps.clock.now());
  const reset = await deps.syncState.resetRunning();
  if (reset > 0) deps.log.warn("Reset interrupted syncs to idle", { count: reset });

  const env: Env = { deps, connectors, userId, deviceId };
  const sync = createSyncService(env);
  const launch = createLaunchService(env);
  const capabilities: CoreCapabilities = {
    canScan: true,
    canLaunch: deps.launcher !== undefined,
    canPickFolder: deps.folderPicker !== undefined,
  };
  let picking = false;

  const withActions = (game: GameDetail): GameDetail => ({
    ...game,
    properties: game.properties.map((p) => {
      const c = p.store === "manual" ? undefined : connectors.get(p.store);
      const actions: GameAction[] = [];
      if (c) {
        // The main action (ADR 16): play if installed (and this mode can launch), otherwise open the store page.
        if (p.installed && deps.launcher && c.capabilities.actions.includes("play")) actions.push("play");
        else if (!p.installed && c.capabilities.actions.includes("open-store-page")) actions.push("open-store-page");
      }
      return { ...p, actions };
    }),
  });

  /** Changes of settings or folders force a scan without the 60 s wait (ADR 72). */
  const rescan = (stores?: readonly StoreId[]) => sync.schedule({ ...(stores ? { stores } : {}), force: true });

  return {
    capabilities,
    listLibrary: () => deps.library.listLibrary(),
    async getGame(canonicalId) {
      if (typeof canonicalId !== "string" || canonicalId === "") throw new CoreError("invalid-input", "Missing game id");
      const g = await deps.library.getGame(canonicalId);
      return g ? withActions(g) : null;
    },
    launch: (canonicalId, propertyId) => launch.launch(canonicalId, propertyId),

    async requestSync(req) {
      if (!req || (req.trigger !== "open" && req.trigger !== "manual")) throw new CoreError("invalid-input", "Unknown sync trigger");
      for (const op of req.operations ?? []) {
        if (op !== "library" && op !== "scan") throw new CoreError("invalid-input", "Unknown sync operation");
      }
      const ops = req.operations ?? ["library", "scan"];
      // 'library' has no connector to call until the account cut (ADR 72): only 'scan' does something.
      if (!ops.includes("scan")) return;
      await sync.schedule({ force: false });
    },
    whenIdle: () => sync.whenIdle(),
    storeStatus: () => sync.storeStatus(),

    getSettings: () => readSettings(env),
    async updateSettings(patch) {
      const { settings, detectionChanged } = await writeSettings(env, patch);
      if (detectionChanged) await rescan();
      return settings;
    },
    getOnboarding: () => readOnboarding(env),
    async completeOnboarding(mode) {
      await completeOnboarding(env, mode);
      await rescan();
    },
    resetOnboarding: () => resetOnboarding(env),

    listScanRoots: () => deps.scanRoots.list(),
    async setScanRootEnabled(id, enabled) {
      if (typeof enabled !== "boolean") throw new CoreError("invalid-input", "enabled must be a boolean");
      const root = await requireRoot(env, id);
      if (root.enabled !== enabled) {
        await deps.scanRoots.setEnabled(id, enabled);
        await rescan(root.store ? [root.store] : undefined);
      }
      return { ...root, enabled };
    },
    async pickScanRoot() {
      const picker = deps.folderPicker;
      if (!picker) throw new CoreError("picker-unavailable", "This mode has no folder dialog");
      if (picking) throw new CoreError("busy", "A folder dialog is already open");
      picking = true;
      let chosen: string | null;
      try {
        chosen = await picker.pick({ title: deps.t("core.pickFolder.title") });
      } finally {
        picking = false;
      }
      if (chosen === null) return null;
      if (typeof chosen !== "string" || !deps.files.isAbsolute(chosen)) throw new CoreError("invalid-input", "The chosen path is not absolute");
      const path = deps.files.normalize(chosen);
      if (!(await deps.files.isDirectory(path))) throw new CoreError("invalid-input", "The chosen path is not a folder");
      const pathKey = deps.files.compareKey(path);
      const record: ScanRootRecord = { id: deps.newId(), origin: "user", path, pathKey, declarationId: null, store: null, tag: null, enabled: true };
      const added = await deps.scanRoots.addUser(record);
      if (added) {
        await rescan();
        return added;
      }
      // Already known: return it (and switch it on if it was off).
      const existing = (await deps.scanRoots.list()).find((r) => r.origin === "user" && r.pathKey === pathKey);
      if (!existing) throw new CoreError("invalid-input", "The folder could not be added");
      if (!existing.enabled) {
        await deps.scanRoots.setEnabled(existing.id, true);
        await rescan();
        return { ...existing, enabled: true };
      }
      return existing;
    },
    async removeScanRoot(id) {
      const root = await requireRoot(env, id);
      if (root.origin !== "user") throw new CoreError("invalid-input", "Only folders added by the user can be removed");
      await deps.scanRoots.remove(id);
      await rescan();
    },
  };
}
