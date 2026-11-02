import type { StoreId } from "@ludiary/api-contract";
import { useEffect, useState } from "react";
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
  const params = new URLSearchParams(search);
  const query = params.get("q") ?? "";
  // ADR 85: /library?favorite=1 and ?tag=<name> arrive from Collections; the chips keep working locally.
  const urlFavorite = params.get("favorite") === "1";
  const urlTag = params.get("tag") ?? undefined;
  const { data: library, error } = useQueryState(() => api.getLibrary());
  const [store, setStore] = useState<StoreId | "local" | "all">("all");
  const [install, setInstall] = useState<Install>("all");
  const [favorite, setFavorite] = useState(urlFavorite);
  const [tag, setTag] = useState(urlTag);
  useEffect(() => {
    setFavorite(urlFavorite);
    setTag(urlTag);
  }, [urlFavorite, urlTag]);
  if (!library) return <LoadError error={error} />;

  const shown = filterGames(library, {
    ...(store === "all" ? {} : { store }),
    ...(install === "all" ? {} : { installed: install === "installed" }),
    favorite,
    ...(tag === undefined ? {} : { tag }),
    query,
  }).sort((a, b) => a.title.localeCompare(b.title));

  return (
    <div className={ui.stack}>
      <header>
        <PageTitle>{t("library.title")}</PageTitle>
        <p className={ui.muted}>{t("library.count", { shown: shown.length, count: library.length })}{query && ` · ${t("library.searching", { query })}`}</p>
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
        {tag !== undefined && <Chip active label={t("library.tagRemoveFilter", { tag })} onClick={() => setTag(undefined)}>{t("library.tag", { tag })}</Chip>}
      </div>
      <GameGrid games={shown} />
    </div>
  );
}
