// Settings, first-run state and scan folders (ADR 42, 69, 72). Plain functions over the persistence ports.
import type { Env } from "./env";
import { CoreError } from "./errors";
import type { StoreId } from "@ludiary/contracts";
import type { DetectionMode, Onboarding, ScanRootRecord, Settings, SettingsPatch, StoreCollectionsSettings } from "./model";

const K_LOCALE = "ui.locale";
const K_DETECTION = "detection.mode";
const K_ONBOARDING = "onboarding.completedAt";
export const LOCALES = ["system", "es", "en"] as const;
export const MODES: readonly DetectionMode[] = ["auto-and-manual", "manual-only", "later"];

const isMode = (v: unknown): v is DetectionMode => typeof v === "string" && (MODES as readonly string[]).includes(v);

/** ADR 88. Settings key of a store's collections step: enabled, unverifiedFavorites, favoritesSeen, mirrorAccountSource. */
export const collectionsKey = (store: StoreId, name: "enabled" | "unverifiedFavorites" | "favoritesSeen" | "mirrorAccountSource"): string => `collections.${store}.${name}`;

/** Stores that have the operation, in registration order. */
const mirrored = (env: Env): StoreId[] => [...env.connectors.values()].filter((c) => c.importCollections !== undefined).map((c) => c.id);

export async function readStoreCollections(env: Env, store: StoreId): Promise<StoreCollectionsSettings> {
  const [enabled, unverified] = await Promise.all([env.deps.settings.get(collectionsKey(store, "enabled")), env.deps.settings.get(collectionsKey(store, "unverifiedFavorites"))]);
  return { enabled: enabled !== false, unverifiedFavorites: unverified === true };
}

export async function readSettings(env: Env): Promise<Settings> {
  const [locale, mode] = await Promise.all([env.deps.settings.get(K_LOCALE), env.deps.settings.get(K_DETECTION)]);
  const storeCollections: Settings["storeCollections"] = {};
  for (const id of mirrored(env)) storeCollections[id] = await readStoreCollections(env, id);
  return {
    locale: (LOCALES as readonly unknown[]).includes(locale) ? (locale as Settings["locale"]) : "system",
    detection: isMode(mode) ? mode : null,
    storeCollections,
    backups: { periodic: (await env.deps.settings.get("backups.periodic")) === true },
  };
}

/** Throws `invalid-input` for anything wrong in the patch, before anything is stored. Returns the per-store entries. */
export function validatePatch(env: Env, patch: SettingsPatch): [StoreId, Partial<StoreCollectionsSettings>][] {
  if (patch === null || typeof patch !== "object") throw new CoreError("invalid-input", "Settings patch must be an object");
  if (patch.locale !== undefined && !(LOCALES as readonly unknown[]).includes(patch.locale)) {
    throw new CoreError("invalid-input", "Unknown locale");
  }
  if (patch.detection !== undefined && patch.detection !== null && !isMode(patch.detection)) {
    throw new CoreError("invalid-input", "Unknown detection mode");
  }
  const wanted = Object.entries(patch.storeCollections ?? {}) as [StoreId, Partial<StoreCollectionsSettings>][];
  if (patch.storeCollections !== undefined && (patch.storeCollections === null || typeof patch.storeCollections !== "object")) throw new CoreError("invalid-input", "storeCollections must be an object");
  for (const [store, v] of wanted) {
    if (!mirrored(env).includes(store)) throw new CoreError("invalid-input", "This store has no collections to mirror");
    if (v === null || typeof v !== "object") throw new CoreError("invalid-input", "Invalid collections settings");
    for (const k of ["enabled", "unverifiedFavorites"] as const) {
      if (v[k] !== undefined && typeof v[k] !== "boolean") throw new CoreError("invalid-input", `${k} must be a boolean`);
    }
  }
  if (patch.backups !== undefined && (patch.backups === null || typeof patch.backups !== "object" || (patch.backups.periodic !== undefined && typeof patch.backups.periodic !== "boolean"))) {
    throw new CoreError("invalid-input", "backups.periodic must be a boolean");
  }
  return wanted;
}

/** Validates and stores a patch. Returns the settings, whether the detection mode changed and the stores whose collections settings changed. */
export async function writeSettings(
  env: Env,
  patch: SettingsPatch,
): Promise<{ settings: Settings; detectionChanged: boolean; collections: { store: StoreId; enabledChanged: boolean; unverifiedChanged: boolean }[] }> {
  const wanted = validatePatch(env, patch);
  const before = await readSettings(env);
  if (patch.locale !== undefined) await env.deps.settings.set(K_LOCALE, patch.locale);
  if (patch.detection !== undefined) {
    if (patch.detection === null) await env.deps.settings.delete(K_DETECTION);
    else await env.deps.settings.set(K_DETECTION, patch.detection);
  }
  for (const [store, v] of wanted) {
    if (v.enabled !== undefined) await env.deps.settings.set(collectionsKey(store, "enabled"), v.enabled);
    if (v.unverifiedFavorites !== undefined) await env.deps.settings.set(collectionsKey(store, "unverifiedFavorites"), v.unverifiedFavorites);
  }
  const settings = await readSettings(env);
  const collections = wanted
    .map(([store]) => ({
      store,
      enabledChanged: settings.storeCollections[store]?.enabled !== before.storeCollections[store]?.enabled,
      unverifiedChanged: settings.storeCollections[store]?.unverifiedFavorites !== before.storeCollections[store]?.unverifiedFavorites,
    }))
    .filter((c) => c.enabledChanged || c.unverifiedChanged);
  return { settings, detectionChanged: settings.detection !== before.detection, collections };
}

export async function readOnboarding(env: Env): Promise<Onboarding> {
  const [at, mode] = await Promise.all([env.deps.settings.get(K_ONBOARDING), env.deps.settings.get(K_DETECTION)]);
  return { completedAt: typeof at === "number" ? at : null, detection: isMode(mode) ? mode : null };
}

export async function completeOnboarding(env: Env, mode: DetectionMode | null): Promise<void> {
  if (mode !== null && !isMode(mode)) throw new CoreError("invalid-input", "Unknown detection mode");
  if (mode === null) await env.deps.settings.delete(K_DETECTION);
  else await env.deps.settings.set(K_DETECTION, mode);
  await env.deps.settings.set(K_ONBOARDING, env.deps.clock.now());
}

export async function resetOnboarding(env: Env): Promise<void> {
  await env.deps.settings.delete(K_ONBOARDING);
}

/** Locale given to connectors. */
export async function effectiveLocale(env: Env): Promise<string> {
  const { locale } = await readSettings(env);
  return locale === "system" ? (env.deps.systemLocale ?? "en") : locale;
}

export async function requireRoot(env: Env, id: string): Promise<ScanRootRecord> {
  if (typeof id !== "string" || id === "") throw new CoreError("invalid-input", "Missing scan root id");
  const root = await env.deps.scanRoots.get(id);
  if (!root) throw new CoreError("not-found", "Scan root not found");
  return root;
}
