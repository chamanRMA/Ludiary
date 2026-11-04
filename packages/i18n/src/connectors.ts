import eaEn from "../../../connectors/ea/locales/en.json";
import eaEs from "../../../connectors/ea/locales/es.json";
import epicEn from "../../../connectors/epic/locales/en.json";
import epicEs from "../../../connectors/epic/locales/es.json";
import gogEn from "../../../connectors/gog/locales/en.json";
import gogEs from "../../../connectors/gog/locales/es.json";
import itadEn from "../../itad/locales/en.json";
import itadEs from "../../itad/locales/es.json";
import steamEn from "../../../connectors/steam/locales/en.json";
import steamEs from "../../../connectors/steam/locales/es.json";
import ubisoftEn from "../../../connectors/ubisoft/locales/en.json";
import ubisoftEs from "../../../connectors/ubisoft/locales/es.json";

/** Connector catalogs (ADR 72): one static JSON import per connector (and per price service, ADR 86), `connectors.<id>.*` keys. */
export const connectorCatalogs = {
  es: { ...steamEs, ...gogEs, ...epicEs, ...ubisoftEs, ...eaEs, ...itadEs },
  en: { ...steamEn, ...gogEn, ...epicEn, ...ubisoftEn, ...eaEn, ...itadEn },
} as const;
