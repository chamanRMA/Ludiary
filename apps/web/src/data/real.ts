import type {
  StoreId,
  GameDetailDto,
  GameSummaryDto,
  LaunchRequestDto,
  LaunchResponseDto,
  OnboardingCompleteDto,
  OnboardingDto,
  PickCancelledDto,
  ScanRootDto,
  ScanRootPatchDto,
  SettingsDto,
  SettingsPatchDto,
  StoreStatusDto,
  SyncRequestDto,
  WizardCallbackDto,
  WizardCallbackResponseDto,
  WizardResponseDto,
  WizardStartDto,
  WizardSubmitDto,
  WizardTarget,
} from "@ludiary/api-contract";
import type { GeneralSettings, LudiaryApi, MaintenanceDto, SettingsUpdate } from "./api";
import { ApiError, type Http } from "./http";

/**
 * Real client (ADR 72 points 6 and 7, answer B).
 *
 * Served by the local server: library, game sheet, launch, sync and scan, store status, first run,
 * detection mode, language and scan roots.
 *
 * Store accounts (ADR 74, 77): `startWizard`, `submitWizard`, `cancelWizard`, `disconnect` and `wizardCallback` for the stores
 * in REAL_WIZARD_STORES (Steam, GOG and Epic).
 *
 * Delegated to `sim`, method by method, and never stored in the server: the same wizard methods for the other
 * stores and services, `getServices`, collections, backups, log export, `simulateExpiredSession`, and the settings the
 * server does not have (`autostart`, `syncOnStart`, and `backups`/`autoUpdate` while the server
 * leaves them out of SettingsDto).
 *
 * Mixed methods: `getStores`, `getSettings`, `updateSettings` and `getMaintenance` (see each one).
 */
/** sessionStorage key of the open Steam wizard id: it must survive the trip to steamcommunity.com (ADR 74). */
export const WIZARD_ID_KEY = "ludiary.wizardId.steam";

export interface WizardIdStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function sessionStore(): WizardIdStorage | null {
  try {
    if (typeof sessionStorage !== "undefined") return sessionStorage;
  } catch {
    /* storage blocked: the wizard then lives only in memory and cannot survive the OpenID trip */
  }
  return null;
}

/** Stores whose wizard is served by the real server (ADR 77 point 8). */
export const REAL_WIZARD_STORES: readonly StoreId[] = ["steam", "gog", "epic"];
const realStore = (t: WizardTarget): StoreId | null => (t.kind === "store" && REAL_WIZARD_STORES.includes(t.store) ? t.store : null);
const expired = (): ApiError => new ApiError(404, "not-found", "wizard.expired");

