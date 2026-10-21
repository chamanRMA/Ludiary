import en from "../locales/en.json";
import es from "../locales/es.json";

export type Locale = "es" | "en";
export type MessageKey = keyof typeof en;

const catalogs: Record<Locale, Record<string, string>> = { en, es };

/** Picks "es" for any Spanish locale, "en" otherwise (ADR 33: only es/en exist). */
export function pickLocale(tag: string | undefined): Locale {
  return tag?.toLowerCase().startsWith("es") ? "es" : "en";
}

export function translate(
  locale: Locale,
  key: MessageKey,
  params: Record<string, string | number> = {},
): string {
  const template = catalogs[locale][key] ?? catalogs.en[key] ?? key;
  return template.replace(/\{(\w+)\}/g, (_, name: string) => String(params[name] ?? `{${name}}`));
}
