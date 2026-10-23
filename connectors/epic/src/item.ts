// Parser of the launcher's *.item manifests (ADR 78, point 3; assumption E2).
import { ConnectorError, isStrictLocalPath } from "@ludiary/contracts";
import { buildStoreId, cleanText, isObject } from "./ids";

export const MAX_TITLE = 300;
export type ItemSkip = "incomplete" | "dlc" | "not-game";
export interface EpicItem {
  readonly storeGameId: string;
  readonly title: string;
  /** Absolute, backslashes, no trailing separator. */
  readonly installLocation: string;
}

/**
 * InstallLocation comes from a file any local user can write (ADR 78 audit): the shared strict rule, plus no empty
 * component and no drive root (the folder must have a name so its parent can be derived).
 */
const isSafeLocation = (p: string): boolean => isStrictLocalPath(p) && p.slice(3).split("\\").every((c) => c !== "");
const bad = (msg: string): ConnectorError => new ConnectorError("store.unexpected-response", msg);
const hasCategory = (cats: readonly unknown[], name: string): boolean =>
  cats.some((c) => typeof c === "string" && new RegExp(`^${name}(/|$)`, "i").test(c));

/**
 * Parses one .item (JSON, maybe with BOM). Returns the game, or why it is not listed.
 * Malformed JSON or a missing/invalid required field throws 'store.unexpected-response'.
 */
export function parseEpicItem(text: string): EpicItem | ItemSkip {
  let raw: unknown;
  try {
    raw = JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text);
  } catch {
    throw bad("Epic item is not JSON");
  }
  if (!isObject(raw)) throw bad("Epic item is not an object");
  const { AppName: app, CatalogNamespace: ns, CatalogItemId: cat, InstallLocation: loc } = raw;
  const storeGameId = buildStoreId(ns, cat, app);
  if (storeGameId === null || typeof loc !== "string" || typeof app !== "string") throw bad("Epic item lacks a valid id");
  const installLocation = loc.replace(/\//g, "\\").replace(/\\+$/, "");
  // A drive root is not accepted either: the folder must have a name so its parent can be derived.
  if (!isSafeLocation(installLocation)) throw bad("Epic item has no valid InstallLocation");

  if (raw["bIsIncompleteInstall"] === true) return "incomplete";
  const main = raw["MainGameAppName"];
  const cats = Array.isArray(raw["AppCategories"]) ? raw["AppCategories"] : undefined;
  if ((typeof main === "string" && main !== "" && main !== app) || (cats && hasCategory(cats, "addons"))) return "dlc";
  // shortcut: a manifest with no AppCategories list at all is treated as a game (E2 is unverified); upgrade once a real .item is seen.
  if ((cats && !hasCategory(cats, "games")) || ns === "ue") return "not-game";

  const name = typeof raw["DisplayName"] === "string" ? cleanText(raw["DisplayName"], MAX_TITLE) : "";
  return { storeGameId, title: name || `Epic ${app}`, installLocation };
}
