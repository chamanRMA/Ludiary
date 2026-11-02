import type { GameDetailDto, GamePatchDto } from "@ludiary/api-contract";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { errorText } from "../app/errors";
import { api } from "../data/api";
import { mutate, useQuery } from "../data/hooks";
import ui from "../styles/ui.module.css";
import { cx } from "./bits";

type Props = {
  game: GameDetailDto;
  save: (patch: GamePatchDto) => Promise<boolean>;
  error: string | null;
  onOpenChange: (open: boolean) => void;
};

/** ADR 85: add the game to existing collections or to a new one. A small popover, not a modal: Escape closes it. */
export function CollectionMenu({ game, save, error, onOpenChange }: Props) {
  const { t } = useTranslation();
  const collections = useQuery(() => api.getCollections());
  const [open, setOpenState] = useState(false);
  const [name, setName] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const working = useRef(false);
  // ADR 88: only the user's own collections can be changed here; the ones that come from a store are shown on the page of the game.
  const ids = game.collections.filter((c) => c.source === null).map((c) => c.id);

  const setOpen = (value: boolean): void => {
    setOpenState(value);
    onOpenChange(value);
  };
  const close = (): void => {
    setOpen(false);
    button.current?.focus();
  };

  // Focus moves into the popover when it opens: the first checkbox, or the name field when there are no collections.
  useEffect(() => {
    if (open) root.current?.querySelector<HTMLElement>("input")?.focus();
  }, [open]);

  const toggle = (id: string, on: boolean): Promise<boolean> => save({ collectionIds: on ? [...ids, id] : ids.filter((c) => c !== id) });

  const create = async (): Promise<void> => {
    if (working.current || name.trim() === "") return; // not disabled while working: it would drop keyboard focus
    working.current = true;
    try {
      const created = await mutate(api.createCollection(name));
      setName("");
      setCreateError(null);
      await save({ collectionIds: [...ids, created.id] });
    } catch (e) {
      setCreateError(errorText(t, e));
    } finally {
      working.current = false;
    }
  };

  const shown = createError ?? error;
  return (
    <div
      ref={root}
      style={{ position: "relative", display: "inline-flex" }}
      onKeyDown={(e) => {
        if (e.key === "Escape" && open) {
          e.stopPropagation();
          close();
        }
      }}
      onBlur={(e) => {
        // Tabbing or clicking away closes it without stealing focus back.
        if (open && !root.current?.contains(e.relatedTarget as Node | null)) setOpen(false);
      }}
    >
      <button
        ref={button}
        type="button"
        className={cx(ui.btn, ui.small, ui.dashed)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls="g-collection-menu"
        onClick={() => (open ? close() : setOpen(true))}
      >
        {t("game.addToCollection")}
      </button>
      {open && (
        <div
          id="g-collection-menu"
          role="dialog"
          tabIndex={-1}
          aria-label={t("game.collectionsLabel")}
          className={ui.panel}
          style={{ position: "absolute", top: "calc(100% + 6px)", left: 0, zIndex: 20, minWidth: 280, maxHeight: 360, overflow: "auto", gap: 8 }}
        >
          {collections && collections.every((c) => c.source !== null) && <p className={ui.muted}>{t("game.noCollections")}</p>}
          {(collections ?? []).filter((c) => c.source === null).map((c) => (
            <label key={c.id} className={ui.check}>
              <input type="checkbox" checked={ids.includes(c.id)} onChange={(e) => void toggle(c.id, e.target.checked)} />
              {c.name}
            </label>
          ))}
          <form
            className={ui.chips}
            onSubmit={(e) => {
              e.preventDefault();
              void create();
            }}
          >
            <input className={ui.field} style={{ minWidth: "12em", flex: 1 }} value={name} maxLength={200} aria-label={t("collections.new")} placeholder={t("collections.new")} onChange={(e) => setName(e.target.value)} />
            <button type="submit" className={ui.btn}>{t("game.createAndAdd")}</button>
          </form>
          {shown && <p role="alert" className={ui.error}>{shown}</p>}
        </div>
      )}
    </div>
  );
}
