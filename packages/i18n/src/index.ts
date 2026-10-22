import en from "../locales/en.json";
import es from "../locales/es.json";
import { connectorCatalogs } from "./connectors";

export type Locale = "es" | "en";
/** Keys of the core, the tray, the API pages and the common connector errors. */
export type MessageKey = keyof typeof en;
/** Keys that connectors provide under `connectors.<id>.*` (ADR 72). */
export type ConnectorMessageKey = keyof typeof connectorCatalogs.en;

// Server-side catalogs: core + each connector's own catalog (one static import per connector, see connectors.ts).
const catalogs: Record<Locale, Record<string, string>> = {
  en: { ...en, ...connectorCatalogs.en },
  es: { ...es, ...connectorCatalogs.es },
};

/** Picks "es" for any Spanish locale, "en" otherwise (ADR 33: only es/en exist). */
export function pickLocale(tag: string | undefined): Locale {
  return tag?.toLowerCase().startsWith("es") ? "es" : "en";
}

/** Falls back to English and then to the key itself, so a missing text is visible but never throws. */
export function translate(
  locale: Locale,
  key: MessageKey | ConnectorMessageKey,
  params: Record<string, string | number> = {},
): string {
  return translateKey(locale, key, params);
}

/** Same, for keys that arrive as plain strings (e.g. from an error raised by the core). */
export function translateKey(locale: Locale, key: string, params: Record<string, string | number> = {}): string {
  const template = catalogs[locale][key] ?? catalogs.en[key] ?? key;
  return template.replace(/\{(\w+)\}/g, (_, name: string) => String(params[name] ?? `{${name}}`));
}
