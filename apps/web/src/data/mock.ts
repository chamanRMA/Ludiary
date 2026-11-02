import type {
  DetectionMode,
  GameDetailDto,
  GameSummaryDto,
  OnboardingDto,
  ScanRootDto,
  ServiceId,
  ServiceStatusDto,
  StoreId,
  StoreStatusDto,
  WizardFieldDto,
  WizardInputDto,
  WizardResponseDto,
  WizardStepDto,
  WizardTarget,
} from "@ludiary/api-contract";
import type { CollectionDto, GeneralSettings, LudiaryApi, MaintenanceDto } from "./api";
import { validateField } from "./validate";

/** Where the simulator keeps the few non-secret values ADR 69 allows (first run, language). */
export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

function browserStorage(): KeyValueStorage {
  try {
    if (typeof localStorage !== "undefined") return localStorage;
  } catch {
    /* storage blocked */
  }
  const memory = new Map<string, string>();
  return { getItem: (k) => memory.get(k) ?? null, setItem: (k, v) => void memory.set(k, v) };
}

// --- Wizard definitions (simulated connector texts live under connectors.<id>.*) ---------------

const field = (name: string, labelKey: string, pattern: string, maxLength: number, extra: Partial<WizardFieldDto> = {}): WizardFieldDto => ({
  name,
  labelKey,
  secret: true,
  pattern,
  maxLength,
  paste: true,
  ...extra,
});

// GOG and Epic login URLs are the ones used by gogdl and legendary: UNVERIFIED assumption (ADR 43), the real connector owns them.
const GOG_LOGIN =
  "https://auth.gog.com/auth?client_id=46899977096215655&redirect_uri=https%3A%2F%2Fembed.gog.com%2Fon_login_success%3Forigin%3Dclient&response_type=code&layout=client2";
const EPIC_LOGIN = "https://www.epicgames.com/id/login";

const STEPS: Record<string, readonly WizardStepDto[]> = {
  steam: [
    { kind: "info", id: "choose", titleKey: "connectors.steam.choose.title", bodyKey: "connectors.steam.choose.body" },
    { kind: "open-external", id: "login", titleKey: "connectors.steam.login.title", bodyKey: "connectors.steam.login.body", url: "https://steamcommunity.com/openid/login", awaits: "callback" },
    {
      kind: "open-external",
      id: "apikey",
      titleKey: "connectors.steam.apikey.title",
      bodyKey: "connectors.steam.apikey.body",
      url: "https://steamcommunity.com/dev/apikey",
      awaits: "input",
      fields: [field("apiKey", "connectors.steam.apikey.field", "^[0-9A-Fa-f]{32}$", 40)],
    },
    { kind: "info", id: "profile", titleKey: "connectors.steam.profile.title", bodyKey: "connectors.steam.profile.body" },
  ],
  gog: [
    {
      kind: "open-external",
      id: "login",
      titleKey: "connectors.gog.login.title",
      bodyKey: "connectors.gog.login.body",
      url: GOG_LOGIN,
      awaits: "input",
      fields: [field("redirectUrl", "connectors.gog.login.field", "^[A-Za-z0-9_-]{10,512}$", 2048, { extract: "url-query:code" })],
    },
  ],
  epic: [
    {
      kind: "open-external",
      id: "login",
      titleKey: "connectors.epic.login.title",
      bodyKey: "connectors.epic.login.body",
      url: EPIC_LOGIN,
      awaits: "input",
      fields: [field("authorizationCode", "connectors.epic.login.field", "^[0-9a-f]{32}$", 4096, { extract: "json-field:authorizationCode" })],
    },
  ],
  ubisoft: [
    { kind: "embedded-login", id: "login", titleKey: "connectors.ubisoft.login.title", bodyKey: "connectors.ubisoft.login.body" },
  ],
  ea: [
    { kind: "embedded-login", id: "login", titleKey: "connectors.ea.login.title", bodyKey: "connectors.ea.login.body" },
  ],
  rawg: [
    {
      kind: "open-external",
      id: "key",
      titleKey: "connectors.rawg.key.title",
      bodyKey: "connectors.rawg.key.body",
      url: "https://rawg.io/login/?forward=developer",
      awaits: "input",
      fields: [field("apiKey", "connectors.rawg.key.field", "^[A-Za-z0-9]{16,64}$", 80)],
    },
  ],
  igdb: [
    {
      kind: "open-external",
      id: "key",
      titleKey: "connectors.igdb.key.title",
      bodyKey: "connectors.igdb.key.body",
      url: "https://dev.twitch.tv/console/apps/create",
      awaits: "input",
      fields: [
        field("clientId", "connectors.igdb.key.clientId", "^[A-Za-z0-9]{20,64}$", 80),
        field("clientSecret", "connectors.igdb.key.clientSecret", "^[A-Za-z0-9]{20,64}$", 80),
      ],
    },
  ],
};

