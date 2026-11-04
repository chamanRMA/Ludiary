import coreEn from "../locales/en.json";
import coreEs from "../locales/es.json";
import en from "../locales/web/en.json";
import es from "../locales/web/es.json";
import { connectorCatalogs } from "./connectors";

/** Texts the server returns as keys (errors): the web reuses the server's own, so the two cannot diverge. */
const serverTexts = (core: Record<string, string>): Record<string, string> =>
  Object.fromEntries(Object.entries(core).filter(([k]) => k.startsWith("core.errors.") || k.startsWith("prices.errors.") || k.startsWith("connectors.common.errors.")));

/** Web catalogs (ADR 68): flat keys with an area prefix, `{param}` interpolation, plus the server and connector texts (ADR 74). */
export const webCatalogs = {
  es: { ...serverTexts(coreEs), ...connectorCatalogs.es, ...es },
  en: { ...serverTexts(coreEn), ...connectorCatalogs.en, ...en },
} as const;
