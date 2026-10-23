import type { StoreStatusDto } from "@ludiary/api-contract";
import i18next from "i18next";
import { useTranslation } from "react-i18next";
import { needsAutoDetection, scanWarningKey } from "../app/storeNotices";
import { api } from "../data/api";
import { useQuery } from "../data/hooks";
import ui from "../styles/ui.module.css";

/** Notices under a store: the scan warning (not a failure) and, for Ubisoft, the need for automatic detection (ADR 79). */
export function StoreNotices({ status }: { status: StoreStatusDto }) {
  const { t } = useTranslation();
  const settings = useQuery(() => api.getSettings());
  const key = scanWarningKey(status);
  const notices = [
    key ? t(i18next.exists(key) ? key : "errors.generic") : null,
    needsAutoDetection(status.store, settings === undefined || settings === null ? undefined : settings.detection) ? t("connectors.ubisoft.needsAutoDetection") : null,
  ].filter((x): x is string => x !== null);
  return (
    <>
      {notices.map((text) => (
        <p key={text} role="status" className={ui.muted}>{text}</p>
      ))}
    </>
  );
}