const targetId = (t: WizardTarget): string => (t.kind === "store" ? t.store : t.service);
const ACCOUNT_LABELS: Record<string, string> = { steam: "demo_steam", gog: "demo_gog", epic: "demo_epic", ubisoft: "demo_ubisoft", ea: "demo_ea" };

// --- Seed data -----------------------------------------------------------------------------------

type Seed = [id: string, title: string, stores: StoreId[], installed: boolean, hours: number, lastDaysAgo: number | null, favorite: boolean, tags: string[]];
const SEED: Seed[] = [
  ["elden-ring", "Elden Ring", ["steam"], true, 142, 0.08, true, ["rpg"]],
  ["horizon", "Horizon Zero Dawn", ["steam", "gog"], true, 86, 4, false, ["open-world"]],
  ["rimworld", "RimWorld", ["steam"], true, 210, 2, true, ["sim"]],
  ["stardew", "Stardew Valley", ["steam"], true, 64, 9, false, ["cozy"]],
  ["bg3", "Baldur’s Gate 3", ["gog"], true, 120, 12, true, ["rpg"]],
  ["hogwarts", "Hogwarts Legacy", ["epic"], false, 31, 40, false, []],
  ["hades", "Hades", ["steam"], true, 38, 20, false, ["roguelike"]],
  ["cyberpunk", "Cyberpunk 2077", ["steam"], false, 12, 90, false, []],
  ["portal2", "Portal 2", ["steam"], false, 19, 200, false, []],
  ["hollow-knight", "Hollow Knight", ["steam"], true, 27, 15, false, ["metroidvania"]],
  ["disco", "Disco Elysium", ["steam"], false, 0, null, false, []],
  ["celeste", "Celeste", ["steam"], true, 9, 30, false, ["platformer"]],
  ["fall-guys", "Fall Guys", ["epic"], true, 22, 6, false, []],
  ["fifa", "EA Sports FC 25", ["ea"], true, 40, 3, false, []],
  ["assassins", "Assassin’s Creed Origins", ["ubisoft"], true, 55, 50, false, []],
  ["doom-mod", "Doom", [], true, 18, 70, false, ["classic"]],
  ["dos-classic", "Prince of Persia", [], true, 6, 300, false, ["classic"]],
];

const now = (): number => Date.now();

// Real Steam AppIDs (checked against store.steampowered.com/api/appdetails on 2026-10-21, ADR 71).
const STEAM_APP_IDS: Record<string, number> = {
  "elden-ring": 1245620,
  horizon: 1151640,
  rimworld: 294100,
  stardew: 413150,
  hades: 1145360,
  cyberpunk: 1091500,
  portal2: 620,
  "hollow-knight": 367520,
  disco: 632470,
  celeste: 504230,
};
const steamMedia = (appId: number, file: string): string =>
  `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${appId}/${file}`;

function seedLibrary(): GameSummaryDto[] {
  const t = now();
  return SEED.map(([id, title, stores, installed, hours, ago, favorite, tags]) => {
    // Only games with a Steam property use Steam's art; others never ask Steam for anything (ADR 71, invariant 9).
    const appId = stores.includes("steam") ? STEAM_APP_IDS[id] : undefined;
    return {
    id,
    title,
    ...(appId === undefined ? {} : { coverUrl: steamMedia(appId, "library_600x900.jpg"), coverFallbackUrl: steamMedia(appId, "header.jpg") }),
    stores,
    installed,
    favorite,
    playtimeMinutes: Math.round(hours * 60),
    ...(ago === null ? {} : { lastPlayedAt: t - Math.round(ago * DAY) }),
    tags,
    };
  });
}

// Sample user data (names are what a user would type), not UI text: not translated (invariant 6).
const COLLECTIONS: CollectionDto[] = [
  { id: "col-weekend", name: "Para el finde", gameIds: ["stardew", "rimworld", "horizon", "hogwarts"] },
  { id: "col-pending", name: "Pendientes de terminar", gameIds: ["bg3", "elden-ring", "horizon", "stardew", "cyberpunk", "disco"] },
  { id: "col-friends", name: "Con amigos", gameIds: ["fall-guys", "fifa", "stardew"] },
  { id: "col-short", name: "Juegos cortos", gameIds: ["hades", "celeste", "hollow-knight", "portal2"] },
  { id: "col-classic", name: "Clásicos", gameIds: ["doom-mod", "dos-classic", "portal2"] },
];

const SERVICE_META: Record<ServiceId, Pick<ServiceStatusDto, "purpose" | "available">> = {
  rawg: { purpose: "metadata", available: true },
  igdb: { purpose: "metadata", available: true },
  itad: { purpose: "prices", available: false }, // phase 3 (ADR 69)
};

