import type { PriceSearchResultDto, WatchItemDto } from "@ludiary/api-contract";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { errorText } from "../app/errors";
import { Link } from "../app/Link";
import { api } from "../data/api";
import { mutate, useQuery, useQueryState } from "../data/hooks";
import { cx, Cover, PageTitle } from "../components/bits";
import { ExternalLink, ITAD_URL, PricesTable, ServiceNotice } from "../components/PricesPanel";
import ui from "../styles/ui.module.css";

/** Wait after the last keystroke before searching (ADR 86 point 15, M6). */
export const SEARCH_DELAY_MS = 400;
const MIN_SEARCH = 2;

function TypeChip({ type }: { type: WatchItemDto["type"] }) {
  const { t } = useTranslation();
  return type === "dlc" || type === "package" ? <span className={ui.chip}>{t(type === "dlc" ? "prices.type.dlc" : "prices.type.package")}</span> : null;
}

/** Thumbnail of the game (ADR 86 point 17): the same Cover, with the gradient when there is no image. The title is next to it, so no alt. */
function Thumb({ item }: { item: Pick<WatchItemDto, "title" | "coverUrl" | "coverFallbackUrl"> }) {
  return (
    <div style={{ width: 48, flex: "none" }}>
      <Cover game={item} height={64} bare />
    </div>
  );
}

function Search() {
  const { t } = useTranslation();
  const [text, setText] = useState("");
  const [results, setResults] = useState<readonly PriceSearchResultDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const title = text.trim();
    if (title.length < MIN_SEARCH) {
      setResults(null);
      return;
    }
    let live = true;
    const timer = setTimeout(() => {
      api.searchPrices(title).then(
        (found) => {
          if (!live) return;
          setResults(found);
          setError(null);
        },
        (e: unknown) => live && setError(errorText(t, e)),
      );
    }, SEARCH_DELAY_MS);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [text, t]);

  const follow = async (r: PriceSearchResultDto): Promise<void> => {
    try {
      await mutate(api.watchPrice(r.resultId));
      setResults((prev) => prev?.map((x) => (x.resultId === r.resultId ? { ...x, watched: true } : x)) ?? null);
      setError(null);
    } catch (e) {
      setError(errorText(t, e));
    }
  };

  return (
    <section className={ui.panel} aria-labelledby="p-search">
      <h2 id="p-search">{t("prices.search.title")}</h2>
      <input className={ui.field} type="search" value={text} maxLength={100} aria-label={t("prices.search.label")} placeholder={t("prices.search.placeholder")} onChange={(e) => setText(e.target.value)} />
      {error && <p role="alert" className={ui.error}>{error}</p>}
      {results && results.length === 0 && <p className={ui.muted} role="status">{t("prices.search.none")}</p>}
      {results?.map((r) => (
        <div key={r.resultId} className={ui.row}>
          <Thumb item={r} />
          <div style={{ flex: 1 }}>
            <b>{r.title}</b>
            {r.ownedGameId && <small>{t("prices.owned")}</small>}
          </div>
          <span className={ui.chips}>
            <TypeChip type={r.type} />
            <button type="button" className={cx(ui.btn, ui.small)} disabled={r.watched} aria-label={t("prices.followLabel", { title: r.title })} onClick={() => void follow(r)}>
              {t(r.watched ? "prices.following" : "prices.follow")}
            </button>
          </span>
        </div>
      ))}
    </section>
  );
}

