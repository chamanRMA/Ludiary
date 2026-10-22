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

const MAX_ARGS = 64;
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f]/;

const fail = (code: "action.unsupported" | "launch.not-installed", key: string, msg: string): ConnectorError =>
  new ConnectorError(code, msg, { messageKey: `connectors.gog.errors.${key}` as I18nKey });

/** Relative path inside the game folder: no drive, no leading separator, no ':' and no control characters. */
const isRelative = (p: string): boolean => p !== "" && !p.startsWith("\\") && !p.startsWith("/") && !p.includes(":") && !CONTROL.test(p);

/**
 * play -> exec of the primary FileTask of goggame-<id>.info, read now (ADR 76, point 4). A '..' is not filtered here:
 * the core confines the exec to installPath.
 */
export async function resolveGogAction(
  property: StoredProperty,
  action: GameAction,
  ctx: LaunchContext,
): Promise<LaunchSpec | null> {
  if (action !== "play") return null;
  const id = property.storeGameId;
  if (id === null) return null;
  if (!PRODUCT_ID_RE.test(id)) throw fail("action.unsupported", "invalidId", "Stored GOG game id is not numeric");
  const installPath = property.installPath;
  if (installPath === null) throw fail("launch.not-installed", "infoMissing", "GOG game has no install path");

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
