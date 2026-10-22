import {
  ConnectorError,
  type GameAction,
  type I18nKey,
  type LaunchContext,
  type LaunchSpec,
  type StoredProperty,
} from "@ludiary/contracts";
import { APPID_RE } from "./appmanifest";

/** play -> steam://rungameid/<id>; install -> steam://install/<id> (ADR 74, S9). The core checks installed/owned. */
export async function resolveSteamAction(
  property: StoredProperty,
  action: GameAction,
  ctx: LaunchContext,
): Promise<LaunchSpec | null> {
  if (action !== "play" && action !== "install") return null;
  const id = property.storeGameId;
  if (id === null) return null;
  if (!APPID_RE.test(id)) {
    throw new ConnectorError("action.unsupported", "Stored Steam game id is not a numeric AppID", {
      messageKey: "connectors.steam.errors.invalidAppId" as I18nKey,
    });
  }
  if (ctx.launchersResolved) {
    let found = false;
    for (const l of ctx.launchers) {
      if (l.declarationId === "steam-client" && (await ctx.fs.exists(l.path))) {
        found = true;
        break;
      }
    }
    if (!found) {
      throw new ConnectorError("launch.launcher-missing", "Steam client was not found", {
        messageKey: "connectors.steam.errors.launcherMissing" as I18nKey,
      });
    }
  }
  return { kind: "uri", uri: `steam://${action === "play" ? "rungameid" : "install"}/${id}` };
}
