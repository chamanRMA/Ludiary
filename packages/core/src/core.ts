// LudiaryCore: the facade that the HTTP layer consumes (ADR 72, point 4).
import { checkConnectorManifest } from "@ludiary/contracts";
import type { GameAction, StoreConnector, StoreId } from "@ludiary/contracts";
import type { CoreCapabilities, CoreDeps, Env, LudiaryCore } from "./env";
import { CoreError, limitReached, toErrorInfo } from "./errors";
import { COLLECTION_MAX_LENGTH, LIMITS, normalizeLabel, TAG_MAX_LENGTH, type Label } from "./labels";
import { withTimeout } from "./timeout";
import { createLaunchService } from "./launch";
import type { GameDataPatch, GameDetail, GameSummary, ScanRootRecord } from "./model";
import {
  completeOnboarding,
  readOnboarding,
  readSettings,
  requireRoot,
  resetOnboarding,
  writeSettings,
} from "./settings";
import { createSyncService } from "./sync";
import { storeScope, createServiceVaultFactory, createVaultFactory } from "./vault";
import { checkPriceServiceManifest } from "@ludiary/contracts";
import type { PriceService, PriceServiceId } from "@ludiary/contracts";
import { createPriceFeature, createPriceGate } from "./prices";
import { createWizardEngine } from "./wizards";
import { createCollectionMirror } from "./collection-mirror";
import { bumpEpoch, syncContext } from "./contexts";

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

function registerPriceServices(deps: CoreDeps): Map<PriceServiceId, PriceService> {
  const map = new Map<PriceServiceId, PriceService>();
  for (const svc of deps.priceServices ?? []) {
    const problems = [...checkPriceServiceManifest(svc)];
    if (map.has(svc.id)) problems.push("duplicate service id");
    if (!deps.prices) problems.push("a price service needs a PriceRepository");
    if (problems.length > 0) throw new ConnectorRegistrationError(String(svc.id), problems);
    map.set(svc.id, svc);
  }
  return map;
}

