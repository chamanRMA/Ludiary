import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "../app/Link";
import { navigate } from "../app/router";
import { STORE_BRAND, STORE_IDS } from "../app/stores";
import { recentlySynced, syncWaits } from "../app/storeNotices";
import { setSidebarCompact, useSidebarCompact } from "../app/theme";
import { api } from "../data/api";
import { mutate, refresh, useQuery } from "../data/hooks";
import { cx, relativeTime, StoreBadge } from "./bits";
import { Icon } from "./Icon";
import ui from "../styles/ui.module.css";
import styles from "./layout.module.css";

type NavItem = { to: string; icon: "home" | "library" | "collections" | "prices" | "settings"; label: string; count?: number; soon?: boolean; prefix?: string };

export function Layout({ children }: { children: ReactNode }) {
  const { t, i18n } = useTranslation();
  const compact = useSidebarCompact();
  const [syncing, setSyncing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [waits, setWaits] = useState<ReturnType<typeof syncWaits>>([]);
  const library = useQuery(() => api.getLibrary());
  const stores = useQuery(() => api.getStores());
  const maintenance = useQuery(() => api.getMaintenance());

  // Syncs run in the background on the server: while one runs, poll; when it ends, reload everything once more.
  const running = stores?.some((s) => s.sync.some((x) => x.state === "running")) ?? false;
  const wasRunning = useRef(false);
  useEffect(() => {
    if (running) {
      const timer = setTimeout(refresh, 1500);
      wasRunning.current = true;
      return () => clearTimeout(timer);
    }
    if (wasRunning.current) {
      wasRunning.current = false;
      refresh();
    }
    return undefined;
  }, [running, stores]);

  const count = (store: string): number => library?.filter((g) => g.stores.includes(store as never)).length ?? 0;
  const localCount = library?.filter((g) => g.stores.length === 0).length ?? 0;
  const nav: NavItem[] = [
    { to: "/", icon: "home", label: t("nav.home") },
    { to: "/library", icon: "library", label: t("nav.library"), count: library?.length ?? 0 },
    { to: "/collections", icon: "collections", label: t("nav.collections") },
    { to: "/prices", icon: "prices", label: t("nav.prices"), soon: true },
    { to: "/settings/general", icon: "settings", label: t("nav.settings"), prefix: "/settings" },
  ];
  const expired = stores?.filter((s) => s.connection === "expired") ?? [];

  async function askSync(): Promise<void> {
    try {
      if (recentlySynced(await api.getStores(), Date.now()).length > 0) {
        setConfirming(true);
        return;
      }
    } catch {
      /* without the status, sync anyway: the core keeps the limits */
    }
    await sync();
  }

  async function sync(): Promise<void> {
    setConfirming(false);
    setSyncing(true);
    setWaits([]);
    try {
      await mutate(api.syncAll("manual"));
      setWaits(syncWaits(await api.getStores(), Date.now())); // ADR 50: say when the floor interval lets it sync again
    } catch {
      /* the failure is shown by the 401 notice or by the store status */
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className={styles.app} data-compact={compact}>
      <a className={styles.skip} href="#main">
        {t("nav.skip")}
      </a>
      <header className={styles.top}>
        <Link to="/" className={styles.logo}>
          <span className={styles.mark} aria-hidden="true" />
          {t("app.name")}
        </Link>
        <input
          className={styles.search}
          type="search"
          placeholder={t("nav.searchPlaceholder")}
          aria-label={t("nav.search")}
          onKeyDown={(e) => {
            if (e.key === "Enter") navigate(`/library?q=${encodeURIComponent(e.currentTarget.value.trim())}`);
          }}
        />
        <button type="button" className={styles.pill} onClick={() => void askSync()} disabled={syncing || running} aria-live="polite">
          {syncing || running ? t("nav.syncing") : t("nav.sync")}
        </button>
      </header>

      <nav className={styles.side} aria-label={t("nav.main")}>
        <button type="button" className={cx(styles.item, styles.toggle)} aria-expanded={!compact} onClick={() => setSidebarCompact(!compact)} title={t("nav.toggle")}>
          <Icon name="chevron" />
          <span className={styles.label}>{t("nav.toggle")}</span>
        </button>
        {nav.map((item) => (
          <Link key={item.to} to={item.to} {...(item.prefix ? { activePrefix: item.prefix } : {})} className={styles.item} aria-label={item.soon ? t("nav.soonLabel", { name: item.label }) : item.label} title={item.label}>
            <Icon name={item.icon} />
            <span className={styles.label}>{item.label}</span>
            {item.count !== undefined && <em className={cx(styles.label, styles.count)}>{item.count}</em>}
            {item.soon && <em className={cx(styles.label, styles.count)}>{t("common.soon")}</em>}
          </Link>
        ))}
        <h2 className={styles.heading}>{t("nav.platforms")}</h2>
        {STORE_IDS.map((id) => {
          const isExpired = expired.some((s) => s.store === id);
          const name = STORE_BRAND[id].name;
          return (
            <Link key={id} to={`/store/${id}`} className={styles.item} title={name} aria-label={t(isExpired ? "nav.storeExpired" : "nav.storeLabel", { store: name, count: count(id) })}>
              <StoreBadge store={id} warning={isExpired} />
              <span className={styles.label}>{name}</span>
              <em className={cx(styles.label, styles.count)}>{count(id)}</em>
            </Link>
          );
        })}
        <Link to="/local" className={styles.item} title={t("nav.localTitle")} aria-label={t("nav.localLabel", { count: localCount })}>
          <span className={styles.localBadge} aria-hidden="true">
            <Icon name="local" size={16} />
          </span>
          <span className={styles.label}>{t("nav.local")}</span>
          <em className={cx(styles.label, styles.count)}>{localCount}</em>
        </Link>
        <p className={cx(styles.label, styles.syncInfo)}>
          {maintenance?.lastSyncAt ? t("nav.syncedAgo", { when: relativeTime(maintenance.lastSyncAt, i18n.language) }) : t("nav.neverSynced")}
          {expired.map((s) => (
            <span key={s.store}>
              <br />
              {t("nav.reconnectHint", { store: STORE_BRAND[s.store].name })}
            </span>
          ))}
        </p>
        <p className={cx(styles.label, styles.tagline)}>{t("nav.tagline")}</p>
      </nav>

      <main id="main" className={styles.main}>
        {confirming && (
          <div role="alertdialog" aria-label={t("nav.syncConfirm")} className={styles.syncWait} onKeyDown={(e) => { if (e.key === "Escape") setConfirming(false); }}>
            <p>{t("nav.syncConfirm")}</p>
            <div className={styles.syncButtons}>
              <button type="button" className={cx(ui.btn, ui.primary)} onClick={() => void sync()} autoFocus>
                {t("nav.syncAnyway")}
              </button>
              <button type="button" className={ui.btn} onClick={() => setConfirming(false)}>
                {t("common.cancel")}
              </button>
            </div>
          </div>
        )}
        {waits.length > 0 && (
          <div role="status" className={styles.syncWait}>
            {waits.map((w) => (
              <p key={w.store}>{t("nav.syncWait", { store: STORE_BRAND[w.store].name, time: new Intl.DateTimeFormat(i18n.language, { timeStyle: "short" }).format(w.at) })}</p>
            ))}
          </div>
        )}
        {children}
      </main>
    </div>
  );
}
