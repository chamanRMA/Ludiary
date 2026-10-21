import type { GameSummaryDto } from "@ludiary/api-contract";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "../app/Link";
import { STORE_BRAND } from "../app/stores";
import ui from "../styles/ui.module.css";
import { cx, Cover, formatHours } from "./bits";

/** Main action per game (CLAUDE.md): Play if installed, otherwise open the store page. Simulated here. */
export function GameCard({ game }: { game: GameSummaryDto }) {
  const { t } = useTranslation();
  const [message, setMessage] = useState<string | null>(null);
  const store = game.stores[0];
  const storeName = store ? STORE_BRAND[store].name : "";
  return (
    <li className={ui.card}>
      <Link to={`/game/${game.id}`} className={ui.coverLink} aria-label={t("library.openSheet", { title: game.title })}>
        <Cover game={game} />
      </Link>
      <Link to={`/game/${game.id}`} className={ui.title}>
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
      {game.installed ? (
        <button type="button" className={cx(ui.btn, ui.primary)} onClick={() => setMessage(t("game.playSimulated", { title: game.title }))}>
          {t("common.play")}
        </button>
      ) : (
        <button type="button" className={ui.btn} onClick={() => setMessage(t("game.openStoreSimulated", { store: storeName }))}>
          {t("common.openInStore", { store: storeName })}
        </button>
      )}
      {message && <small role="status" className={ui.muted}>{message}</small>}
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
