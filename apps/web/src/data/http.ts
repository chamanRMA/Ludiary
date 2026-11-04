import type { I18nParams, TranslatedErrorDto } from "@ludiary/api-contract";

/** `/open.js` (served by the local server) stores the origin key here after the one-time link is redeemed (ADR 67). */
export const ORIGIN_KEY_STORAGE = "ludiary.originKey";
/** Header the server checks together with the session cookie on every route except /api/status (ADR 67, 72). */
export const ORIGIN_KEY_HEADER = "X-Ludiary-Origin-Key";

/** What the UI must tell the user when the server refuses us with a 401. */
export type AuthIssue = "origin-key-required" | "session-required";

/** Tiny observable holder so a React component can show the 401 notice (no event bus needed). */
export interface AuthIssueStore {
  get(): AuthIssue | null;
  set(issue: AuthIssue | null): void;
  subscribe(listener: () => void): () => void;
}

export function createAuthIssueStore(): AuthIssueStore {
  let current: AuthIssue | null = null;
  const listeners = new Set<() => void>();
  return {
    get: () => current,
    set(issue) {
      if (issue === current) return;
      current = issue;
      listeners.forEach((l) => l());
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  };
}

/** Shared by the real client and the notice component. */
export const authIssues: AuthIssueStore = createAuthIssueStore();

/** Server refusal or transport failure. `key` is always a translation key (invariant 6); `message` is for developers. */
export class ApiError extends Error {
  /** HTTP status, or 0 when the server could not be reached. */
  readonly status: number;
  /** Machine code: `ApiErrorDto.error`, or `detail.code` when the server sent one. */
  readonly code: string;
  readonly key: string;
  readonly params?: I18nParams;
  constructor(status: number, code: string, key: string, params?: I18nParams) {
    super(`HTTP ${status} ${code}`);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.key = key;
    if (params) this.params = params;
  }
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** Reads the `{ error, detail? }` body (ApiErrorDto) defensively: the body may be empty or not JSON. */
function parseErrorBody(text: string): { error?: string; detail?: TranslatedErrorDto } {
  try {
    const body: unknown = JSON.parse(text);
    if (!isRecord(body)) return {};
    const out: { error?: string; detail?: TranslatedErrorDto } = {};
    if (typeof body["error"] === "string") out.error = body["error"];
    const d = body["detail"];
    if (isRecord(d) && typeof d["code"] === "string" && typeof d["key"] === "string") {
      const params = isRecord(d["params"]) ? (d["params"] as Record<string, string | number>) : undefined;
      out.detail = { code: d["code"], key: d["key"], ...(params ? { params } : {}) };
    }
    return out;
  } catch {
    return {};
  }
}

export interface Http {
  get<T>(path: string): Promise<T>;
  /** `body` undefined sends no body and no Content-Type (needed by POST /api/onboarding/reset). Schema routes want at least `{}`. */
  post<T>(path: string, body?: unknown): Promise<T>;
  patch<T>(path: string, body: unknown): Promise<T>;
  put<T>(path: string, body: unknown): Promise<T>;
  delete(path: string): Promise<void>;
}

export interface KeyStorage {
  getItem(key: string): string | null;
  removeItem(key: string): void;
}

export interface HttpOptions {
  fetch?: typeof fetch;
  storage?: KeyStorage | null;
  issues?: AuthIssueStore;
}

function defaultStorage(): KeyStorage | null {
  try {
    if (typeof localStorage !== "undefined") return localStorage;
  } catch {
    /* storage blocked */
  }
  return null;
}

/** `fetch` wrapper: origin-key header, JSON, same-origin cookie, 401 handling and translatable errors (ADR 72). */
export function createHttp(options: HttpOptions = {}): Http {
  const issues = options.issues ?? authIssues;
  const storage = options.storage === undefined ? defaultStorage() : options.storage;

  async function request(method: string, path: string, body?: unknown): Promise<unknown> {
    const headers: Record<string, string> = { Accept: "application/json" };
    let key: string | null = null;
    try {
      key = storage?.getItem(ORIGIN_KEY_STORAGE) ?? null;
    } catch {
      /* storage blocked: the server will answer 401 and the notice explains it */
    }
    if (key) headers[ORIGIN_KEY_HEADER] = key;
    const init: RequestInit = { method, headers, credentials: "same-origin", cache: "no-store" };
    if (body !== undefined) {
      headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(body);
    }

    let res: Response;
    try {
      res = await (options.fetch ?? globalThis.fetch)(path, init);
    } catch {
      throw new ApiError(0, "unreachable", "errors.unreachable");
    }

    const text = res.status === 204 ? "" : await res.text();
    if (res.ok) {
      issues.set(null);
      return text === "" ? undefined : (JSON.parse(text) as unknown);
    }

    const parsed = parseErrorBody(text);
    const code = parsed.error ?? "unknown";
    if (res.status === 401) {
      if (code === "origin_key_required") {
        // The stored key is wrong or missing: drop it so a stale value is not sent again.
        try {
          storage?.removeItem(ORIGIN_KEY_STORAGE);
        } catch {
          /* ignore */
        }
        issues.set("origin-key-required");
        throw new ApiError(401, code, "auth.originKeyRequired");
      }
      issues.set("session-required");
      throw new ApiError(401, code, "auth.sessionRequired");
    }
    if (parsed.detail) throw new ApiError(res.status, parsed.detail.code, parsed.detail.key, parsed.detail.params);
    throw new ApiError(res.status, code, res.status === 404 ? "core.errors.not-found" : "errors.generic");
  }

  return {
    get: (path) => request("GET", path) as Promise<never>,
    post: (path, body) => request("POST", path, body) as Promise<never>,
    patch: (path, body) => request("PATCH", path, body) as Promise<never>,
    put: (path, body) => request("PUT", path, body) as Promise<never>,
    delete: async (path) => void (await request("DELETE", path)),
  };
}
