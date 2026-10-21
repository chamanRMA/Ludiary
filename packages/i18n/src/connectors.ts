import steamEn from "../../../connectors/steam/locales/en.json";
import steamEs from "../../../connectors/steam/locales/es.json";

/** Connector catalogs (ADR 72): one static JSON import per connector, `connectors.<id>.*` keys. */
export const connectorCatalogs = {
  es: { ...steamEs },
  en: { ...steamEn },
} as const;
