import type { StoreStatusDto } from "@ludiary/api-contract";
import i18next from "i18next";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "../app/Link";
import { STORE_BRAND } from "../app/stores";
import { api } from "../data/api";
import { mutate } from "../data/hooks";
import ui from "../styles/ui.module.css";
import css from "../pages/collections.module.css";
import { cx, relativeTime } from "./bits";

/** Stores whose collections are mirrored (ADR 88). The code never names a store: the server says which ones. */
export const withCollections = (stores: readonly StoreStatusDto[] | undefined) =>
  (stores ?? []).flatMap((s) => (s.collections ? [{ ...s, collections: s.collections }] : []));

type WithCollections = ReturnType<typeof withCollections>[number];

/** ADR 88 point 10: one status line per store with mirrored collections; "sync now" is the existing sync. */
export function CollectionsStatusLine({ status, withSync = true }: { status: WithCollections; withSync?: boolean }) {
  const { t, i18n } = useTranslation();
  const [syncing, setSyncing] = useState(false);
  const store = STORE_BRAND[status.store].name;
  const c = status.collections;
  const fileError = c.error && i18next.exists(c.error.key) ? t(c.error.key, c.error.params ? { ...c.error.params } : {}) : t("errors.generic");
  const needsSettings = c.status === "needs-detection" ? "/settings/folders" : c.status === "off" || c.status === "ambiguous" || c.status === "error" || c.status === "store-missing" ? "/settings/stores" : null;
  return (
    <div className={ui.stack} style={{ gap: 6 }}>
      <div className={ui.chips} style={{ alignItems: "center" }}>
        <span role="status">
          {c.status === "idle" && (c.lastSuccessAt === null ? t("collections.mirror.notYet", { store }) : t("collections.mirror.updated", { store, when: relativeTime(c.lastSuccessAt, i18n.language) }))}
          {c.status === "off" && t("collections.mirror.off", { store })}
          {c.status === "needs-detection" && t("collections.mirror.needsDetection", { store })}
          {c.status === "store-missing" && t("collections.mirror.storeMissing", { store })}
          {c.status === "unavailable" && t("collections.mirror.unavailable", { store })}
          {c.status === "ambiguous" && t("collections.mirror.ambiguous", { store })}
          {c.status === "error" && t("collections.mirror.error", { store, reason: fileError })}
        </span>
        {needsSettings && <Link to={needsSettings}>{t("collections.mirror.goToSettings")}</Link>}
        {withSync && c.status !== "off" && (
          // Not disabled while it works: that would drop the keyboard focus.
          <button type="button" className={cx(ui.btn, ui.small)} onClick={() => { if (!syncing) { setSyncing(true); void mutate(api.syncAll("manual")).finally(() => setSyncing(false)); } }}>
            {syncing ? t("nav.syncing") : t("collections.mirror.syncNow")}
          </button>
        )}
      </div>
      {c.status === "idle" && <small className={ui.muted}>{t("collections.mirror.closeNote", { store })}</small>}
      {c.accountVerified === false && c.status !== "off" && (
        <p role="note" className={css.notice}>
          {t("collections.mirror.unverified", { store })} <Link to="/settings/stores">{t("collections.mirror.goToSettings")}</Link>
        </p>
      )}
      {c.favoritesPending > 0 && c.accountVerified === false && (
        <p role="note" className={css.notice}>
          {t("collections.mirror.pending", { store, count: c.favoritesPending })} <Link to="/settings/stores">{t("collections.mirror.goToSettings")}</Link>
        </p>
      )}
    </div>
  );
}

/** The «De Steam» mark (ADR 88). `source` is the store id of the mirror. */
export function FromStore({ source }: { source: keyof typeof STORE_BRAND }) {
  const { t } = useTranslation();
  return <span className={cx(ui.chip, ui.ok)}>{t("collections.fromStore", { store: STORE_BRAND[source].name })}</span>;
}
