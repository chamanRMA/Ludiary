import type { TFunction } from "i18next";
import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { GameSummaryDto, StoreId } from "@ludiary/api-contract";
import { STORE_BRAND } from "../app/stores";
import { isSimulated } from "../data/api";
import ui from "../styles/ui.module.css";

export const cx = (...names: (string | false | undefined)[]): string => names.filter(Boolean).join(" ");

/** Page heading that can receive focus after navigation (ADR 37, 68). */
export function PageTitle({ children }: { children: ReactNode }) {
  return <h1 tabIndex={-1}>{children}</h1>;
}

export function StoreBadge({ store, size, warning }: { store: StoreId; size?: "md" | "lg"; warning?: boolean }) {
  const brand = STORE_BRAND[store];
  return (
    <span className={cx(ui.badge, size === "lg" && ui.badgeLg, size === "md" && ui.badgeMd)} style={{ background: brand.color }} aria-hidden="true">
      {brand.letter}
      {warning && <i className={ui.warnDot} />}
    </span>
  );
}

/**
 * Cover image with the ADR 71 fallback chain: coverUrl, then coverFallbackUrl (contained), then a
 * deterministic CSS gradient with the title. No retries.
 */
export function Cover({ game, height = 190, bare }: { game: Pick<GameSummaryDto, "title" | "coverUrl" | "coverFallbackUrl" | "unsynced">; height?: number; bare?: boolean }) {
  const urls = [game.coverUrl, game.coverFallbackUrl].filter((u): u is string => !!u);
  const [failed, setFailed] = useState(0);
  let hash = 0;
  for (const ch of game.title) hash = (hash * 31 + ch.charCodeAt(0)) % 360;
  const src = urls[failed];
  return (
    <div className={cx(ui.cover, game.unsynced === true && ui.unsynced)} style={{ height, background: `hsl(${hash} 38% 32%)` }} aria-hidden="true">
      {src ? (
        <img
          key={src}
          className={cx(ui.coverImg, failed > 0 && ui.coverContain)}
          src={src}
          alt=""
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setFailed((n) => n + 1)}
        />
      ) : (
        !bare && game.title
      )}
    </div>
  );
}

/** Tells the user a button only touched the simulated state. */
export function SimNote({ show }: { show: boolean }) {
  const { t } = useTranslation();
  return show && isSimulated ? (
    <p className={ui.muted} role="status">
      {t("common.simulated")}
    </p>
  ) : null;
}

/** Body texts: first line is the intro, the following lines become numbered steps. */
export function StepText({ text }: { text: string }) {
  const [intro, ...steps] = text.split("\n");
  return (
    <>
      <p>{intro}</p>
      {steps.length > 0 && (
        <ol style={{ margin: "4px 0 0", paddingLeft: 22, display: "flex", flexDirection: "column", gap: 6 }}>
          {steps.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ol>
      )}
    </>
  );
}

export function formatHours(minutes: number, t: TFunction): string {
  return minutes === 0 ? t("common.neverPlayed") : t("common.hoursShort", { n: Math.round(minutes / 60) });
}

export function relativeTime(epoch: number, lang: string): string {
  const diff = (epoch - Date.now()) / 1000;
  const rtf = new Intl.RelativeTimeFormat(lang, { numeric: "auto" });
  for (const [unit, secs] of [["day", 86400], ["hour", 3600], ["minute", 60]] as const) {
    if (Math.abs(diff) >= secs) return rtf.format(Math.round(diff / secs), unit);
  }
  return rtf.format(0, "minute");
}

export function FilterChip({ active, onClick, children }: { active: boolean; onClick(): void; children: string }) {
  return (
    <button type="button" className={cx(ui.btn, ui.small, active && ui.pressed)} aria-pressed={active} onClick={onClick}>
      {children}
    </button>
  );
}
