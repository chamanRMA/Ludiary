import i18next from "i18next";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "../app/Link";
import { errorText } from "../app/errors";
import { errorKey, isBusy, releaseNotesUrl, showPrompt, updateNotices } from "../app/updates";
import { api } from "../data/api";
import { mutate, refresh, setRestarting, useQuery } from "../data/hooks";
import ui from "../styles/ui.module.css";

/**
 * Above the content of every screen (ADR 90 point 20): the notice of a new signed version with Apply / Later / Ignore (and its
 * progress), and the compact banners of the last update. Renders nothing otherwise.
 */
export function UpdatesNotice() {
  const { t } = useTranslation();
  const status = useQuery(() => api.getUpdates());
  const [applying, setApplying] = useState(false);
  /** Why Apply failed (text). Cleared by any new attempt and when there is no version to talk about. */
  const [failure, setFailure] = useState<string | null>(null);
  /** A failed Later / Ignore / Close, kept apart from the Apply error. */
  const [actionFailed, setActionFailed] = useState(false);

  useEffect(() => {
    if (!applying && !isBusy(status)) return;
    const id = setInterval(refresh, 2000);
    return () => clearInterval(id);
  }, [applying, status?.state]);

  // Apply = download if needed, then restart. It continues from the moment the download ends.
  useEffect(() => {
    if (!applying || !status) return;
    if (status.state === "ready") {
      setApplying(false);
      void api.restartForUpdate().then(setRestarting, (e: unknown) => setFailure(errorText(t, e)));
    } else if (status.state === "failed") {
      setApplying(false);
      setFailure(t(errorKey(status.error, (k) => i18next.exists(k))));
    }
  }, [applying, status?.state]);

  if (!status || status.state === "unsupported") return null;
  const version = status.latest ?? "";
  const failAction = () => setActionFailed(true);
  const apply = (): void => {
    if (!window.confirm(t("updates.restartConfirm", { version }))) return;
    setFailure(null);
    setActionFailed(false);
    if (status.state === "ready") {
      void api.restartForUpdate().then(setRestarting, (e: unknown) => setFailure(errorText(t, e)));
      return;
    }
    setApplying(true);
    void mutate(api.downloadUpdate()).catch((e: unknown) => {
      setApplying(false);
      setFailure(errorText(t, e)); // the code of the response, not a generic text
    });
  };
  const ignore = (): void => {
    if (window.confirm(t("updates.prompt.ignoreConfirm"))) void mutate(api.updateUpdateSettings({ mode: "off" })).catch(failAction);
  };
  const notices = updateNotices(status);
  const ack = () => void mutate(api.updateUpdateSettings({ ack: true })).catch(failAction);
  return (
    <>
      {version !== "" && (showPrompt(status) || applying || failure !== null) && (
        <section role="region" aria-label={t("updates.prompt.title", { version })} style={{ padding: "12px 20px" }}>
          <h2>{t("updates.prompt.title", { version })}</h2>
          <p>{t("updates.prompt.body")}</p>
          <p>
            <a href={releaseNotesUrl(version)} target="_blank" rel="noopener noreferrer">
              {t("updates.notes", { version })}
            </a>
          </p>
          {applying && status.state === "downloading" && <progress max={100} value={status.progress ?? 0} aria-label={t("updates.state.downloading", { version, percent: status.progress ?? 0 })} />}
          {failure !== null && (
            <p className={ui.error} role="alert">
              {failure}
            </p>
          )}
          {!applying && (
            <p>
              <button type="button" className={`${ui.btn} ${ui.primary}`} onClick={apply}>
                {t("updates.prompt.apply")}
              </button>{" "}
              <button type="button" className={ui.btn} onClick={() => void mutate(api.updateUpdateSettings({ later: true })).catch(failAction)}>
                {t("updates.prompt.later")}
              </button>{" "}
              <button type="button" className={ui.btn} onClick={ignore}>
                {t("updates.prompt.ignore")}
              </button>
            </p>
          )}
          <p className={ui.muted}>{t("updates.prompt.ignoreHint")}</p>
        </section>
      )}
      {actionFailed && (
        <p className={ui.error} role="alert" style={{ padding: "6px 20px" }}>
          {t("errors.generic")}
        </p>
      )}
      {notices.map((n) => (
        <div key={n.kind} role="status" style={{ padding: "6px 20px", display: "flex", gap: "12px", alignItems: "center" }}>
          <span>{t(`updates.notice.${n.kind}`, n.params)}</span>
          {n.kind === "updated" && (
            <a href={releaseNotesUrl(n.params["version"] ?? "")} target="_blank" rel="noopener noreferrer">
              {t("updates.notes", { version: n.params["version"] ?? "" })}
            </a>
          )}
          {n.kind === "rolledBack" && <Link to="/settings/privacy">{t("updates.notice.exportLogs")}</Link>}
          <button type="button" className={ui.btn} onClick={ack} aria-label={t("updates.notice.close")}>
            ×
          </button>
        </div>
      ))}
    </>
  );
}
