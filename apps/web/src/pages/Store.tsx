import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "../app/Link";
import { STORE_BRAND, isStoreId } from "../app/stores";
import { api } from "../data/api";
import { mutate, useQuery } from "../data/hooks";
import { filterGames } from "../data/library";
import { cx, FilterChip, PageTitle, relativeTime, StoreBadge } from "../components/bits";
import { ConnectWizard } from "../components/ConnectWizard";
import { GameGrid } from "../components/GameCard";
import { Icon } from "../components/Icon";
import ui from "../styles/ui.module.css";
import { NotFound } from "./NotFound";

type View = "all" | "installed" | "notInstalled" | "favorites";

export function Store({ id }: { id: string }) {
  const { t, i18n } = useTranslation();
  const library = useQuery(() => api.getLibrary());
  const stores = useQuery(() => api.getStores());
  const [view, setView] = useState<View>("all");
  const [reconnecting, setReconnecting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  if (!isStoreId(id)) return <NotFound />;
  const status = stores?.find((s) => s.store === id);
  if (!library || !status) return null;

  const name = STORE_BRAND[id].name;
  const all = filterGames(library, { store: id });
  const shown = filterGames(all, { ...(view === "installed" ? { installed: true } : view === "notInstalled" ? { installed: false } : {}), favorite: view === "favorites" });
  const expired = status.connection === "expired";
  const last = status.sync[0]?.lastSuccessAt;
  const hours = Math.round(all.reduce((s, g) => s + g.playtimeMinutes, 0) / 60);
  const canSync = status.connection === "connected" || status.connection === "not-applicable";

  return (
    <div className={ui.stack}>
      <section className={ui.pageHead}>
        <StoreBadge store={id} size="lg" warning={expired} />
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6, minWidth: 220 }}>
          <span className={ui.eyebrow}>{t("store.platform")}</span>
          <PageTitle>{name}</PageTitle>
          <p className={ui.muted}>
            {status.connection === "connected" && (status.accountLabel ? t("stores.status.connectedAs", { account: status.accountLabel }) : t("stores.status.connected"))}
            {expired && t("stores.status.expired")}
            {status.connection === "disconnected" && t("stores.status.disconnected")}
            {status.connection === "not-applicable" && t("stores.status.detected")}
            {last ? ` · ${t("store.lastSync", { when: relativeTime(last, i18n.language) })}` : ""}
          </p>
          {status.access === "unofficial-api" && (
            <p className={ui.muted} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
              <Icon name="info" size={18} />
              {t("stores.unofficial.tip", { store: name })}
            </p>
          )}
        </div>
        <div className={ui.chips}>
          {expired ? (
            <button type="button" className={cx(ui.btn, ui.primary)} onClick={() => setReconnecting(true)}>{t("common.reconnect")}</button>
          ) : (
            <button type="button" className={cx(ui.btn, ui.primary)} disabled={!canSync || syncing} onClick={() => { setSyncing(true); void mutate(api.syncAll()).finally(() => setSyncing(false)); }}>
              <Icon name="refresh" size={18} />
              {t("store.sync", { store: name })}
            </button>
          )}
          <Link to="/settings/stores" className={ui.btn}>{t("store.manage")}</Link>
        </div>
      </section>

      {expired && (
        <section className={ui.alert} role="status">
          <div>
            <b>{t("store.expiredTitle", { store: name })}</b>
            <span className={ui.muted}>{t("store.expiredBody", { store: name, count: all.length })}</span>
          </div>
        </section>
      )}
      {reconnecting && <ConnectWizard target={{ kind: "store", store: id }} onDone={() => setReconnecting(false)} onCancel={() => setReconnecting(false)} />}

      <div className={ui.stats}>
        <div><b>{all.length}</b>{t("home.games")}</div>
        <div><b>{all.filter((g) => g.installed).length}</b>{t("common.installedPlural")}</div>
        <div><b>{t("common.hoursShort", { n: hours })}</b>{t("home.played")}</div>
      </div>

      <div role="group" aria-label={t("library.filterInstall")} className={ui.chips}>
        <FilterChip active={view === "all"} onClick={() => setView("all")}>{t("library.all")}</FilterChip>
        <FilterChip active={view === "installed"} onClick={() => setView("installed")}>{t("common.installedPlural")}</FilterChip>
        <FilterChip active={view === "notInstalled"} onClick={() => setView("notInstalled")}>{t("common.notInstalledPlural")}</FilterChip>
        <FilterChip active={view === "favorites"} onClick={() => setView("favorites")}>{t("library.favorites")}</FilterChip>
      </div>
      {expired && <p className={ui.muted}>{t("store.staleList")}</p>}
      <GameGrid games={shown} />
    </div>
  );
}