const STORE_META: Record<StoreId, Pick<StoreStatusDto, "access" | "connection" | "mode">> = {
  steam: { access: "official-api", connection: "disconnected", mode: "library" },
  gog: { access: "unofficial-api", connection: "disconnected", mode: "library" },
  epic: { access: "unofficial-api", connection: "disconnected", mode: "library" },
  ubisoft: { access: "unofficial-api", connection: "disconnected", mode: "library" },
  ea: { access: "unofficial-api", connection: "disconnected", mode: "library" },
};

const ROOTS: ScanRootDto[] = [
  { id: "r1", origin: "discovered", path: "C:\\Program Files (x86)\\Steam", store: "steam", enabled: true },
  { id: "r2", origin: "discovered", path: "C:\\Program Files (x86)\\Ubisoft\\Ubisoft Game Launcher", store: "ubisoft", enabled: true },
  { id: "r3", origin: "discovered", path: "C:\\Program Files\\EA Games", store: "ea", enabled: true },
  { id: "r4", origin: "user", path: "D:\\Juegos", enabled: true },
];

// --- Simulator -----------------------------------------------------------------------------------

/** In-memory simulator of the future API. It validates formats and DISCARDS secret values (ADR 68). */
export function createMockApi(storage: KeyValueStorage = browserStorage()): LudiaryApi {
  const library = seedLibrary();
  const stores = new Map<StoreId, StoreStatusDto>(
    (Object.keys(STORE_META) as StoreId[]).map((store) => [store, { store, ...STORE_META[store], sync: [] }]),
  );
  const services = new Map<ServiceId, ServiceStatusDto>(
    (Object.keys(SERVICE_META) as ServiceId[]).map((service) => [service, { service, ...SERVICE_META[service], configured: false }]),
  );
  const sessions = new Map<string, number>(); // wizard target -> step index. Never holds values.
  const maintenance: MaintenanceDto = { lastBackupAt: null, lastScanAt: now() - HOUR, lastSyncAt: now() - 5 * 60_000 };
  let settings: GeneralSettings = {
    locale: ((v) => (v === "es" || v === "en" ? v : "system"))(storage.getItem("ludiary.locale")),
    detection: null,
    scanRoots: ROOTS.map((r) => ({ ...r })),
    backups: { periodic: true, folder: null },
    autoUpdate: true,
    autostart: false,
    syncOnStart: true,
  };
  let onboarding: OnboardingDto = (() => {
    try {
      const parsed = JSON.parse(storage.getItem("ludiary.onboarding") ?? "null") as OnboardingDto | null;
      if (parsed && typeof parsed === "object" && "completedAt" in parsed) return parsed;
    } catch {
      /* corrupted value: start over */
    }
    return { completedAt: null, detection: null };
  })();
  settings = { ...settings, detection: onboarding.detection };

  const saveOnboarding = (): void => storage.setItem("ludiary.onboarding", JSON.stringify(onboarding));
  const setStore = (id: StoreId, patch: Partial<StoreStatusDto>): void => {
    const current = stores.get(id);
    if (current) stores.set(id, { ...current, ...patch });
  };

  function finish(target: WizardTarget, installedOnly: boolean): WizardResponseDto {
    const id = targetId(target);
    sessions.delete(id);
    const label = ACCOUNT_LABELS[id];
    if (target.kind === "store") {
      setStore(target.store, {
        connection: "connected",
        mode: installedOnly ? "installed-only" : "library",
        sync: [{ operation: "library", state: "idle", lastSuccessAt: now() }],
        ...(label && !installedOnly ? { accountLabel: label } : {}),
      });
      const store = stores.get(target.store);
      if (store && (installedOnly || !label)) delete store.accountLabel;
    } else {
      const current = services.get(target.service);
      if (current) services.set(target.service, { ...current, configured: true });
    }
    return { kind: "done", ...(label && !installedOnly ? { accountLabel: label } : {}) };
  }

  function stepAt(target: WizardTarget, index: number): WizardResponseDto {
    const step = STEPS[targetId(target)]?.[index];
    return step ?? finish(target, false);
  }

  return {
    getStores: async () => [...stores.values()],
    getServices: async () => [...services.values()],

    startWizard: async (target) => {
      sessions.set(targetId(target), 0);
      return stepAt(target, 0);
    },

    submitWizard: async (target, input: WizardInputDto) => {
      const id = targetId(target);
      const index = sessions.get(id) ?? 0;
      const step = STEPS[id]?.[index];
      if (!step) return finish(target, false);
      // Steam "no key" path (ADR 43): choosing it on the first step skips straight to installed-only.
      if (id === "steam" && step.id === "choose" && input.kind === "fields" && input.values["mode"] === "installed-only") {
        return finish(target, true);
      }
      const fields = step.kind === "info" || step.kind === "embedded-login" ? undefined : step.fields;
      if (fields && input.kind === "fields") {
        for (const f of fields) {
          const check = validateField(input.values[f.name] ?? "", f);
          if (!check.ok) {
            return { kind: "rejected", stepId: step.id, error: { code: "invalid-format", key: `connectors.${id}.error.format` } };
          }
          // check.value is dropped here on purpose: the simulator never keeps, logs or returns secrets.
        }
      } else if (fields) {
        return { kind: "rejected", stepId: step.id, error: { code: "missing-fields", key: `connectors.${id}.error.format` } };
      }
      sessions.set(id, index + 1);
      return stepAt(target, index + 1);
    },

    cancelWizard: async (target) => void sessions.delete(targetId(target)),

    disconnect: async (target) => {
      if (target.kind === "store") {
        const meta = STORE_META[target.store];
        stores.set(target.store, { store: target.store, ...meta, sync: [] });
      } else {
        const current = services.get(target.service);
        if (current) services.set(target.service, { ...current, configured: false });
      }
    },

    getOnboarding: async () => ({ ...onboarding }),
    completeOnboarding: async (detection: DetectionMode | null) => {
      onboarding = { completedAt: now(), detection };
      settings = { ...settings, detection };
      saveOnboarding();
    },
    resetOnboarding: async () => {
      onboarding = { completedAt: null, detection: onboarding.detection };
      saveOnboarding();
    },

    getSettings: async () => settings,
    // Simulator: there is no native dialog, so "add folder" adds a sample path (the real client asks the server).
    addScanRoot: async () => {
      const n = settings.scanRoots.filter((r) => r.origin === "user").length + 1;
      const root: ScanRootDto = { id: `user-${now()}`, origin: "user", path: `D:\\Games\\Folder ${n}`, enabled: true };
      settings = { ...settings, scanRoots: [...settings.scanRoots, root] };
      return root;
    },
    setScanRootEnabled: async (id, enabled) => {
      settings = { ...settings, scanRoots: settings.scanRoots.map((r) => (r.id === id ? { ...r, enabled } : r)) };
    },
    removeScanRoot: async (id) => {
      settings = { ...settings, scanRoots: settings.scanRoots.filter((r) => r.id !== id || r.origin !== "user") };
    },
    updateSettings: async (patch) => {
      settings = { ...settings, ...patch };
      if (patch.locale) storage.setItem("ludiary.locale", patch.locale);
      if (patch.detection !== undefined) {
        onboarding = { ...onboarding, detection: patch.detection };
        saveOnboarding();
      }
      return settings;
    },

    getLibrary: async () => library,
    getGame: async (id): Promise<GameDetailDto | null> => {
      const game = library.find((g) => g.id === id);
      if (!game) return null;
      return {
        ...game,
        properties: (game.stores.length === 0 ? (["manual"] as const) : game.stores).map((store) => ({
          id: `${game.id}-${store}`,
          store,
          installed: game.installed,
          ...(game.installed ? { installPath: store === "steam" ? "C:\\Program Files (x86)\\Steam\\steamapps\\common" : "D:\\Juegos" } : {}),
          actions: game.installed ? (["play"] as const) : (["open-store-page", "install"] as const),
        })),
        dlc: id === "elden-ring" ? [{ id: "elden-sote", title: "Shadow of the Erdtree", store: "steam", installed: true }] : id === "bg3" ? [{ id: "bg3-dlc", title: "Digital Deluxe Edition Soundtrack", store: "gog", installed: false }] : [],
        collections: COLLECTIONS.filter((c) => c.gameIds.includes(id)).map(({ id: cid, name }) => ({ id: cid, name })),
      };
    },
    getCollections: async () => COLLECTIONS,

    getMaintenance: async () => ({ ...maintenance }),
    syncAll: async () => {
      maintenance.lastSyncAt = now();
    },
    scan: async () => {
      maintenance.lastScanAt = now();
    },
    // Simulator: starts nothing. The real client asks the server, which starts the store's launcher.
    wizardCallback: async () => null, // the simulator has no OpenID return
    launchGame: async () => ({ status: "started" }),
    revokeSessions: async () => undefined, // the simulator has no sessions
    createBackup: async () => {
      maintenance.lastBackupAt = now();
    },
    exportLogs: async () => undefined,
    simulateExpiredSession: async (store) => {
      setStore(store, {
        connection: "expired",
        sync: [{ operation: "library", state: "error", lastSuccessAt: now() - 3 * DAY, error: { code: "session-expired", key: `connectors.${store}.error.sessionExpired` } }],
      });
    },
  };
}
