import type { DealDto, GameDetailDto, GamePricesDto, PricesDto } from "@ludiary/api-contract";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { errorText } from "../app/errors";
import { Link } from "../app/Link";
import { api } from "../data/api";
import { mutate, useQuery, useQueryState } from "../data/hooks";
import { formatMoney, formatWhen } from "../data/prices";
import ui from "../styles/ui.module.css";
import { cx } from "./bits";

export const ITAD_URL = "https://isthereanydeal.com/";

/** An external link in the style of the chips and buttons (never underlined), in a new tab (ADR 68). */
export function ExternalLink({ href, children, small }: { href: string; children: string; small?: boolean }) {
  const { t } = useTranslation();
  return (
    <a className={cx(ui.btn, small && ui.small)} href={href} target="_blank" rel="noopener noreferrer">
      {children}
      <span className="sr-only">{t("wizard.newTab")}</span>
    </a>
  );
}

export function DealRow({ deal, locale }: { deal: DealDto; locale: string }) {
  const { t, i18n } = useTranslation();
  return (
    <div className={ui.row}>
      <div>
        <b>{deal.shop.name}</b>
        <small>
          {deal.regularMinor > deal.amountMinor && <s>{formatMoney(deal.regularMinor, deal.currency, locale)}</s>}
          {deal.voucher && ` ${t("prices.voucher", { code: deal.voucher })}`}
          {deal.expiresAt !== undefined && ` ${t("prices.until", { date: formatWhen(deal.expiresAt, i18n.language) })}`}
        </small>
      </div>
      <span className={ui.chips}>
        {deal.cut > 0 && <span className={cx(ui.chip, ui.ok)}>{t("prices.cut", { cut: deal.cut })}</span>}
        <b>{formatMoney(deal.amountMinor, deal.currency, locale)}</b>
        {deal.url && <ExternalLink small href={deal.url}>{t("prices.openDeal", { shop: deal.shop.name })}</ExternalLink>}
      </span>
    </div>
  );
}

/** Best price and historical low, then one row per shop. */
export function PricesTable({ prices, locale }: { prices: PricesDto; locale: string }) {
  const { t, i18n } = useTranslation();
  if (prices.deals.length === 0) return <p className={ui.muted}>{t("prices.noData", { country: prices.country })}</p>;
  const best = prices.deals.reduce((a, b) => (b.amountMinor < a.amountMinor ? b : a));
  return (
    <>
      <p>
        <b>{t("prices.best", { price: formatMoney(best.amountMinor, best.currency, locale), shop: best.shop.name })}</b>
        {best.regularMinor > best.amountMinor && ` · ${t("prices.regular", { price: formatMoney(best.regularMinor, best.currency, locale) })}`}
        {best.cut > 0 && ` · ${t("prices.cut", { cut: best.cut })}`}
      </p>
      {prices.historyLow && <p className={ui.muted}>{t("prices.historyLow", { price: formatMoney(prices.historyLow.amountMinor, prices.historyLow.currency, locale) })}</p>}
      {[...prices.deals].sort((a, b) => a.amountMinor - b.amountMinor).map((d, i) => <DealRow key={`${d.shop.name}-${i}`} deal={d} locale={locale} />)}
      <p className={ui.muted}>
        {t("prices.country", { country: prices.country })} · {t("prices.fetched", { date: formatWhen(prices.fetchedAt, i18n.language) })}
      </p>
    </>
  );
}

/** The key problem shared by the panel and the page: needs a key, a country, or a new key. */
export function ServiceNotice({ service, needsCountry }: Pick<GamePricesDto, "service" | "needsCountry">) {
  const { t } = useTranslation();
  if (service === "invalid" || service === "expired") {
    return (
      <p role="alert" className={ui.error}>
        {t(service === "invalid" ? "prices.invalid" : "prices.expired")} <Link to="/settings/services" className={cx(ui.btn, ui.small)}>{t("common.reconnect")}</Link>
      </p>
    );
  }
  if (service === "connected" && needsCountry) {
    return (
      <p role="status">
        {t("prices.needsCountry")} <Link to="/settings/services" className={cx(ui.btn, ui.small)}>{t("prices.goSettings")}</Link>
      </p>
    );
  }
  return null;
}

/** ADR 86 point 9: only with a key. Opening the page asks for what is missing; the buttons act on this game only. */
export function PricesPanel({ game }: { game: GameDetailDto }) {
  const { t, i18n } = useTranslation();
  const services = useQuery(() => api.getServices());
  const configured = services?.some((s) => s.service === "itad" && s.configured) === true;
  const { data: state } = useQueryState(() => (configured ? api.getGamePrices(game.id) : Promise.resolve(null)), [game.id, configured]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ready = state?.service === "connected" && !state.needsCountry;

  const run = async (work: Promise<unknown>): Promise<void> => {
    setBusy(true);
    try {
      await mutate(work);
      setError(null);
    } catch (e) {
      setError(errorText(t, e));
    } finally {
      setBusy(false);
    }
  };

  // Once per game (and when the panel becomes ready): the server only queries what is missing or older than 6 hours.
  useEffect(() => {
    if (ready) void run(api.refreshPrices({ canonicalIds: [game.id] }));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `run` is recreated each render on purpose
  }, [game.id, ready]);

  if (!configured || !state) return null;
  const locale = i18n.language;
  return (
    <section className={ui.panel} aria-labelledby="g-prices" aria-busy={busy}>
      <h2 id="g-prices">{t("prices.panel")}</h2>
      <ServiceNotice service={state.service} needsCountry={state.needsCountry} />
      {ready && state.link === "pending" && <p className={ui.muted} role="status">{t(busy ? "prices.refreshing" : "prices.pending")}</p>}
      {state.link === "not-found" && <p className={ui.muted}>{t("prices.notFound")}</p>}
      {state.link === "conflict" && <p className={ui.muted}>{t("prices.conflict")}</p>}
      {state.link === "excluded" && <p className={ui.muted}>{t("prices.excluded")}</p>}
      {state.link === "found" && state.prices && (
        <>
          {state.limitedUntil !== undefined && <p className={ui.muted} role="status">{t("prices.limited", { date: formatWhen(state.prices.fetchedAt, locale), until: formatWhen(state.limitedUntil, locale) })}</p>}
          {state.limitedUntil === undefined && state.prices.stale && <p className={ui.muted} role="status">{t("prices.stale", { date: formatWhen(state.prices.fetchedAt, locale) })}</p>}
          <PricesTable prices={state.prices} locale={locale} />
        </>
      )}
      {error && <p role="alert" className={ui.error}>{error}</p>}
      <div className={ui.chips}>
        {ready && state.link !== "excluded" && (
          <button type="button" className={cx(ui.btn, ui.small)} disabled={busy} onClick={() => void run(api.refreshPrices({ canonicalIds: [game.id], manual: true }))}>
            {t("prices.refresh")}
          </button>
        )}
        {state.link === "excluded" ? (
          <button type="button" className={cx(ui.btn, ui.small)} disabled={busy} onClick={() => void run(api.setPriceExclusion(game.id, false))}>
            {t("prices.searchAgain")}
          </button>
        ) : (
          state.link !== "pending" && (
            <button type="button" className={cx(ui.btn, ui.small)} disabled={busy} onClick={() => void run(api.setPriceExclusion(game.id, true))}>
              {t("prices.notThisGame")}
            </button>
          )
        )}
        <ExternalLink small href={ITAD_URL}>{t("prices.attribution")}</ExternalLink>
      </div>
    </section>
  );
}
