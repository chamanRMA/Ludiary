import type { GameSummaryDto } from "@ludiary/api-contract";

import { useTranslation } from "react-i18next";
import { Link } from "../app/Link";
import { STORE_BRAND } from "../app/stores";
import { useLaunch } from "../app/useLaunch";
import ui from "../styles/ui.module.css";
import { isUnsynced, primaryAction } from "../data/library";
import { cx, Cover, formatHours } from "./bits";

/** Main action button of a game (Play / install / open in store) plus its launch message; shared by library cards and Home. */
export function GameAction({ game }: { game: GameSummaryDto }) {
  const { t } = useTranslation();
  const { launching, message, setMessage, play } = useLaunch();
  const store = game.stores[0];
  const storeName = store ? STORE_BRAND[store].name : "";
  const action = primaryAction(game);
  return (
    <>
      {action === "install" ? (
        <button type="button" className={cx(ui.btn, ui.primary)} disabled={launching} onClick={() => void play(game.id, game.title, storeName, undefined, "install")}>
          {t("library.action.install")}
        </button>
      ) : action === "play" ? (
        <button type="button" className={cx(ui.btn, ui.primary)} disabled={launching} onClick={() => void play(game.id, game.title, storeName)}>
          {t("common.play")}
        </button>
      ) : (
        <button type="button" className={ui.btn} onClick={() => setMessage({ text: t("game.openStoreSimulated", { store: storeName }), error: false })}>
          {t("common.openInStore", { store: storeName })}
        </button>
      )}
      {message && (
        <small role={message.error ? "alert" : "status"} className={ui.muted}>
          {message.text}
        </small>
      )}
    </>
  );
}

/** Main action per game (CLAUDE.md): Play if installed, otherwise open the store page (still simulated). */
export function GameCard({ game }: { game: GameSummaryDto }) {
  const { t } = useTranslation();
  return (
    <li className={ui.card}>
      <Link to={`/game/${game.id}`} className={ui.coverLink} aria-label={t("library.openSheet", { title: game.title })}>
        <Cover game={game} />
      </Link>
      <Link to={`/game/${game.id}`} className={ui.title} title={game.title}>
        {game.title}
      </Link>
      <span className={ui.chips}>
        {game.stores.map((s) => (
          <span key={s} className={ui.chip}>
            <i className={ui.dot} style={{ background: STORE_BRAND[s].color }} />
            {STORE_BRAND[s].name}
          </span>
        ))}
        {game.stores.length === 0 && <span className={ui.chip}>{t("local.chip")}</span>}
      </span>
      <span className={ui.cardMeta}>
        {formatHours(game.playtimeMinutes, t)}
        <span className={cx(ui.chip, game.installed && ui.ok)}>{game.installed ? t("common.installed") : t("common.notInstalled")}</span>
      </span>
      {isUnsynced(game) && <small className={ui.muted}>{t("library.unsynced")}</small>}
      <GameAction game={game} />
    </li>
  );
}

export function GameGrid({ games }: { games: readonly GameSummaryDto[] }) {
  const { t } = useTranslation();
  if (games.length === 0) return <p className={ui.muted}>{t("library.empty")}</p>;
  return (
    <ul className={ui.grid} style={{ listStyle: "none", margin: 0, padding: 0 }}>
      {games.map((g) => (
        <GameCard key={g.id} game={g} />
      ))}
    </ul>
  );
}
