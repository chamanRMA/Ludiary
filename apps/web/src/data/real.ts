import type {
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
} from "@ludiary/api-contract";
import type { GeneralSettings, LudiaryApi, MaintenanceDto, SettingsUpdate } from "./api";
import { ApiError, type Http } from "./http";

/**
 * Real client (ADR 72 points 6 and 7, answer B).
 *
 * Served by the local server: library, game sheet, launch, sync and scan, store status, first run,
 * detection mode, language and scan roots.
 *
 * Delegated to `sim`, method by method, and never stored in the server: wizards and `disconnect`,
 * `getServices`, collections, backups, log export, `simulateExpiredSession`, and the settings the
 * server does not have (`autostart`, `syncOnStart`, and `backups`/`autoUpdate` while the server
 * leaves them out of SettingsDto).
 *
 * Mixed methods: `getStores`, `getSettings`, `updateSettings` and `getMaintenance` (see each one).
 */
export function createRealApi(http: Http, sim: LudiaryApi): LudiaryApi {
  const enc = encodeURIComponent;

  async function getStores(): Promise<readonly StoreStatusDto[]> {
    const real = await http.get<readonly StoreStatusDto[]>("/api/stores");
    // A simulated wizard can leave a store "connected" or "expired" in the simulator. Show that on top of the
    // real status (connection, mode, account label) so the screens behave as they did before the server existed.
    // The real sync state wins, except that a simulated "expired" error replaces the library entry.
    const simulated = new Map((await sim.getStores()).map((s) => [s.store, s]));
    return real.map((r): StoreStatusDto => {
      const s = simulated.get(r.store);
      if (!s || (s.connection !== "connected" && s.connection !== "expired")) return r;
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

  return {
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
    launchGame: (id, propertyId) => {
      const body: LaunchRequestDto = propertyId === undefined ? {} : { propertyId };
      return http.post<LaunchResponseDto>(`/api/games/${enc(id)}/launch`, body);
    },
    getMaintenance,

    // ---- Simulated (point B): same behavior as before, nothing is stored in the server
    getServices: () => sim.getServices(),
    startWizard: (t) => sim.startWizard(t),
    submitWizard: (t, input) => sim.submitWizard(t, input),
    cancelWizard: (t) => sim.cancelWizard(t),
    disconnect: (t) => sim.disconnect(t),
    getCollections: () => sim.getCollections(),
    createBackup: () => sim.createBackup(),
    exportLogs: () => sim.exportLogs(),
    simulateExpiredSession: (store) => sim.simulateExpiredSession(store),
  };
}
