import {
  ConnectorError,
  type GameAction,
  type I18nKey,
  type LaunchContext,
  type LaunchSpec,
  type StoredProperty,
} from "@ludiary/contracts";
import { gameFolder } from "./paths";

const ID_RE = /^([1-9][0-9]{0,9})$/;
const URI_RE = /^uplay:\/\/launch\/[1-9][0-9]{0,9}\/0$/;
const CLIENTS = ["upc.exe", "UbisoftConnect.exe"];

/**
 * play -> uplay://launch/<id>/0 (ADR 79, point 4; assumption U6: the /0 form is unverified).
 * Before that, with automatic detection, it checks Ubisoft Connect exists to give a better message.
 */
export async function resolveUbisoftAction(
  property: StoredProperty,
  action: GameAction,
  ctx: LaunchContext,
): Promise<LaunchSpec | null> {
  if (action !== "play") return null;
  if (property.storeGameId === null) return null;
  const m = ID_RE.exec(property.storeGameId);
  if (!m) {
    throw new ConnectorError("action.unsupported", "Stored Ubisoft game id is not a numeric id", {
      messageKey: "connectors.ubisoft.errors.invalidId" as I18nKey,
    });
  }
  if (ctx.launchersResolved) {
    let found = false;
    let failed = false;
    for (const l of ctx.launchers) {
      if (l.declarationId !== "ubisoft-launcher") continue;
      const dir = gameFolder(l.path);
      if (dir === null) continue;
      for (const exe of CLIENTS) {
        try {
          if (await ctx.fs.exists(ctx.fs.join(dir, exe))) found = true;
        } catch {
          failed = true; // unreadable is not absent: the URI is safe anyway
        }
      }
    }
    if (!found && !failed) {
      throw new ConnectorError("launch.launcher-missing", "Ubisoft Connect was not found", {
        messageKey: "connectors.ubisoft.errors.launcherMissing" as I18nKey,
      });
    }
  }
  const uri = `uplay://launch/${m[1]}/0`;
  if (!URI_RE.test(uri)) throw new ConnectorError("internal", "Built an invalid Ubisoft URI");
  return { kind: "uri", uri };
}