/** The follow list ordered by discount (ADR 86 point 9). Without a key the page only explains and points to Settings. */
export function Prices() {
  const { t, i18n } = useTranslation();
  const services = useQuery(() => api.getServices());
  const configured = services?.some((s) => s.service === "itad" && s.configured) === true;
  const { data: board } = useQueryState(() => (configured ? api.getPriceBoard() : Promise.resolve(null)), [configured]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const ready = board?.service === "connected" && !board.needsCountry;
  const ids = (board?.items ?? []).map((i) => i.id);
  const idsKey = ids.join(",");

  const refreshAll = async (manual: boolean): Promise<void> => {
    if (ids.length === 0) return;
    setBusy(true);
    try {
      // Batches of 200, one after the other (the list holds up to 500). Only the first is manual: the server floor of a minute
      // would skip the rest, which then refresh by the usual 6 hour rule.
      for (let i = 0; i < ids.length; i += 200) {
        await mutate(api.refreshPrices({ watchIds: ids.slice(i, i + 200), ...(manual && i === 0 ? { manual: true } : {}) }));
      }
      setError(null);
    } catch (e) {
      setError(errorText(t, e));
    } finally {
      setBusy(false);
    }
  };

  // Opening the page, or following a game, asks for the prices that are missing or older than 6 hours.
  useEffect(() => {
    if (ready) void refreshAll(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run when the list or the readiness changes
  }, [ready, idsKey]);

  if (services === undefined) return null;
  if (!configured) {
    return (
      <div className={ui.stack}>
        <PageTitle>{t("prices.title")}</PageTitle>
        <section className={cx(ui.panel, ui.dashed)}>
          <h2>{t("prices.noKey.title")}</h2>
          <p className={ui.muted}>{t("prices.noKey.body")}</p>
          <Link to="/settings/services" className={cx(ui.btn, ui.primary)} style={{ alignSelf: "flex-start" }}>
            {t("prices.goSettings")}
          </Link>
        </section>
      </div>
    );
  }
  if (!board) return null;

  const unfollow = async (item: WatchItemDto): Promise<void> => {
    try {
      await mutate(api.unwatchPrice(item.id));
    } catch (e) {
      setError(errorText(t, e));
    }
  };

  return (
    <div className={ui.stack}>
      <header>
        <PageTitle>{t("prices.title")}</PageTitle>
        <p className={ui.muted}>{t("prices.subtitle")}</p>
      </header>
      <ServiceNotice service={board.service} needsCountry={board.needsCountry} />
      {board.limitedUntil !== undefined && <p className={ui.muted} role="status">{t("prices.limitedShort", { until: new Date(board.limitedUntil).toLocaleTimeString(i18n.language) })}</p>}
      {error && <p role="alert" className={ui.error}>{error}</p>}
      <Search />
      <section className={ui.panel} aria-labelledby="p-list" aria-busy={busy}>
        <h2 id="p-list">{t("prices.list", { count: board.items.length })}</h2>
        {board.items.length === 0 && <p className={ui.muted}>{t("prices.empty")}</p>}
        {board.items.map((item) => (
          <article key={item.id} className={ui.stack} aria-label={item.title}>
            <div className={ui.row}>
              <Thumb item={item} />
              <div style={{ flex: 1 }}>
                <b>{item.title}</b>
                {item.ownedGameId && (
                  <small>
                    {t("prices.owned")} <Link to={`/game/${encodeURIComponent(item.ownedGameId)}`} className={ui.chipLink}>{t("prices.viewInLibrary")}</Link>
                  </small>
                )}
              </div>
              <span className={ui.chips}>
                <TypeChip type={item.type} />
                <button type="button" className={cx(ui.btn, ui.small)} onClick={() => void unfollow(item)}>
                  {t("prices.unfollow")}
                </button>
              </span>
            </div>
            {item.prices ? <PricesTable prices={item.prices} locale={i18n.language} /> : <p className={ui.muted}>{t("prices.noPricesYet")}</p>}
          </article>
        ))}
        <div className={ui.chips}>
          {ready && board.items.length > 0 && (
            <button type="button" className={cx(ui.btn, ui.small)} disabled={busy} onClick={() => void refreshAll(true)}>
              {t("prices.refresh")}
            </button>
          )}
          <ExternalLink small href={ITAD_URL}>{t("prices.attribution")}</ExternalLink>
        </div>
      </section>
    </div>
  );
}
