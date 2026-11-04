import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "../app/Link";
import { needsChoice, releaseNotesUrl, updateNotices } from "../app/updates";
import { api } from "../data/api";
import { mutate, useQuery } from "../data/hooks";
import ui from "../styles/ui.module.css";
import { UpdateModePicker } from "./UpdatesPanel";

/**
 * Above the content of every screen (ADR 90 points 5 and 10): the one-time card that explains the update check and asks for a
 * mode (nothing is requested from GitHub until the user answers), and the notices of the last update. Renders nothing otherwise.
 */
export function UpdatesNotice() {
  const { t } = useTranslation();
  const status = useQuery(() => api.getUpdates());
  const [failed, setFailed] = useState(false);
  if (!status || status.state === "unsupported") return null;
  const notices = updateNotices(status);
  const ack = () => void mutate(api.updateUpdateSettings({ ack: true })).catch(() => setFailed(true));
  return (
    <>
      {needsChoice(status) && (
        <section role="region" aria-label={t("updates.card.title")} style={{ padding: "12px 20px" }}>
          <h2>{t("updates.card.title")}</h2>
          <p>{t("updates.card.body")}</p>
          <UpdateModePicker name="update-card-mode" value={null} onPick={(mode) => void mutate(api.updateUpdateSettings({ mode, noticeSeen: true })).catch(() => setFailed(true))} />
          <p>
            <button type="button" className={ui.btn} onClick={() => void mutate(api.updateUpdateSettings({ noticeSeen: true })).catch(() => setFailed(true))}>
              {t("updates.card.later")}
            </button>
          </p>
          <p className={ui.muted}>{t("updates.privacy")}</p>
        </section>
      )}
      {notices.map((n) => (
        <div key={n.kind} role="status" style={{ padding: "12px 20px" }}>
          <p>{t(`updates.notice.${n.kind}`, n.params)}</p>
          {n.kind === "updated" && (
            <a href={releaseNotesUrl(n.params["version"] ?? "")} target="_blank" rel="noopener noreferrer">
              {t("updates.notes", { version: n.params["version"] ?? "" })}
            </a>
          )}{" "}
          {n.kind === "rolledBack" && <Link to="/settings/privacy">{t("updates.notice.exportLogs")}</Link>}{" "}
          <button type="button" className={ui.btn} onClick={ack}>
            {t("updates.notice.ok")}
          </button>
        </div>
      ))}
      {failed && (
        <p className={ui.error} role="alert">
          {t("errors.generic")}
        </p>
      )}
    </>
  );
}
