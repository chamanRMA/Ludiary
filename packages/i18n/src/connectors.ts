import epicEn from "../../../connectors/epic/locales/en.json";
import epicEs from "../../../connectors/epic/locales/es.json";
import gogEn from "../../../connectors/gog/locales/en.json";
import gogEs from "../../../connectors/gog/locales/es.json";
import steamEn from "../../../connectors/steam/locales/en.json";
import steamEs from "../../../connectors/steam/locales/es.json";

/** Connector catalogs (ADR 72): one static JSON import per connector, `connectors.<id>.*` keys. */
export const connectorCatalogs = {
  es: { ...steamEs, ...gogEs, ...epicEs },
  en: { ...steamEn, ...gogEn, ...epicEn },
} as const;
