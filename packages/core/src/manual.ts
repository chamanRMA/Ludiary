// Manual games (ADR 93): the executable comes from a native dialog, never from the API. Checks of the dialog result.
import { isStrictLocalPath } from "@ludiary/contracts";
import { asKey, CoreError } from "./errors";
import type { Env } from "./env";

const MAX_PATH = 32_767;
const GENERIC_FOLDERS = new Set(["bin", "bin32", "bin64", "binaries", "x64", "x86", "win32", "win64", "game"]);
const EXE = /\.exe$/i;

/** Folder of a strict local path (backslashes only, see `isStrictLocalPath`); a file at a drive root gives `X:\`. */
export function parentOf(path: string): string {
  const i = path.lastIndexOf("\\");
  return i <= 2 ? path.slice(0, 3) : path.slice(0, i);
}

/** ADR 93 point 3: the folder's name, unless it is a drive root or a generic name; then the file name without `.exe`. */
export function manualTitle(path: string): string {
  const parts = path.split(/[\\/]+/).filter((x) => x !== "");
  const file = (parts.pop() ?? "").replace(EXE, "");
  const folder = parts.length > 1 ? parts[parts.length - 1]! : undefined; // parts[0] is the drive
  return folder === undefined || GENERIC_FOLDERS.has(folder.toLowerCase()) ? file : folder;
}

const badFile = (why: string, cause?: unknown): CoreError =>
  new CoreError("invalid-input", `The chosen file is not valid: ${why}`, { key: asKey("core.errors.manual-bad-file"), ...(cause !== undefined ? { cause } : {}) });

/** Checks the dialog result in the order of ADR 93 points 2 and 15. Returns the real path of the executable and its real folder. */
export async function checkPickedExecutable(env: Env, chosen: unknown): Promise<{ executable: string; installPath: string }> {
  const { files } = env.deps;
  // Text only, before touching the disk: a stat of a UNC path opens a network connection.
  if (typeof chosen !== "string" || chosen.length > MAX_PATH || !files.isAbsolute(chosen) || !isStrictLocalPath(chosen)) throw badFile("not a local absolute path");
  if (!EXE.test(chosen)) throw badFile("not an .exe");
  try {
    if (!(await files.scoped([parentOf(chosen)]).exists(chosen)) || (await files.isDirectory(chosen))) throw badFile("not a file");
    const real = await files.realPath(chosen);
    // A mapped drive or SUBST over a share comes out UNC here.
    if (!isStrictLocalPath(real) || !EXE.test(real)) throw badFile("real path is not a local .exe");
    for (const own of env.deps.ownFolders ?? []) if (await files.isInside(real, own)) throw badFile("inside Ludiary's own folders");
    return { executable: real, installPath: parentOf(real) };
  } catch (e) {
    throw e instanceof CoreError ? e : badFile("could not be checked", e);
  }
}
