// Settings, first-run state and scan folders (ADR 42, 69, 72). Plain functions over the persistence ports.
import type { Env } from "./env";
import { CoreError } from "./errors";
import type { DetectionMode, Onboarding, ScanRootRecord, Settings, SettingsPatch } from "./model";

const K_LOCALE = "ui.locale";
const K_DETECTION = "detection.mode";
const K_ONBOARDING = "onboarding.completedAt";
export const LOCALES = ["system", "es", "en"] as const;
export const MODES: readonly DetectionMode[] = ["auto-and-manual", "manual-only", "later"];

const isMode = (v: unknown): v is DetectionMode => typeof v === "string" && (MODES as readonly string[]).includes(v);

export async function readSettings(env: Env): Promise<Settings> {
  const [locale, mode] = await Promise.all([env.deps.settings.get(K_LOCALE), env.deps.settings.get(K_DETECTION)]);
  return {
    locale: (LOCALES as readonly unknown[]).includes(locale) ? (locale as Settings["locale"]) : "system",
    detection: isMode(mode) ? mode : null,
  };
}

/** Validates and stores a patch. Returns the settings and whether the detection mode changed. */
export async function writeSettings(env: Env, patch: SettingsPatch): Promise<{ settings: Settings; detectionChanged: boolean }> {
  if (patch === null || typeof patch !== "object") throw new CoreError("invalid-input", "Settings patch must be an object");
  if (patch.locale !== undefined && !(LOCALES as readonly unknown[]).includes(patch.locale)) {
    throw new CoreError("invalid-input", "Unknown locale");
  }
  if (patch.detection !== undefined && patch.detection !== null && !isMode(patch.detection)) {
    throw new CoreError("invalid-input", "Unknown detection mode");
  }
  const before = await readSettings(env);
  if (patch.locale !== undefined) await env.deps.settings.set(K_LOCALE, patch.locale);
  if (patch.detection !== undefined) {
    if (patch.detection === null) await env.deps.settings.delete(K_DETECTION);
    else await env.deps.settings.set(K_DETECTION, patch.detection);
  }
  const settings = await readSettings(env);
  return { settings, detectionChanged: settings.detection !== before.detection };
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
