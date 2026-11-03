import type { ConnectorErrorCode, I18nKey, I18nParams, StoreId } from "@ludiary/contracts";
import { ConnectorError } from "@ludiary/contracts";
import type { CoreErrorCode, CoreErrorInfo } from "./model";

export const asKey = (s: string): I18nKey => s as I18nKey;

const CORE_CODES: readonly string[] = [
  "not-found",
  "not-installed",
  "action-unavailable",
  "launch.rejected",
  "launch.denied",
  "launch.launcher-missing",
  "busy",
  "invalid-input",
  "name-taken",
  "collection-managed",
  "limit-reached",
  "picker-unavailable",
  "backup.busy",
  "backup.no-folder",
  "backup.folder-unavailable",
  "backup.write-failed",
  "backup.not-found",
  "backup.too-large",
  "backup.corrupt",
  "backup.not-ludiary",
  "backup.too-new",
];

/** Default translation key of an error code: core codes under `core.errors.*`, connector codes under `connectors.common.errors.*`. */
export function defaultKey(code: ConnectorErrorCode | CoreErrorCode): I18nKey {
  return asKey(CORE_CODES.includes(code) && code !== "launch.launcher-missing" ? `core.errors.${code}` : `connectors.common.errors.${code}`);
}

/** Typed domain error (ADR 72). `message` is English for developers; the UI shows `key` with `params`. */
export class CoreError extends Error {
  readonly code: ConnectorErrorCode | CoreErrorCode;
  readonly key: I18nKey;
  readonly params?: I18nParams;
  constructor(
    code: ConnectorErrorCode | CoreErrorCode,
    message: string,
    opts: { key?: I18nKey; params?: I18nParams; cause?: unknown } = {},
  ) {
    super(message, opts.cause !== undefined ? { cause: opts.cause } : undefined);
    this.name = "CoreError";
    this.code = code;
    this.key = opts.key ?? defaultKey(code);
    if (opts.params) this.params = opts.params;
  }
  info(): CoreErrorInfo {
    return { code: this.code, key: this.key, ...(this.params ? { params: this.params } : {}) };
  }
}

/** Anything thrown by a connector becomes a ConnectorError-shaped info; unknown exceptions become 'internal' (ADR 40 rule 1). */
export function toErrorInfo(e: unknown): CoreErrorInfo {
  if (e instanceof CoreError) return e.info();
  if (e instanceof ConnectorError) {
    return {
      code: e.code,
      key: e.details.messageKey ?? defaultKey(e.code),
      ...(e.details.params ? { params: e.details.params } : {}),
    };
  }
  return { code: "internal", key: defaultKey("internal") };
}

/** Maps what a connector threw in resolveAction to a CoreError. */
export function toCoreError(e: unknown): CoreError {
  if (e instanceof CoreError) return e;
  const info = toErrorInfo(e);
  // Only a ConnectorError message is our own text; any other exception may quote store data (ADR 87 point 13).
  return new CoreError(info.code, e instanceof ConnectorError ? e.message : "Unexpected internal error", {
    key: info.key,
    ...(info.params ? { params: info.params } : {}),
  });
}

/** ADR 85. `max` goes to the translated text. */
export type LimitName = "tagsPerGame" | "tags" | "collections" | "gamesPerCollection";
export const limitReached = (max: number, what: LimitName): CoreError =>
  new CoreError("limit-reached", `User data limit reached: ${what}`, { key: asKey(`core.errors.limit-reached.${what}`), params: { max } });
/** Brand names for texts with a {store} parameter (proper names, not translated). */
const STORE_NAMES: Record<StoreId, string> = { steam: "Steam", gog: "GOG", epic: "Epic Games", ubisoft: "Ubisoft Connect", ea: "EA" };
/** ADR 88. A mirror of a store's collection is read-only in Ludiary. */
export const collectionManaged = (store: StoreId): CoreError =>
  new CoreError("collection-managed", "This collection comes from a store and is read-only", { key: asKey("core.errors.collectionManaged"), params: { store: STORE_NAMES[store] } });
export const nameTaken = (): CoreError => new CoreError("name-taken", "Another collection already has this name");

/** ADR 89 point 9. The message is fixed English: it never quotes a path or text of the file. */
export const backupError = (code: Extract<CoreErrorCode, `backup.${string}`>): CoreError => new CoreError(code, `Backup error: ${code}`);
