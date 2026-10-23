import {
  ConnectorError,
  PathEscapesRootsError,
  type GameAction,
  type I18nKey,
  type LaunchContext,
  type LaunchSpec,
  type StoredProperty,
} from "@ludiary/contracts";
import { ID_BODY, ID_RE, MAX_IDS, parseInstallerData } from "./installerdata";
import { INSTALLER_DATA, isHandled } from "./scan";

const APPS = ["EADesktop.exe", "EALauncher.exe"];
export const URI_RE = new RegExp(`^origin2://game/launch\\?offerIds=${ID_BODY}(,${ID_BODY}){0,${MAX_IDS - 1}}$`);

const fail = (code: "action.unsupported" | "launch.not-installed", key: string, msg: string): ConnectorError =>
  new ConnectorError(code, msg, { messageKey: `connectors.ea.errors.${key}` as I18nKey });

/**
 * play -> origin2://game/launch?offerIds=<ids> (ADR 81, point 4; assumptions EAD8, EAD9). All ids of the file are read now,
 * the stored one first. The URI is built only from validated ids and asserted at the end.
 */
export async function resolveEaAction(
  property: StoredProperty,
  action: GameAction,
  ctx: LaunchContext,
): Promise<LaunchSpec | null> {
  if (action !== "play") return null;
  const stored = property.storeGameId;
  if (stored === null) return null;
  if (!ID_RE.test(stored)) throw fail("action.unsupported", "invalidId", "Stored EA game id is not valid");
  if (property.installPath === null) {
    throw new ConnectorError("launch.not-installed", "The EA game has no install folder");
  }
  if (ctx.launchersResolved) {
    let found = false;
    let failed = false;
    for (const l of ctx.launchers) {
      if (l.declarationId !== "ea-desktop") continue;
      for (const exe of APPS) {
        try {
          if (await ctx.fs.exists(ctx.fs.join(l.path, exe))) found = true;
        } catch (e) {
          if (!isHandled(e)) throw e;
          failed = true; // unreadable is not absent: the URI is safe anyway
        }
      }
    }
    if (!found && !failed) {
      throw new ConnectorError("launch.launcher-missing", "The EA app was not found", {
        messageKey: "connectors.ea.errors.launcherMissing" as I18nKey,
      });
    }
  }
  let ids: string[] = [stored];
  const file = ctx.fs.join(property.installPath, ...INSTALLER_DATA);
  let present: boolean; // if the check itself fails, the stored id alone is still a safe URI
  try {
    present = await ctx.fs.exists(file);
  } catch (e) {
    if (!isHandled(e)) throw e;
    ctx.log.warn("EA installerdata unreadable at launch", { code: e instanceof PathEscapesRootsError ? "link-escapes-roots" : e.code });
    return finish([stored]);
  }
  if (!present) throw fail("launch.not-installed", "installerDataMissing", "installerdata.xml is gone");
  try {
    const data = parseInstallerData(await ctx.fs.readText(file));
    if (data === null) {
      ctx.log.warn("EA installerdata invalid at launch", { code: "store.unexpected-response" });
    } else if (!data.ids.includes(stored)) {
      throw fail("launch.not-installed", "installerDataMissing", "Another game is now in that folder");
    } else {
      // The stored id is searched in the whole list before cutting to 16; the others (not the stored one) follow it.
      ids = [stored, ...data.ids.filter((x) => x !== stored)].slice(0, MAX_IDS);
    }
  } catch (e) {
    if (e instanceof ConnectorError && e.code === "launch.not-installed") throw e;
    if (!isHandled(e)) throw e;
    // Unreadable, too big or outside the roots: the stored id alone. Only a code is logged.
    ctx.log.warn("EA installerdata unreadable at launch", { code: e instanceof PathEscapesRootsError ? "link-escapes-roots" : e.code });
  }
  return finish(ids);
}

function finish(ids: readonly string[]): LaunchSpec {
  const uri = `origin2://game/launch?offerIds=${ids.join(",")}`;
  if (!URI_RE.test(uri)) throw new ConnectorError("internal", "Built an invalid EA URI");
  return { kind: "uri", uri };
}
