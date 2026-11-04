
import type { GameDetailDto, GamePatchDto, StoreId } from "@ludiary/api-contract";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { errorText } from "../app/errors";
import { Link } from "../app/Link";
import { STORE_BRAND } from "../app/stores";
import { useLaunch } from "../app/useLaunch";
import { api, isSimulated } from "../data/api";
import { mutate, useQuery, useQueryState } from "../data/hooks";
import { isUnsynced, primaryAction } from "../data/library";
import { CollectionMenu } from "../components/CollectionMenu";
import { PricesPanel } from "../components/PricesPanel";
import { FromStore } from "../components/CollectionsStatus";
import { Icon } from "../components/Icon";
import { cx, Cover, formatHours, LoadError, PageTitle, relativeTime } from "../components/bits";
import ui from "../styles/ui.module.css";
import { NotFound } from "./NotFound";

export function Game({ id }: { id: string }) {
  const { t, i18n } = useTranslation();
  const { data: game, error } = useQueryState(() => api.getGame(id), [id]);
  const { launching, message, setMessage, play } = useLaunch();
  const [busy, setBusy] = useState(false);
  const working = useRef(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  if (game === undefined) return <LoadError error={error} />;
  if (game === null) return <NotFound />;

  const primary = game.properties.find((p) => p.installed) ?? game.properties[0];
  const action = primaryAction(game);
  const installable = game.properties.find((p) => !p.installed && p.actions.includes("install"));
  const storeName = primary && primary.store !== "manual" ? STORE_BRAND[primary.store].name : "";

  /** ADR 85: every change is one PATCH that answers the whole game; mutate() refreshes the page and the lists. */
  const save = async (patch: GamePatchDto): Promise<boolean> => {
    // Controls stay enabled while saving (disabling would drop keyboard focus): clicks are ignored instead.
    if (working.current) return false;
    working.current = true;
    setBusy(true);
    try {
      await mutate(api.updateGame(game.id, patch));
      setSaveError(null);
      return true;
    } catch (e) {
      setSaveError(errorText(t, e));
      return false;
    } finally {
      working.current = false;
      setBusy(false);
    }
  };

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
            <button type="button" className={cx(ui.btn, ui.small, game.favorite && ui.pressed)} aria-pressed={game.favorite} onClick={() => void save({ favorite: !game.favorite })}>
              <Icon name={game.favorite ? "starFilled" : "star"} size={16} />
              {t("game.favorite")}
            </button>
            {game.collections.map((c) => (
              <span key={c.id} style={{ display: "inline-flex", gap: 4, alignItems: "center" }}>
                <Link to={`/collections/${encodeURIComponent(c.id)}`} className={ui.chipLink}>
                  {c.name}
                </Link>
                {c.source !== null && <FromStore source={c.source} />}
              </span>
            ))}
            <CollectionMenu game={game} save={save} error={saveError} onOpenChange={setPickerOpen} />
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
              isSimulated && <button type="button" className={ui.btn} onClick={() => setMessage({ text: t("game.openStoreSimulated", { store: storeName }), error: false })}>
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
              <li key={d.id}>
                {d.title} <span className={ui.chip}>{STORE_BRAND[d.store].name}</span>
                {d.installed && <span className={cx(ui.chip, ui.ok)}>{t("common.installed")}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}

      <PricesPanel game={game} />

      <Organize game={game} busy={busy} error={pickerOpen ? null : saveError} save={save} />
    </div>
  );
}

function Organize({ game, busy, error, save }: { game: GameDetailDto; busy: boolean; error: string | null; save: (patch: GamePatchDto) => Promise<boolean> }) {
  const { t } = useTranslation();
  const library = useQuery(() => api.getLibrary());
  const [draft, setDraft] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const suggestions = [...new Set((library ?? []).flatMap((g) => g.tags))].filter((tag) => !game.tags.includes(tag)).sort();
  const addTag = async (): Promise<void> => {
    if (draft.trim() !== "" && (await save({ tags: [...game.tags, draft] }))) setDraft("");
  };

  return (
    <section className={ui.panel} aria-labelledby="g-tags" aria-busy={busy}>
      <h2 id="g-tags">{t("game.tags")}</h2>
      <div className={ui.chips}>
        {game.tags.map((tag) => (
          <span key={tag} className={ui.chip}>
            {tag}
            <button type="button" className={ui.chipBtn} aria-label={t("game.tagRemove", { name: tag })} onClick={() => void save({ tags: game.tags.filter((x) => x !== tag) }).then(() => input.current?.focus())}>
              <span aria-hidden="true">×</span>
            </button>
          </span>
        ))}
        {game.tags.length === 0 && <span className={ui.muted}>{t("game.noTags")}</span>}
      </div>
      <div className={ui.chips}>
        <input
          className={ui.field}
          list="g-tag-suggestions"
          value={draft}
          maxLength={200}
          aria-label={t("game.tagAdd")}
          ref={input}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void addTag();
          }}
        />
        <datalist id="g-tag-suggestions">
          {suggestions.map((tag) => <option key={tag} value={tag} />)}
        </datalist>
        <button type="button" className={ui.btn} disabled={draft.trim() === ""} onClick={() => void addTag()}>
          {t("game.tagAddButton")}
        </button>
      </div>
      {error && <p role="alert" className={ui.error}>{error}</p>}
    </section>
  );
}