export function createRealApi(http: Http, sim: LudiaryApi, storage: WizardIdStorage | null = sessionStore()): LudiaryApi {
  const enc = encodeURIComponent;

  // Steam wizard (ADR 74). Only the id is kept in sessionStorage (it is an unguessable server-side handle, no Steam data);
  // the current step id stays in memory and is learned again from each answer.
  let wizardId: string | null = null;
  let stepId: string | null = null;
  let wizardStore: StoreId | null = null; // store of the wizard in memory
  const currentId = (): string | null => {
    if (wizardId) return wizardStore === "gog" ? null : wizardId; // a GOG wizard in memory is not Steam's
    try {
      wizardId = storage?.getItem(WIZARD_ID_KEY) ?? null;
    } catch {
      /* ignore */
    }
    return wizardId;
  };
  function forget(): void {
    const keepSteamKey = wizardStore === "gog";
    wizardId = null;
    stepId = null;
    wizardStore = null;
    try {
      if (!keepSteamKey) storage?.removeItem(WIZARD_ID_KEY);
    } catch {
      /* ignore */
    }
  }
  function track(res: WizardResponseDto): WizardResponseDto {
    if (res.kind === "done") forget();
    else if (res.kind !== "rejected") stepId = res.id;
    return res;
  }
  /** A 404 from the wizard routes means the wizard is gone: forget it and tell the user in their language. */
  async function guard<T>(run: () => Promise<T>): Promise<T> {
    try {
      return await run();
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) {
        forget();
        throw expired();
      }
      throw e;
    }
  }

  async function getStores(): Promise<readonly StoreStatusDto[]> {
    const real = await http.get<readonly StoreStatusDto[]>("/api/stores");
    // A simulated wizard can leave a store "connected" or "expired" in the simulator. Show that on top of the
    // real status (connection, mode, account label) so the screens behave as they did before the server existed.
    // The real sync state wins, except that a simulated "expired" error replaces the library entry.
    const simulated = new Map((await sim.getStores()).map((s) => [s.store, s]));
    return real.map((r): StoreStatusDto => {
      const s = simulated.get(r.store);
      if (REAL_WIZARD_STORES.includes(r.store) || !s || (s.connection !== "connected" && s.connection !== "expired")) return r;
      return {
        ...r,
        connection: s.connection,
        mode: s.mode,
        ...(s.accountLabel === undefined ? {} : { accountLabel: s.accountLabel }),
        ...(s.connection === "expired" ? { sync: [...r.sync.filter((x) => x.operation !== "library"), ...s.sync] } : {}),
      };
    });
  }

  async function getSettings(): Promise<GeneralSettings> {
    const [server, local] = await Promise.all([http.get<SettingsDto>("/api/settings"), sim.getSettings()]);
    return {
      locale: server.locale,
      detection: server.detection,
      scanRoots: server.scanRoots,
      // Present in the server answer: use it. Absent (feature not available yet): the simulator's value.
      backups: server.backups ?? local.backups,
      autoUpdate: server.autoUpdate ?? local.autoUpdate,
      autostart: local.autostart,
      syncOnStart: local.syncOnStart,
    };
  }

  async function updateSettings(patch: SettingsUpdate): Promise<GeneralSettings> {
    const { locale, detection, ...rest } = patch;
    const serverPatch: SettingsPatchDto = { ...(locale === undefined ? {} : { locale }), ...(detection === undefined ? {} : { detection }) };
    if (Object.keys(serverPatch).length > 0) await http.patch<SettingsDto>("/api/settings", serverPatch);
    // The server has no field for the rest, so those changes live in the simulator only.
    if (Object.keys(rest).length > 0) await sim.updateSettings(rest);
    return getSettings();
  }

  async function getMaintenance(): Promise<MaintenanceDto> {
    // Backups are simulated. Scan and sync times are real: the simulator's "5 minutes ago" would be a lie.
    const [local, stores] = await Promise.all([sim.getMaintenance(), getStores()]);
    const latest = (operation?: "library" | "scan"): number | null => {
      const times = stores.flatMap((s) => s.sync.filter((x) => operation === undefined || x.operation === operation).map((x) => x.lastSuccessAt ?? 0));
      const max = Math.max(0, ...times);
      return max > 0 ? max : null;
    };
    return { lastBackupAt: local.lastBackupAt, lastScanAt: latest("scan"), lastSyncAt: latest() };
  }

  const api: LudiaryApi = {
    // ---- Served by the server
    getStores,
    getOnboarding: () => http.get<OnboardingDto>("/api/onboarding"),
    completeOnboarding: async (detection) => {
      const body: OnboardingCompleteDto = { detection };
      await http.post("/api/onboarding/complete", body);
    },
    // No body and no Content-Type on purpose: the route has no schema.
    resetOnboarding: async () => void (await http.post("/api/onboarding/reset")),
    getSettings,
    updateSettings,
    addScanRoot: async () => {
      const res = await http.post<ScanRootDto | PickCancelledDto>("/api/scan-roots/pick", {});
      return "cancelled" in res ? null : res;
    },
    setScanRootEnabled: async (id, enabled) => {
      const body: ScanRootPatchDto = { enabled };
      await http.patch<ScanRootDto>(`/api/scan-roots/${enc(id)}`, body);
    },
    removeScanRoot: (id) => http.delete(`/api/scan-roots/${enc(id)}`),
    getLibrary: () => http.get<readonly GameSummaryDto[]>("/api/library"),
    getGame: async (id): Promise<GameDetailDto | null> => {
      try {
        return await http.get<GameDetailDto>(`/api/games/${enc(id)}`);
      } catch (e) {
        if (e instanceof ApiError && e.status === 404) return null;
        throw e;
      }
    },
    syncAll: async (trigger = "manual") => {
      const body: SyncRequestDto = { trigger };
      await http.post("/api/sync", body);
    },
    scan: async () => {
      const body: SyncRequestDto = { trigger: "manual", operations: ["scan"] };
      await http.post("/api/sync", body);
    },
    launchGame: (id, propertyId, action) => {
      const body: LaunchRequestDto = { ...(propertyId === undefined ? {} : { propertyId }), ...(action === undefined ? {} : { action }) };
      return http.post<LaunchResponseDto>(`/api/games/${enc(id)}/launch`, body);
    },
    getMaintenance,

    // ---- Store accounts (ADR 74, 77): wizard and disconnect go to the server; other stores and services stay simulated.
    // Only Steam keeps the id in sessionStorage (its wizard leaves Ludiary and comes back); GOG's lives in memory.
    startWizard: async (t) => {
      const store = realStore(t);
      if (!store) return sim.startWizard(t);
      const res = await http.post<WizardStartDto>(`/api/stores/${store}/wizard`, {});
      wizardId = res.wizardId;
      wizardStore = store;
      if (store === "steam") {
        try {
          storage?.setItem(WIZARD_ID_KEY, res.wizardId);
        } catch {
          /* ignore */
        }
      }
      return track(res.response);
    },
    submitWizard: async (t, input) => {
      const store = realStore(t);
      if (!store) return sim.submitWizard(t, input);
      const id = store === "steam" ? currentId() : wizardStore === store ? wizardId : null;
      if (!id || !stepId) throw expired();
      if (input.kind === "callback") return (await api.wizardCallback(store, input.query)) ?? Promise.reject(expired()); // the route is different
      const body: WizardSubmitDto = { stepId, input };
      return track(await guard(() => http.post<WizardResponseDto>(`/api/wizards/${enc(id)}/submit`, body)));
    },
    cancelWizard: async (t) => {
      const store = realStore(t);
      if (!store) return sim.cancelWizard(t);
      const id = store === "steam" ? currentId() : wizardStore === store ? wizardId : null;
      if (store === "steam" || wizardStore === store) forget(); // never drop another store's wizard
      if (id) await http.delete(`/api/wizards/${enc(id)}`).catch(() => undefined); // 204 even when gone; best effort
    },
    disconnect: async (t) => {
      const store = realStore(t);
      if (!store) return sim.disconnect(t);
      await http.delete(`/api/stores/${store}/connection`);
    },
    wizardCallback: async (store, query) => {
      const id = currentId();
      if (store !== "steam" || !id) return null;
      const body: WizardCallbackDto = { query };
      const res = await guard(() => http.post<WizardCallbackResponseDto>(`/api/wizards/${enc(id)}/callback`, body));
      return track(res.response);
    },

    // ---- Simulated (point B): same behavior as before, nothing is stored in the server
    getServices: () => sim.getServices(),
    getCollections: () => sim.getCollections(),
    createBackup: () => sim.createBackup(),
    exportLogs: () => sim.exportLogs(),
    simulateExpiredSession: (store) => sim.simulateExpiredSession(store),
  };
  return api;
}
