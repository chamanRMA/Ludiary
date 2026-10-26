// appmanifest_<id>.acf. Reads only appid, name and installdir. LastOwner (a SteamID64) is never read.
import { ConnectorError, type I18nKey } from "@ludiary/contracts";
import { parseVdf, vdfObject, vdfString } from "./vdf";

export interface AppManifest {
  readonly appId: string;
  readonly name: string | null;
  /** Single folder name, relative to steamapps\common. null when absent or unsafe. */
  readonly installDir: string | null;
  /** ADR 84: valid, distinct-from-appid, unique `InstalledDepots.*.dlcappid`, in order, at most MAX_DLC. */
  readonly dlcAppIds: readonly string[];
  /** DLC ids beyond MAX_DLC that were ignored. */
  readonly dlcDropped: number;
}

export const MAX_DLC = 1000;

export const APPID_RE = /^\d{1,10}$/;
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f]/g;
const MAX_NAME = 300;

function safeInstallDir(v: string | undefined): string | null {
  if (v === undefined) return null;
  const d = v.trim();
  if (d === "" || d === "." || d === ".." || d.length > 255) return null;
  // eslint-disable-next-line no-control-regex
  if (/[\\/:*?"<>|\u0000-\u001f]/.test(d)) return null;
  return d;
}

export function parseAppManifest(text: string): AppManifest {
  const state = vdfObject(parseVdf(text), "AppState");
  const appId = vdfString(state, "appid")?.trim();
  if (!state || appId === undefined || !APPID_RE.test(appId)) {
    throw new ConnectorError("store.unexpected-response", "appmanifest has no valid AppState.appid", {
      messageKey: "connectors.steam.errors.malformedFile" as I18nKey,
    });
  }
  const name = vdfString(state, "name")?.replace(CONTROL, " ").trim().slice(0, MAX_NAME);
  const dlc = new Set<string>();
  let dlcDropped = 0;
  for (const depot of vdfObject(state, "InstalledDepots")?.values() ?? []) {
    const id = typeof depot === "string" ? undefined : vdfString(depot, "dlcappid")?.trim();
    if (id === undefined || !APPID_RE.test(id) || id === appId || dlc.has(id)) continue;
    if (dlc.size >= MAX_DLC) dlcDropped++;
    else dlc.add(id);
  }
  return { appId, name: name ? name : null, installDir: safeInstallDir(vdfString(state, "installdir")), dlcAppIds: [...dlc], dlcDropped };
}
