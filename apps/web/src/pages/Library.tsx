import type { StoreId } from "@ludiary/api-contract";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation } from "../app/router";
import { STORE_BRAND, STORE_IDS } from "../app/stores";
import { api } from "../data/api";
import { useQueryState } from "../data/hooks";
import { filterGames } from "../data/library";
import { FilterChip as Chip, LoadError, PageTitle } from "../components/bits";
import { GameGrid } from "../components/GameCard";
import ui from "../styles/ui.module.css";

type Install = "all" | "installed" | "notInstalled";

export function Library() {
  const { t } = useTranslation();
  const { search } = useLocation();
  const query = new URLSearchParams(search).get("q") ?? "";
  const { data: library, error } = useQueryState(() => api.getLibrary());
  const [store, setStore] = useState<StoreId | "local" | "all">("all");
  const [install, setInstall] = useState<Install>("all");
  const [favorite, setFavorite] = useState(false);
  if (!library) return <LoadError error={error} />;

  const shown = filterGames(library, {
    ...(store === "all" ? {} : { store }),
    ...(install === "all" ? {} : { installed: install === "installed" }),
    favorite,
    query,
  }).sort((a, b) => a.title.localeCompare(b.title));

  return (
    <div className={ui.stack}>
      <header>
        <PageTitle>{t("library.title")}</PageTitle>
        <p className={ui.muted}>{t("library.count", { shown: shown.length, total: library.length })}{query && ` · ${t("library.searching", { query })}`}</p>
      </header>
      <div role="group" aria-label={t("library.filterStore")} className={ui.chips}>
        <Chip active={store === "all"} onClick={() => setStore("all")}>{t("library.all")}</Chip>
        {STORE_IDS.map((id) => (
          <Chip key={id} active={store === id} onClick={() => setStore(id)}>{STORE_BRAND[id].name}</Chip>
        ))}
        <Chip active={store === "local"} onClick={() => setStore("local")}>{t("nav.local")}</Chip>
      </div>
      <div role="group" aria-label={t("library.filterInstall")} className={ui.chips}>
        <Chip active={install === "all"} onClick={() => setInstall("all")}>{t("library.all")}</Chip>
        <Chip active={install === "installed"} onClick={() => setInstall("installed")}>{t("common.installedPlural")}</Chip>
        <Chip active={install === "notInstalled"} onClick={() => setInstall("notInstalled")}>{t("common.notInstalledPlural")}</Chip>
        <Chip active={favorite} onClick={() => setFavorite((v) => !v)}>{t("library.favorites")}</Chip>
      </div>
      <GameGrid games={shown} />
    </div>
  );
}
