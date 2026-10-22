import { ConnectorError } from "@ludiary/contracts";

export const PRODUCT_ID_RE = /^\d{1,20}$/;

export interface GogPlayTask {
  readonly isPrimary: boolean;
  readonly type: string | undefined;
  readonly path: string | undefined;
  readonly workingDir: string | undefined;
  readonly arguments: string | undefined;
}
export interface GogInfo {
  readonly gameId: string;
  readonly rootGameId: string | undefined;
  readonly name: string | undefined;
  readonly playTasks: readonly GogPlayTask[];
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown): string | undefined => (typeof v === "string" ? v : undefined);
// Some files may write ids as numbers.
const id = (v: unknown): string | undefined =>
  typeof v === "number" && Number.isSafeInteger(v) && v >= 0
    ? String(v)
    : typeof v === "string" && PRODUCT_ID_RE.test(v)
      ? v
      : undefined;

/** Parses goggame-<id>.info (JSON, maybe with BOM). Throws 'store.unexpected-response' if it has no usable gameId. */
export function parseGogInfo(text: string): GogInfo {
  let raw: unknown;
  try {
    raw = JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text);
  } catch {
    throw new ConnectorError("store.unexpected-response", "goggame info is not JSON");
  }
  const gameId = isObject(raw) ? id(raw["gameId"]) : undefined;
  if (!isObject(raw) || gameId === undefined) {
    throw new ConnectorError("store.unexpected-response", "goggame info has no usable gameId");
  }
  const tasks = Array.isArray(raw["playTasks"]) ? raw["playTasks"] : [];
  return {
    gameId,
    rootGameId: id(raw["rootGameId"]),
    name: str(raw["name"])?.trim() || undefined,
    playTasks: tasks.filter(isObject).map((t) => ({
      isPrimary: t["isPrimary"] === true,
      type: str(t["type"]),
      path: str(t["path"]),
      workingDir: str(t["workingDir"]),
      arguments: str(t["arguments"]),
    })),
  };
}
