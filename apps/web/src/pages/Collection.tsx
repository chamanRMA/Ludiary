import { useState } from "react";
import { useTranslation } from "react-i18next";
import { errorText } from "../app/errors";
import { Link } from "../app/Link";
import { navigate } from "../app/router";
import { STORE_BRAND } from "../app/stores";
import { api } from "../data/api";
import { mutate, useQueryState } from "../data/hooks";
import { cx, LoadError, PageTitle } from "../components/bits";
import { FromStore } from "../components/CollectionsStatus";
import { GameCard, GameGrid } from "../components/GameCard";
import { filterGames } from "../data/library";
import css from "./collections.module.css";
import ui from "../styles/ui.module.css";
import { NotFound } from "./NotFound";

/** ADR 85: one collection with its games in the order they were added; rename and delete here, add and remove from the game page. */
export function Collection({ id }: { id: string }) {
  const { t } = useTranslation();
  const { data: collections, error: loadError } = useQueryState(() => api.getCollections());
  const { data: library } = useQueryState(() => api.getLibrary());
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState("");
  const [editing, setEditing] = useState(false);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  if (!collections || !library) return <LoadError error={loadError} />;
  const collection = collections.find((c) => c.id === id);
  if (!collection) return <NotFound />;
  const byId = new Map(library.map((g) => [g.id, g]));
  const games = collection.gameIds.flatMap((gid) => byId.get(gid) ?? []);

  const run = async (action: Promise<unknown>, done?: () => void): Promise<void> => {
    try {
      await mutate(action);
      setError(null);
      done?.();
    } catch (e) {
      setError(errorText(t, e));
    }
  };

  /** Add/remove one game at once through its own collectionIds (ADR 85); controls stay enabled while saving. */
  const toggle = (g: { id: string }, member: boolean): void => {
    const others = collections.filter((c) => c.id !== id && c.gameIds.includes(g.id)).map((c) => c.id);
    const ids = member ? [...others, id] : others;
    void run(api.updateGame(g.id, { collectionIds: ids }));
  };
  const MAX = 50;
  const matches = editing ? filterGames(library, { query }) : [];
  const members = new Set(collection.gameIds);
  const mirror = collection.source; // ADR 88: read-only, it follows the store

  return (
    <div className={ui.stack}>
      <header className={ui.stack}>
        <Link to="/collections">{t("collections.all")}</Link>
        {mirror === null && renaming ? (
          <form
            className={ui.chips}
            onSubmit={(e) => {
              e.preventDefault();
              void run(api.renameCollection(id, name), () => setRenaming(false));
            }}
          >
            <input className={ui.field} value={name} maxLength={200} autoFocus aria-label={t("collections.name")} onChange={(e) => setName(e.target.value)} />
            <button type="submit" className={cx(ui.btn, ui.primary)}>{t("collections.rename")}</button>
            <button type="button" className={ui.btn} onClick={() => { setRenaming(false); setError(null); }}>{t("common.cancel")}</button>
          </form>
        ) : (
          <>
            <PageTitle>{collection.name}</PageTitle>
            {mirror !== null ? (
              <p className={ui.muted}>
                <FromStore source={mirror} /> {t("collections.managedIn", { store: STORE_BRAND[mirror].name })}
              </p>
            ) : (
              <div className={ui.chips}>
                <button type="button" className={cx(ui.btn, editing && ui.pressed)} aria-pressed={editing} onClick={() => setEditing(!editing)}>
                  {editing ? t("collections.editDone") : t("collections.edit")}
                </button>
                <button type="button" className={ui.btn} onClick={() => { setName(collection.name); setRenaming(true); }}>{t("collections.rename")}</button>
                <button
                  type="button"
                  className={ui.btn}
                  onClick={() => {
                    if (window.confirm(t("collections.deleteConfirm", { name: collection.name }))) void run(api.deleteCollection(id), () => navigate("/collections"));
                  }}
                >
                  {t("collections.delete")}
                </button>
              </div>
            )}
          </>
        )}
        {error && <p role="alert" className={ui.error}>{error}</p>}
      </header>
      {editing && mirror === null && (
        <section className={ui.panel} aria-labelledby="c-add">
          <h2 id="c-add">{t("collections.addGames")}</h2>
          <input className={ui.field} type="search" value={query} aria-label={t("collections.searchGames")} onChange={(e) => setQuery(e.target.value)} />
          <ul className={css.pick}>
            {matches.slice(0, MAX).map((g) => (
              <li key={g.id}>
                <label>
                  <input type="checkbox" checked={members.has(g.id)} onChange={(e) => toggle(g, e.target.checked)} />
                  {g.title}
                </label>
              </li>
            ))}
          </ul>
          {matches.length > MAX && <p className={ui.muted}>{t("collections.moreMatches", { count: matches.length - MAX })}</p>}
        </section>
      )}
      {games.length === 0 ? (
        <p className={ui.muted}>{t("collections.empty")}</p>
      ) : editing && mirror === null ? (
        <ul className={ui.grid} style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {games.map((g) => (
            <li key={g.id} className={css.removable}>
              <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                <GameCard game={g} />
              </ul>
              <button type="button" className={ui.btn} onClick={() => toggle(g, false)}>
                {t("collections.removeGame")}
                <span className="sr-only">: {g.title}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <GameGrid games={games} />
      )}
    </div>
  );
}
