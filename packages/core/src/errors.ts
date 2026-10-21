import type { ConnectorErrorCode, I18nKey, I18nParams } from "@ludiary/contracts";
import { ConnectorError } from "@ludiary/contracts";
import type { CoreErrorCode, CoreErrorInfo } from "./model";

export const asKey = (s: string): I18nKey => s as I18nKey;

const CORE_CODES: readonly string[] = [
  "not-found",
  "not-installed",
  "action-unavailable",
  "launch.rejected",
  "launch.launcher-missing",
  "busy",
  "invalid-input",
  "picker-unavailable",
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
  return new CoreError(info.code, e instanceof Error ? e.message : "Unknown error", {
    key: info.key,
    ...(info.params ? { params: info.params } : {}),
  });
}
