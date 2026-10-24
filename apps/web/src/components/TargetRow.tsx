import type { ServiceStatusDto, StoreStatusDto } from "@ludiary/api-contract";
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { errorText } from "../app/errors";
import { STORE_BRAND } from "../app/stores";
import { api } from "../data/api";
import { mutate } from "../data/hooks";
import ui from "../styles/ui.module.css";
import { cx, StoreBadge } from "./bits";
import { ConnectWizard } from "./ConnectWizard";
import { Icon } from "./Icon";
import { StoreNotices } from "./StoreNotices";
import styles from "./wizard.module.css";

const SERVICE_NAMES = { rawg: "RAWG", igdb: "IGDB", itad: "IsThereAnyDeal" } as const;

type Props = { store: StoreStatusDto; service?: never } | { service: ServiceStatusDto; store?: never };

/** One store or service with its status and its connection wizard. Used by Settings and by the first-run wizard (ADR 69). */
export function TargetRow(props: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [disconnectError, setDisconnectError] = useState<string | null>(null);
  const tipId = useId();
  const target = props.store ? ({ kind: "store", store: props.store.store } as const) : ({ kind: "service", service: props.service.service } as const);
  const id = props.store ? props.store.store : props.service.service;
  const name = props.store ? STORE_BRAND[props.store.store].name : SERVICE_NAMES[props.service.service];

  let chip: { text: string; tone?: "ok" | "warn" };
  let connected = false;
  let canConnect = true;
  if (props.store) {
    const s = props.store;
    connected = s.connection === "connected" || s.connection === "expired";
    canConnect = s.connection !== "not-applicable";
    chip =
      s.connection === "not-applicable"
        ? { text: t("stores.status.detected") }
        : s.connection === "expired"
          ? { text: t("stores.status.expired"), tone: "warn" }
          : s.connection === "connected"
            ? s.mode === "installed-only"
              ? { text: t("stores.status.installedOnly"), tone: "ok" }
              : { text: s.accountLabel ? t("stores.status.connectedAs", { account: s.accountLabel }) : t("stores.status.connected"), tone: "ok" }
            : { text: t("stores.status.disconnected") };
  } else {
    const s = props.service;
    connected = s.configured;
    canConnect = s.available;
    chip = !s.available
      ? { text: t("common.comingSoon") }
      : s.configured
        ? { text: t("services.status.configured"), tone: "ok" }
        : { text: t("services.status.notConfigured") };
  }

  const description = t(props.store ? `stores.${id}.desc` : `services.${id}.desc`);
  const unofficial = props.store?.access === "unofficial-api";
  const expired = props.store?.connection === "expired";

  return (
    <div className={styles.target}>
      <div className={styles.targetHead}>
        <div className={styles.targetInfo}>
          {props.store ? (
            <StoreBadge store={props.store.store} size="md" warning={expired} />
          ) : (
            <span className={cx(ui.badge, ui.badgeMd)} style={{ background: "var(--hi)", color: "var(--tx)" }} aria-hidden="true">
              {name.slice(0, 1)}
            </span>
          )}
          <div>
            <b>
              {name}
              {props.service?.service === "rawg" && <span className={ui.chip}>{t("services.recommended")}</span>}
              {unofficial && (
                <button type="button" className={styles.unofficial} aria-label={t("stores.unofficial.label")} aria-describedby={tipId}>
                  <Icon name="info" size={16} />
                  <span id={tipId} role="tooltip" className={styles.tip}>
                    {t("stores.unofficial.tip", { store: name })}
                  </span>
                </button>
              )}
            </b>
            <small>{description}</small>
          </div>
        </div>
        <span className={cx(ui.chip, chip.tone && ui[chip.tone])}>{chip.text}</span>
        <div className={ui.actions}>
          {canConnect && !open && !confirming && (
            <button type="button" className={cx(ui.btn, ui.small, (!connected || expired) && ui.primary)} onClick={() => setOpen(true)}>
              {expired ? t("common.reconnect") : connected ? t("common.change") : t("common.connect")}
            </button>
          )}
          {canConnect && connected && !open && !confirming && (
            <button type="button" className={cx(ui.btn, ui.small)} onClick={() => { setDisconnectError(null); setConfirming(true); }}>
              {t("common.disconnect")}
            </button>
          )}
        </div>
      </div>
      {props.store && <StoreNotices status={props.store} />}
      {confirming && (
        <div className={styles.wizard} role="group" aria-label={t("stores.disconnect.confirm", { name })}>
          <p>{t("stores.disconnect.confirm", { name })}</p>
          {id === "steam" && <p className={ui.muted}>{t("connectors.steam.disconnect.revokeHint")}</p>}
          {(id === "gog" || id === "epic" || id === "ubisoft" || id === "ea") && <p className={ui.muted}>{t(`connectors.${id}.disconnect.hint`)}</p>}
          {disconnectError && <p role="alert">{disconnectError}</p>}
          <div className={styles.buttons}>
            <button type="button" className={cx(ui.btn, ui.primary)} onClick={() => void mutate(api.disconnect(target)).then(() => setConfirming(false), (e: unknown) => setDisconnectError(errorText(t, e)))}>
              {t("common.disconnect")}
            </button>
            <button type="button" className={ui.btn} onClick={() => setConfirming(false)} autoFocus>
              {t("common.cancel")}
            </button>
          </div>
        </div>
      )}
      {open && <ConnectWizard target={target} onDone={() => setOpen(false)} onCancel={() => setOpen(false)} />}
    </div>
  );
}
