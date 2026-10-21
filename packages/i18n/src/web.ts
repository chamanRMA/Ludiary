import en from "../locales/web/en.json";
import es from "../locales/web/es.json";

/** Web catalogs (ADR 68): flat keys with an area prefix, `{param}` interpolation. */
export const webCatalogs = { es, en } as const;
