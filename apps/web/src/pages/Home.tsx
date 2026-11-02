import { useTranslation } from "react-i18next";
import { Link } from "../app/Link";
import { api } from "../data/api";
import { useQueryState } from "../data/hooks";
import { cx, Cover, LoadError, PageTitle, relativeTime } from "../components/bits";
import { GameAction, GameGrid } from "../components/GameCard";
import ui from "../styles/ui.module.css";

export function Home() {
  const { t, i18n } = useTranslation();
  const { data: library, error: libraryError } = useQueryState(() => api.getLibrary());
  const { data: stores, error: storesError } = useQueryState(() => api.getStores());
  if (!library || !stores) return <LoadError error={libraryError ?? storesError} />;

  const recent = [...library].filter((g) => g.lastPlayedAt).sort((a, b) => (b.lastPlayedAt ?? 0) - (a.lastPlayedAt ?? 0));
  const hero = recent.find((g) => g.installed);
  const hours = Math.round(library.reduce((sum, g) => sum + g.playtimeMinutes, 0) / 60);
  const connected = stores.filter((s) => s.connection === "connected").length;

  return (
    <div className={ui.stack}>
      <PageTitle>{t("home.title")}</PageTitle>
      {connected === 0 && (
        <section className={ui.alert} aria-label={t("home.connectTitle")}>
          <div>
            <b>{t("home.connectTitle")}</b>
            <span className={ui.muted}>{t("home.connectBody")}</span>
          </div>
          <Link to="/settings/stores" className={cx(ui.btn, ui.primary)}>
            {t("home.connectCta")}
          </Link>
        </section>
      )}
      {hero && (
        <section className={ui.pageHead} aria-labelledby="hero-title">
          <div style={{ width: 150 }}>
            <Link to={`/game/${hero.id}`} className={ui.coverLink} aria-label={t("library.openSheet", { title: hero.title })}>
              <Cover game={hero} height={200} />
            </Link>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, flex: 1 }}>
            <span className={ui.eyebrow}>{t("home.continue")}</span>
            <h2 id="hero-title" style={{ fontSize: 36 }}>{hero.title}</h2>
            <p className={ui.muted}>
              {t("home.lastPlayed", { when: relativeTime(hero.lastPlayedAt ?? 0, i18n.language), hours: Math.round(hero.playtimeMinutes / 60) })}
            </p>
            <div className={ui.chips}>
              <GameAction game={hero} />
            </div>
          </div>
        </section>
      )}
      <div className={ui.stats}>
        <div><b>{library.length}</b>{t("home.games")}</div>
        <div><b>{library.filter((g) => g.installed).length}</b>{t("common.installedPlural")}</div>
        <div><b>{t("common.hoursShort", { n: hours })}</b>{t("home.played")}</div>
        <div><b>{connected}</b>{t("home.platforms")}</div>
      </div>
      <section aria-labelledby="home-lib">
        <div className={ui.sectionHead}>
          <h2 id="home-lib">{t("home.library")}</h2>
          <Link to="/library">{t("home.seeAll")}</Link>
        </div>
        <GameGrid games={recent.slice(0, 5)} />
      </section>
      <section className={cx(ui.panel, ui.dashed)}>
        <span className={ui.chip} style={{ alignSelf: "flex-start" }}>{t("common.comingSoon")}</span>
        <h3>{t("home.pricesTitle")}</h3>
        <p className={ui.muted}>{t("home.pricesBody")}</p>
      </section>
    </div>
  );
}
