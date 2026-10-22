
import type { StoreId } from "@ludiary/api-contract";
import { useTranslation } from "react-i18next";
import { Link } from "../app/Link";
import { STORE_BRAND } from "../app/stores";
import { useLaunch } from "../app/useLaunch";
import { api } from "../data/api";
import { useQuery } from "../data/hooks";
import { isUnsynced, primaryAction } from "../data/library";
import { cx, Cover, formatHours, PageTitle, relativeTime } from "../components/bits";
import ui from "../styles/ui.module.css";
import { NotFound } from "./NotFound";

export function Game({ id }: { id: string }) {
  const { t, i18n } = useTranslation();
  const game = useQuery(() => api.getGame(id), [id]);
  const { launching, message, setMessage, play } = useLaunch();
  if (game === undefined) return null;
  if (game === null) return <NotFound />;

  const primary = game.properties.find((p) => p.installed) ?? game.properties[0];
  const action = primaryAction(game);
  const installable = game.properties.find((p) => !p.installed && p.actions.includes("install"));
  const storeName = primary && primary.store !== "manual" ? STORE_BRAND[primary.store].name : "";

  return (
    <div className={ui.stack}>
      <section className={ui.pageHead}>
        <div style={{ width: 220 }}>
          <Cover game={game} height={300} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, flex: 1, minWidth: 240 }}>
          <PageTitle>{game.title}</PageTitle>
          <div className={ui.chips}>
            {game.properties.map((p) => (
              <span key={p.id} className={ui.chip}>
                {p.store === "manual" ? t("local.chip") : STORE_BRAND[p.store].name}
              </span>
            ))}
            <span className={cx(ui.chip, game.installed && ui.ok)}>{game.installed ? t("common.installed") : t("common.notInstalled")}</span>
            {game.favorite && <span className={ui.chip}>{t("game.favorite")}</span>}
          </div>
          <div className={ui.chips}>
            {action === "install" ? (
              <button type="button" className={cx(ui.btn, ui.primary)} disabled={launching} onClick={() => void play(game.id, game.title, installable ? STORE_BRAND[installable.store as StoreId].name : storeName, installable?.id, "install")}>
                {t("library.action.install")}
              </button>
            ) : action === "play" ? (
              <button type="button" className={cx(ui.btn, ui.primary)} disabled={launching} onClick={() => void play(game.id, game.title, storeName, primary?.installed ? primary.id : undefined)}>
                {t("common.play")}
              </button>
            ) : (
              <button type="button" className={ui.btn} onClick={() => setMessage({ text: t("game.openStoreSimulated", { store: storeName }), error: false })}>
                {t("common.openInStore", { store: storeName })}
              </button>
            )}
          </div>
          {isUnsynced(game) && <p className={ui.muted} role="status">{t("library.unsynced")}</p>}
          {message && (
            <p role={message.error ? "alert" : "status"} className={message.error ? ui.error : ui.muted}>
              {message.text}
            </p>
          )}
          <dl style={{ display: "flex", gap: 40, margin: "12px 0 0", paddingTop: 16, borderTop: "1px solid var(--ln)" }}>
            <div>
              <dt className={ui.muted}>{t("game.playtime")}</dt>
              <dd style={{ margin: 0, font: "600 26px var(--font-display)" }}>{formatHours(game.playtimeMinutes, t)}</dd>
            </div>
            <div>
              <dt className={ui.muted}>{t("game.lastPlayed")}</dt>
              <dd style={{ margin: 0, font: "600 26px var(--font-display)" }}>{game.lastPlayedAt ? relativeTime(game.lastPlayedAt, i18n.language) : t("common.neverPlayed")}</dd>
            </div>
          </dl>
        </div>
      </section>

      <section className={ui.panel} aria-labelledby="g-props">
        <h2 id="g-props">{t("game.properties")}</h2>
        {game.properties.map((p) => (
          <div key={p.id} className={ui.row}>
            <div>
              <b>{p.store === "manual" ? t("local.chip") : STORE_BRAND[p.store].name}</b>
              <small className={ui.path}>{p.installPath ?? t("common.notInstalled")}</small>
            </div>
            <span className={cx(ui.chip, p.installed && ui.ok)}>{p.installed ? t("common.installed") : t("common.notInstalled")}</span>
          </div>
        ))}
      </section>

      {game.dlc.length > 0 && (
        <section className={ui.panel} aria-labelledby="g-dlc">
          <h2 id="g-dlc">{t("game.dlc")}</h2>
          <ul style={{ margin: 0, paddingLeft: 20 }}>
            {game.dlc.map((d) => (
              <li key={d.id}>{d.title}</li>
            ))}
          </ul>
        </section>
      )}

      <section className={ui.panel} aria-labelledby="g-tags">
        <h2 id="g-tags">{t("game.organize")}</h2>
        <div className={ui.chips}>
          {game.tags.map((tag) => <span key={tag} className={ui.chip}>{tag}</span>)}
          {game.collections.map((c) => <Link key={c.id} to="/collections" className={ui.chip}>{c.name}</Link>)}
          {game.tags.length + game.collections.length === 0 && <span className={ui.muted}>{t("game.noTags")}</span>}
        </div>
      </section>
    </div>
  );
}
