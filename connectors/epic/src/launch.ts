import { ConnectorError, type GameAction, type I18nKey, type LaunchContext, type LaunchSpec, type StoredProperty } from "@ludiary/contracts";
import { STORE_ID_RE, splitStoreId } from "./ids";
import { EPIC_LAUNCHER_ID } from "./manifest";

// Last line of defence: whatever is built must have exactly this shape (ADR 78, point 4).
const URI_RE =
  /^com\.epicgames\.launcher:\/\/apps\/[A-Za-z0-9_-]{1,64}%3A[0-9a-f]{32}%3A[A-Za-z0-9._-]{1,60}\?action=(?:launch&silent=true|install)$/;

// The launcher location must point at the executable itself (registry values use '/').
const LAUNCHER_EXE_RE = /(^|[\\/])EpicGamesLauncher\.exe$/i;

const fail = (code: "action.unsupported" | "launch.launcher-missing", key: string, msg: string): ConnectorError =>
  new ConnectorError(code, msg, { messageKey: `connectors.epic.errors.${key}` as I18nKey });

/**
 * play -> the launcher's own shortcut URI with action=launch (needs the game installed). install -> the same with
 * action=install, after checking the launcher is there (ADR 78, point 4). Nothing from the API reaches the URI.
 */
export async function resolveEpicAction(property: StoredProperty, action: GameAction, ctx: LaunchContext): Promise<LaunchSpec | null> {
  if (action !== "play" && action !== "install") return null;
  const id = property.storeGameId;
  if (id === null) return null;
  if (!STORE_ID_RE.test(id)) throw fail("action.unsupported", "invalidId", "Stored Epic game id has an invalid shape");
  if (action === "play" && property.installPath === null) throw new ConnectorError("launch.not-installed", "Epic game has no install path");
  if (action === "install" && ctx.launchersResolved && !ctx.launchers.some((l) => l.declarationId === EPIC_LAUNCHER_ID && LAUNCHER_EXE_RE.test(l.path))) {
    throw fail("launch.launcher-missing", "launcherMissing", "The Epic Games launcher was not found");
  }
  const { namespace, catalogItemId, appName } = splitStoreId(id);
  const ns = /^[0-9a-fA-F]{32}$/.test(namespace) ? namespace.toLowerCase() : namespace;
  const query = action === "play" ? "action=launch&silent=true" : "action=install";
  const uri = `com.epicgames.launcher://apps/${ns}%3A${catalogItemId}%3A${appName}?${query}`;
  if (!URI_RE.test(uri)) throw fail("action.unsupported", "invalidId", "Built Epic URI has an unexpected shape");
  return { kind: "uri", uri };
}