export async function createCore(deps: CoreDeps): Promise<LudiaryCore> {
  const connectors = registerConnectors(deps);
  const { userId, deviceId } = await deps.identity.ensure(deps.newId, deps.clock.now());
  const reset = await deps.syncState.resetRunning();
  if (reset > 0) deps.log.warn("Reset interrupted syncs to idle", { count: reset });

  const env: Env = {
    deps,
    connectors,
    services: registerPriceServices(deps),
    userId,
    deviceId,
    vaultFor: () => {
      throw new Error("vault factory not ready");
    },
    serviceVaultFor: () => {
      throw new Error("vault factory not ready");
    },
  };
  env.vaultFor = createVaultFactory(env);
  env.serviceVaultFor = createServiceVaultFactory(env);
  const mirror = createCollectionMirror(env);
  const sync = createSyncService(env, mirror);
  const gate = createPriceGate(env);
  const wizards = createWizardEngine(env, (store) => sync.schedule({ stores: [store], force: true, operations: ["library"] }), gate);
  const prices = createPriceFeature(env, gate, (key) => wizards.cancelTarget(key), sync.exclusive);
  const launch = createLaunchService(env);
  const capabilities: CoreCapabilities = {
    canScan: true,
    canLaunch: deps.launcher !== undefined,
    canPickFolder: deps.folderPicker !== undefined,
  };
  let picking = false;

  /** ADR 74: the repository proposes the main action from the data; the core drops it where the mode or the stores cannot do it. */
  const withMainAction = <T extends GameSummary>(game: T): T => {
    const proposed = game.mainAction ?? null;
    const ok = proposed !== null && deps.launcher !== undefined && game.stores.some((st) => connectors.get(st)?.capabilities.actions.includes(proposed));
    return { ...game, mainAction: ok ? proposed : null };
  };

  const withActions = (game: GameDetail): GameDetail => ({
    ...withMainAction(game),
    properties: game.properties.map((p) => {
      const c = p.store === "manual" ? undefined : connectors.get(p.store);
      const actions: GameAction[] = [];
      if (c) {
        // The main action (ADR 16): play if installed (and this mode can launch), otherwise install if owned, otherwise open the store page.
        if (p.installed && deps.launcher && c.capabilities.actions.includes("play")) actions.push("play");
        else if (!p.installed) {
          if (p.owned && deps.launcher && c.capabilities.actions.includes("install")) actions.push("install");
          if (c.capabilities.actions.includes("open-store-page")) actions.push("open-store-page");
        }
      }
      return { ...p, actions };
    }),
  });

  const connectorOf = (store: StoreId): StoreConnector => {
    const c = typeof store === "string" ? connectors.get(store) : undefined;
    if (!c || !c.connection) throw new CoreError("not-found", "This store has no connection");
    return c;
  };

  /** Changes of settings or folders force a scan without the 60 s wait (ADR 72). */
  const rescan = (stores?: readonly StoreId[]) => sync.schedule({ ...(stores ? { stores } : {}), force: true });

  return {
    capabilities,
    async listLibrary() {
      return (await deps.library.listLibrary()).map(withMainAction);
    },
    async getGame(canonicalId) {
      if (typeof canonicalId !== "string" || canonicalId === "") throw new CoreError("invalid-input", "Missing game id");
      const g = await deps.library.getGame(canonicalId);
      return g ? withActions(g) : null;
    },
    async updateGame(canonicalId, patch) {
      if (typeof canonicalId !== "string" || canonicalId === "") throw new CoreError("invalid-input", "Missing game id");
      if (patch.favorite !== undefined && typeof patch.favorite !== "boolean") throw new CoreError("invalid-input", "favorite must be a boolean");
      const data: GameDataPatch = { ...(patch.favorite !== undefined ? { favorite: patch.favorite } : {}) };
      if (patch.tags !== undefined) {
        // Repeated names (same key) are one tag; the first spelling wins.
        const byKey = new Map<string, Label>();
        for (const raw of patch.tags) {
          const label = normalizeLabel(raw, TAG_MAX_LENGTH);
          if (!byKey.has(label.key)) byKey.set(label.key, label);
        }
        // Raw cap only; the per-game rule (20, or no growth) needs the stored set and lives in the repository transaction.
        if (byKey.size > LIMITS.tags) throw limitReached(LIMITS.tags, "tags");
        data.tags = [...byKey.values()];
      }
      if (patch.collectionIds !== undefined) {
        if (!patch.collectionIds.every((id) => typeof id === "string" && id !== "")) throw new CoreError("invalid-input", "Collection ids must be text");
        data.collectionIds = [...new Set(patch.collectionIds)];
      }
      if (Object.keys(data).length === 0) throw new CoreError("invalid-input", "Nothing to change");
      await deps.userData.updateGame(canonicalId, data, deps.clock.now());
      const game = await deps.library.getGame(canonicalId);
      if (!game) throw new CoreError("not-found", "The game is not shown");
      return withActions(game);
    },
    listCollections: () => deps.userData.listCollections(),
    createCollection: async (name) => deps.userData.createCollection(normalizeLabel(name, COLLECTION_MAX_LENGTH), deps.clock.now()),
    async renameCollection(id, name) {
      return deps.userData.renameCollection(id, normalizeLabel(name, COLLECTION_MAX_LENGTH), deps.clock.now());
    },
    deleteCollection: (id) => deps.userData.deleteCollection(id),
    launch: (canonicalId, propertyId, action) => launch.launch(canonicalId, propertyId, action),
    startWizard: (store, returnBase) => wizards.start({ kind: "store", store }, returnBase),
    startServiceWizard: (service, returnBase) => wizards.start({ kind: "service", service }, returnBase),
    listServices: () => prices.listServices(),
    disconnectService: (service) => prices.disconnect(service),
    getGamePrices: (id) => prices.gamePrices(id),
    getPriceBoard: () => prices.board(),
    refreshPrices: (req) => prices.refresh(req),
    setPriceExclusion: (id, excluded) => prices.setExclusion(id, excluded),
    searchPrices: (title) => prices.search(title),
    watchPrice: (resultId) => prices.watch(resultId),
    unwatchPrice: (id) => prices.unwatch(id),
    importWishlist: (store) => prices.importWishlist(store),
    submitWizard: (wizardId, stepId, input) => wizards.submit(wizardId, stepId, input),
    wizardCallback: (wizardId, query) => wizards.callback(wizardId, query),
    cancelWizard: async (wizardId) => wizards.cancel(wizardId),
    shutdown: () => wizards.shutdown(),

    /**
     * ADR 74 point 9 and the user's answer to point 12.1: the connector wipes its secrets, then the whole scope, the
     * connection and the library sync state go. Properties and canonical games are NOT touched: the games stay,
     * veiled as unsynced, and come back to normal on reconnection.
     */
    async disconnect(store) {
      const c = connectorOf(store);
      wizards.cancelTarget(store);
      bumpEpoch(env, store); // a library operation in flight can no longer store a refreshed token (ADR 77)
      const signal = deps.clock.timeout(30_000);
      try {
        await withTimeout(signal, async () => c.connection!.disconnect(await syncContext(env, c, signal)));
      } catch (e) {
        // The connector could not clean its own secrets (or tool sessions): the core still wipes the scope.
        deps.log.warn("The connector could not disconnect cleanly", { connector: store, code: toErrorInfo(e).code });
      }
      await deps.secrets.deleteScope(storeScope(store));
      await deps.connections.delete(store);
      await deps.syncState.delete(store, "library");
      bumpEpoch(env, store);
    },

    async requestSync(req) {
      if (!req || (req.trigger !== "open" && req.trigger !== "manual")) throw new CoreError("invalid-input", "Unknown sync trigger");
      for (const op of req.operations ?? []) {
        if (op !== "library" && op !== "scan") throw new CoreError("invalid-input", "Unknown sync operation");
      }
      await sync.schedule({ force: false, trigger: req.trigger, operations: req.operations ?? ["library", "scan"] });
    },
    whenIdle: () => sync.whenIdle(),
    storeStatus: () => sync.storeStatus(),

    getSettings: () => readSettings(env),
    async updateSettings(patch) {
      const { settings, detectionChanged, collections } = await writeSettings(env, patch);
      // ADR 88: off deletes the mirrors (the setting is already stored, so a pass in flight finds it off); on, or the favorites setting, runs a pass.
      const again: StoreId[] = [];
      for (const c of collections) {
        if (c.enabledChanged && settings.storeCollections[c.store]?.enabled === false) await mirror.disable(c.store);
        else again.push(c.store);
      }
      if (detectionChanged) await rescan();
      else if (again.length > 0) await rescan(again);
      return settings;
    },
    getOnboarding: () => readOnboarding(env),
    async completeOnboarding(mode) {
      await completeOnboarding(env, mode);
      // A store connected during the first run could not sync before this point (ADR 74).
      // The library goes through the manual floor (ADR 50): reset + complete in a loop must not bypass it. The scan is not floored.
      await sync.schedule({ force: false, trigger: "manual", operations: ["library"] });
      await sync.schedule({ force: true, operations: ["scan"] });
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
