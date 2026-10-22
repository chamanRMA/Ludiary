import { webCatalogs } from "@ludiary/i18n/web";
import i18next from "i18next";
import { initReactI18next } from "react-i18next";

export type UiLocale = "es" | "en";

/** Same rule as the server (ADR 33): any Spanish locale is es, everything else en. */
const pickLocale = (tag: string): UiLocale => (tag.toLowerCase().startsWith("es") ? "es" : "en");

/** ADR 68: flat keys, `{param}` interpolation, same syntax as the server catalogs. */
export async function initI18n(chosen: "system" | UiLocale): Promise<void> {
  const lng = chosen === "system" ? pickLocale(navigator.language) : chosen;
  await i18next.use(initReactI18next).init({
    lng,
    fallbackLng: "en",
    resources: { es: { translation: webCatalogs.es }, en: { translation: webCatalogs.en } },
    keySeparator: false,
    nsSeparator: false,
    interpolation: { prefix: "{", suffix: "}", escapeValue: false },
    returnNull: false,
  });
  document.documentElement.lang = lng;
}

export async function changeLocale(chosen: "system" | UiLocale): Promise<void> {
  const lng = chosen === "system" ? pickLocale(navigator.language) : chosen;
  await i18next.changeLanguage(lng);
  document.documentElement.lang = lng;
}
