import type { UpdateModeDto, UpdateStatusDto } from "@ludiary/api-contract";
import i18next from "i18next";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { errorText } from "../app/errors";
import { UPDATE_MODES, errorKey, isBusy, releaseNotesUrl, statusLine } from "../app/updates";
import { api } from "../data/api";
import { mutate, refresh, setRestarting, useQuery } from "../data/hooks";
import ui from "../styles/ui.module.css";
import styles from "../pages/settings.module.css";
import { relativeTime } from "./bits";

/** The three modes as radio buttons; `notify` is the default and is marked as recommended (ADR 90 point 20). */
export function UpdateModePicker({ value, onPick, name }: { value: UpdateModeDto; onPick(m: UpdateModeDto): void; name: string }) {
  const { t } = useTranslation();
  return (
    <fieldset className={styles.seg}>
      <legend className="sr-only">{t("updates.mode.legend")}</legend>
      {UPDATE_MODES.map((m) => (
        <label key={m}>
          <input type="radio" name={name} checked={value === m} onChange={() => onPick(m)} />
          {t(`updates.mode.${m}`)}
        </label>
      ))}
    </fieldset>
  );
}

/** Settings > About (ADR 90 point 10): version, mode, one status line and the buttons that apply. */
export function UpdatesPanel() {
  const { t, i18n } = useTranslation();
  const status = useQuery(() => api.getUpdates());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isBusy(status)) return;
    const id = setInterval(refresh, 2000);
    return () => clearInterval(id);
  }, [status?.state]);

  if (!status) return null;
  const run = async (action: () => Promise<unknown>): Promise<void> => {
    setError(null);
    try {
      await mutate(action());
    } catch (e) {
      setError(errorText(t, e));
    }
  };
  const line = statusLine(status, status.lastCheckAt ? relativeTime(status.lastCheckAt, i18n.language) : "");
  const version = status.latest ?? "";
  const supported = status.state !== "unsupported";
  return (
    <section aria-labelledby="updates-title">
      <h2 id="updates-title">{t("updates.title")}</h2>
      <div className={ui.row}>
        <div>
          <b>{t("updates.installed")}</b>
          <small>{status.current}</small>
        </div>
        <span />
      </div>
      {supported && (
        <div className={ui.row}>
          <div>
            <b>{t("updates.mode.title")}</b>
            <small>{t("updates.mode.hint")}</small>
          </div>
          <UpdateModePicker name="update-mode" value={status.mode} onPick={(mode) => void run(() => api.updateUpdateSettings({ mode }))} />
        </div>
      )}
      <p role="status" aria-live="polite">
        {t(line.key, line.params)}
        {status.state === "failed" && <> {t(errorKey(status.error, (k) => i18next.exists(k)))}</>}
      </p>
      {status.state === "downloading" && <progress max={100} value={status.progress ?? 0} aria-label={t("updates.state.downloading", { version, percent: status.progress ?? 0 })} />}
      {error && (
        <p className={ui.error} role="alert">
          {error}
        </p>
      )}
      <div className={ui.row}>
        <span />
        <span>
          {supported && (
            <button type="button" className={ui.btn} disabled={isBusy(status)} onClick={() => void run(() => api.checkUpdates())}>
              {t("updates.checkNow")}
            </button>
          )}{" "}
          {status.state === "available" && (
            <button
              type="button"
              className={`${ui.btn} ${ui.primary}`}
              onClick={() => {
                if (status.latestFailedBefore && !window.confirm(t("updates.retryBadConfirm", { version }))) return;
                void run(() => api.downloadUpdate(status.latestFailedBefore === true));
              }}
            >
              {t("updates.download")}
            </button>
          )}{" "}
          {status.state === "ready" && (
            <button
              type="button"
              className={`${ui.btn} ${ui.primary}`}
              onClick={() => {
                if (!window.confirm(t("updates.restartConfirm", { version }))) return;
                void run(async () => {
                  await api.restartForUpdate();
                  setRestarting();
                });
              }}
            >
              {t("updates.restart")}
            </button>
          )}
        </span>
      </div>
      {version && (
        <p>
          <a href={releaseNotesUrl(version)} target="_blank" rel="noopener noreferrer">
            {t("updates.notes", { version })}
          </a>
        </p>
      )}
      <p className={ui.muted}>{t("updates.privacy")}</p>
    </section>
  );
}

export type { UpdateStatusDto };
