import gogEn from "../../../connectors/gog/locales/en.json";
import gogEs from "../../../connectors/gog/locales/es.json";
import steamEn from "../../../connectors/steam/locales/en.json";
import steamEs from "../../../connectors/steam/locales/es.json";
import ubisoftEn from "../../../connectors/ubisoft/locales/en.json";
import ubisoftEs from "../../../connectors/ubisoft/locales/es.json";

/** Connector catalogs (ADR 72): one static JSON import per connector, `connectors.<id>.*` keys. */
export const connectorCatalogs = {
  es: { ...steamEs, ...gogEs, ...ubisoftEs },
  en: { ...steamEn, ...gogEn, ...ubisoftEn },
} as const;
