import type { GameSummaryDto } from "@ludiary/api-contract";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { errorText } from "../app/errors";
import { Link } from "../app/Link";
import { STORE_BRAND } from "../app/stores";
import { api } from "../data/api";
import { mutate, useQuery } from "../data/hooks";
import { Cover, cx, FilterChip, PageTitle } from "../components/bits";
import { GameGrid } from "../components/GameCard";
import { CollectionsStatusLine, withCollections } from "../components/CollectionsStatus";
import { Icon } from "../components/Icon";
import ui from "../styles/ui.module.css";
import css from "./collections.module.css";

function CollectionCard({ name, to, games, badge }: { name: string; to: string; games: readonly GameSummaryDto[]; badge?: string }) {
  const { t } = useTranslation();
  const stores = [...new Set(games.flatMap((g) => g.stores))];
  return (
    <li className={css.card}>
      <div className={css.mosaic} aria-hidden="true">
        {games.slice(0, 4).map((g) => (
          <Cover key={g.id} game={g} bare />
        ))}
      </div>
      <div className={css.info}>
        <div>
          <h2 className={css.name}>
            <Link to={to}>{name}</Link>
          </h2>
          <span className={ui.muted}>{t("collections.games", { count: games.length })}</span> {badge && <span className={cx(ui.chip, ui.ok)}>{badge}</span>}
        </div>
        <span className={css.dots} aria-hidden="true">
          {stores.map((s) => (
            <i key={s} className={ui.dot} style={{ background: STORE_BRAND[s].color }} />
          ))}
        </span>
      </div>
    </li>
  );
}

export function Collections() {
  const { t } = useTranslation();
  const collections = useQuery(() => api.getCollections());
  const library = useQuery(() => api.getLibrary());
  const mirrored = withCollections(useQuery(() => api.getStores()));
  const [tab, setTab] = useState<"collections" | "tags">("collections");
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  if (!collections || !library) return null;
  const byId = new Map(library.map((g) => [g.id, g]));
  const pick = (ids: readonly string[]) => ids.flatMap((id) => byId.get(id) ?? []);
  const tagCounts = new Map<string, number>();
  for (const g of library) for (const tag of g.tags) tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
  const create = async (): Promise<void> => {
    try {
      await mutate(api.createCollection(name));
      setCreating(false);
      setName("");
      setError(null);
    } catch (e) {
      setError(errorText(t, e));
    }
  };
  return (
    <div className={ui.stack}>
      <header className={css.head}>
        <div>
          <PageTitle>{t("collections.title")}</PageTitle>
          <p className={ui.muted}>{t("collections.subtitle")}</p>
        </div>
        <div className={ui.chips}>
          <button type="button" className={cx(ui.btn, ui.primary)} onClick={() => setCreating(true)}>
            <Icon name="plus" size={18} />
            {t("collections.new")}
          </button>
        </div>
      </header>
      {creating && (
        <form
          className={ui.chips}
          onSubmit={(e) => {
            e.preventDefault();
            void create();
          }}
        >
          <input className={ui.field} value={name} maxLength={200} autoFocus aria-label={t("collections.name")} onChange={(e) => setName(e.target.value)} />
          <button type="submit" className={cx(ui.btn, ui.primary)}>{t("collections.create")}</button>
          <button type="button" className={ui.btn} onClick={() => { setCreating(false); setError(null); }}>{t("common.cancel")}</button>
        </form>
      )}
      {error && <p role="alert" className={ui.error}>{error}</p>}
      {mirrored.map((s) => <CollectionsStatusLine key={s.store} status={s} />)}
      <div className={css.bar}>
        <div className={ui.chips}>
          <FilterChip active={tab === "collections"} onClick={() => setTab("collections")}>
            {t("collections.tabCollections", { count: collections.length + 1 })}
          </FilterChip>
          <FilterChip active={tab === "tags"} onClick={() => setTab("tags")}>
            {t("collections.tabTags", { count: tagCounts.size })}
          </FilterChip>
        </div>
      </div>
      {tab === "collections" && (
        <ul className={css.grid}>
          <CollectionCard name={t("collections.favorites")} to="/library?favorite=1" games={library.filter((g) => g.favorite)} badge={t("collections.default")} />
          {collections.map((c) => (
            <CollectionCard key={c.id} name={c.name} to={`/collections/${encodeURIComponent(c.id)}`} games={pick(c.gameIds)} {...(c.source ? { badge: t("collections.fromStore", { store: STORE_BRAND[c.source].name }) } : {})} />
          ))}
          <li style={{ display: "contents" }}>
            <button type="button" className={css.new} onClick={() => setCreating(true)}>
              <Icon name="plus" size={28} />
              {t("collections.new")}
            </button>
          </li>
        </ul>
      )}
      <section className={ui.panel}>
        <h2>{t("collections.tagsTitle")}</h2>
        <div className={css.tags}>
          {[...tagCounts].map(([tag, n]) => (
            <Link key={tag} to={`/library?tag=${encodeURIComponent(tag)}`} className={ui.chip} aria-label={t("collections.openTag", { tag })}>
              {tag}
              <em>{n}</em>
            </Link>
          ))}
        </div>
      </section>
      <p className={cx(ui.muted, css.note)}>{t("collections.note")}</p>
    </div>
  );
}

export function Local() {
  const { t } = useTranslation();
  const library = useQuery(() => api.getLibrary());
  if (!library) return null;
  return (
    <div className={ui.stack}>
      <header>
        <PageTitle>{t("local.title")}</PageTitle>
        <p className={ui.muted}>{t("local.subtitle")}</p>
      </header>
      <GameGrid games={library.filter((g) => g.stores.length === 0)} />
      <p className={ui.muted}>{t("local.addLater")}</p>
    </div>
  );
}

export function Prices() {
  const { t } = useTranslation();
  return (
    <div className={ui.stack}>
      <PageTitle>{t("prices.title")}</PageTitle>
      <section className={cx(ui.panel, ui.dashed)}>
        <span className={ui.chip} style={{ alignSelf: "flex-start" }}>{t("common.comingSoon")}</span>
        <h2>{t("home.pricesTitle")}</h2>
        <p className={ui.muted}>{t("prices.body")}</p>
      </section>
    </div>
  );
}
