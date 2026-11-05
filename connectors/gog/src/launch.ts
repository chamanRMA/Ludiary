import {
  ConnectorError,
  type GameAction,
  type I18nKey,
  type LaunchContext,
  type LaunchSpec,
  type StoredProperty,
} from "@ludiary/contracts";
import { splitWindowsArgs } from "./args";
import { parseGogInfo, PRODUCT_ID_RE } from "./info";
import { GOG_GALAXY_CLIENT } from "./manifest";

const MAX_ARGS = 64;
const GALAXY_EXE = GOG_GALAXY_CLIENT.executable!; // one source with the manifest (ADR 76 point 12.5)
// A space before '-' or '/' could read as another Galaxy option if GG1 fails in part (ADR 76, point 13.4).
const LOOKS_LIKE_OPTION = / [-/]/;
// Drive roots keep their separator: "C:\" is not "C:".
const stripTrailingSep = (p: string): string => (/^[A-Za-z]:[\\/]$/.test(p) ? p : p.replace(/[\\/]+$/, ""));
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f]/;

const fail = (code: "action.unsupported" | "launch.not-installed", key: string, msg: string): ConnectorError =>
  new ConnectorError(code, msg, { messageKey: `connectors.gog.errors.${key}` as I18nKey });

/** Relative path inside the game folder: no drive, no leading separator, no ':', no control characters and no '..' segment. */
const isRelative = (p: string): boolean =>
  p !== "" && !p.startsWith("\\") && !p.startsWith("/") && !p.includes(":") && !CONTROL.test(p) && !p.split(/[\\/]/).includes("..");

/** Galaxy's folder when GalaxyClient.exe is inside it (ADR 76, points 7 and 12.2); null if it cannot be proved. */
async function findGalaxy(ctx: LaunchContext): Promise<string | null> {
  for (const l of ctx.launchers) {
    if (l.declarationId === "gog-galaxy-client" && (await ctx.fs.exists(ctx.fs.join(l.path, GALAXY_EXE)))) return l.path;
  }
  return null;
}

/**
 * install -> goggalaxy://openGameView/<id> (ADR 77, GA8). play -> exec of the primary FileTask of goggame-<id>.info, read now (ADR 76, point 4). Paths with a '..' segment are
 * rejected here (the core also confines the exec).
 */
export async function resolveGogAction(
  property: StoredProperty,
  action: GameAction,
  ctx: LaunchContext,
): Promise<LaunchSpec | null> {
  if (action !== "play" && action !== "install") return null;
  const id = property.storeGameId;
  if (id === null) return null;
  if (!PRODUCT_ID_RE.test(id)) throw fail("action.unsupported", "invalidId", "Stored GOG game id is not numeric");
  if (action === "install") {
    // Opens the game page in Galaxy; nothing is installed without the user confirming there (ADR 77, point 7).
    if (ctx.launchersResolved && (await findGalaxy(ctx)) === null) {
      throw new ConnectorError("launch.launcher-missing", "GOG Galaxy was not found", {
        messageKey: "connectors.gog.errors.galaxyMissing" as I18nKey,
      });
    }
    return { kind: "uri", uri: `goggalaxy://openGameView/${id}` };
  }
  const installPath = property.installPath;
  if (installPath === null) throw fail("launch.not-installed", "infoMissing", "GOG game has no install path");

  if (ctx.launchMode === "client" && !LOOKS_LIKE_OPTION.test(installPath)) {
    // Galaxy opens the game itself, so the .info is not read (ADR 76, point 12.6).
    const galaxy = ctx.launchersResolved ? await findGalaxy(ctx) : null;
    if (galaxy !== null) {
      const args = ["/launchViaAutostart", `/gameId=${id}`, "/command=runGame", `/path=${stripTrailingSep(installPath)}`];
      return { kind: "exec", executable: ctx.fs.join(galaxy, GALAXY_EXE), args, cwd: galaxy };
    }
    ctx.log.info("Galaxy not found, launching directly", { connector: "gog" });
  }

  const infoFile = ctx.fs.join(installPath, `goggame-${id}.info`);
  if (!(await ctx.fs.exists(infoFile))) throw fail("launch.not-installed", "infoMissing", "goggame info not found");
  const info = parseGogInfo(await ctx.fs.readText(infoFile)); // malformed -> store.unexpected-response

  const task = info.playTasks.find((t) => t.isPrimary && (t.type === undefined || t.type === "FileTask") && t.path !== undefined);
  if (task?.path === undefined) throw fail("action.unsupported", "noPlayTask", "No primary play task");
  if (!isRelative(task.path)) throw fail("action.unsupported", "invalidTask", "Task path is not relative");
  if (!task.path.toLowerCase().endsWith(".exe")) {
    throw fail("action.unsupported", "unsupportedExecutable", "Task is not an .exe");
  }

  let cwd = installPath;
  if (task.workingDir !== undefined && task.workingDir !== "") {
    if (!isRelative(task.workingDir)) throw fail("action.unsupported", "invalidTask", "Working directory is not relative");
    cwd = ctx.fs.join(installPath, task.workingDir);
  }
  const args = task.arguments === undefined ? [] : splitWindowsArgs(task.arguments);
  if (args.length > MAX_ARGS) throw fail("action.unsupported", "invalidTask", "Too many arguments");

  return { kind: "exec", executable: ctx.fs.join(installPath, task.path), args, cwd };
}
