// EA login constants, session reading and the GraphQL call (ADR 82, points 2, 4 and 5).
// Only the access token and its expiry are stored: no refresh token exists in this flow and cookies are never kept.
import { ConnectorError, makeSecret, type I18nKey, type Secret, type SyncContext } from "@ludiary/contracts";

// Public constants of the EA web token endpoint (Lutris, Origin for Galaxy); not secrets, but a client identifier (ADR 82, point 13).
export const CAPTURE_URL = "https://accounts.ea.com/connect/auth?client_id=ORIGIN_JS_SDK&response_type=token&redirect_uri=nucleus:rest&prompt=none";
export const GRAPHQL_URL = "https://service-aggregation-layer.juno.ea.com/graphql";
/** Accepted shape of the access token (assumption EAA5); the redactor's pattern is a superset of it. */
export const TOKEN_RE = /^[A-Za-z0-9+/=_.-]{64,4096}$/; // 4096: the core's field limit (ADR 74)
/** Assumption EAA6: the token lives about 60 minutes; 10 minutes of margin. */
export const TOKEN_TTL_MS = 50 * 60_000;

export const k = (s: string): I18nKey => `connectors.ea.${s}` as I18nKey;

export const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

export const expiredError = (what: string): ConnectorError =>
  new ConnectorError("auth.expired", `${what} rejected the EA session`, { messageKey: k("error.expired") });
export const loginError = (): ConnectorError =>
  new ConnectorError("auth.invalid", "EA did not accept the sign-in", { messageKey: k("error.login") });

/** 429 with Retry-After, anything else unexpected. */
export function throwForStatus(res: { status: number; headers: Readonly<Record<string, string>> }, what: string): never {
  if (res.status === 429) {
    const secs = Number(res.headers["retry-after"]);
    const ms = Number.isFinite(secs) && secs >= 0 ? Math.min(secs, 3600) * 1000 : undefined;
    throw new ConnectorError("store.rate-limited", `${what} answered 429`, ms === undefined ? {} : { retryAfterMs: ms });
  }
  throw new ConnectorError("store.unexpected-response", `${what} answered ${res.status}`);
}


export interface Session {
  readonly token: Secret;
  readonly expiresAt: number;
}

/** Both stored values, or null if either is missing or unreadable. */
export async function readSession(ctx: Pick<SyncContext, "secrets">): Promise<Session | null> {
  const [token, exp] = [await ctx.secrets.get("accessToken"), await ctx.secrets.get("accessTokenExpiresAt")];
  if (token === null) return null;
  const expiresAt = exp === null ? NaN : Number(exp.reveal());
  return Number.isFinite(expiresAt) ? { token, expiresAt } : { token, expiresAt: 0 };
}

type Http = Pick<SyncContext, "http" | "log">["http"];

/**
 * One GraphQL call, in series and without retries. The POST is the first try; if EA refuses it (404, 405 or 415, assumption
 * EAA7) the same call is made once as a GET, as Lutris does, and the caller keeps using GET. The URL is never logged.
 * `rejected` builds the error for 401/403. Returns the `data` object.
 */
export class EaGraphql {
  private viaGet = false;
  constructor(
    private readonly http: Http,
    private readonly token: Secret,
    private readonly rejected: () => ConnectorError,
    private readonly log?: { warn(msg: string, fields?: Record<string, string | number | boolean>): void },
  ) {}

  async query(query: string, variables: Record<string, unknown>, what: string): Promise<Record<string, unknown>> {
    const headers = { authorization: makeSecret("Bearer " + this.token.reveal()) };
    let res = this.viaGet ? await this.get(query, variables, headers) : await this.http.request({ method: "POST", url: GRAPHQL_URL, headers, body: { json: { query, variables } } });
    if (!this.viaGet && [404, 405, 415].includes(res.status)) {
      this.viaGet = true;
      res = await this.get(query, variables, headers);
    }
    if (res.status === 401 || res.status === 403) throw this.rejected();
    if (res.status !== 200) throwForStatus(res, what);
    const body = await res.json();
    const errors = isObject(body) ? body["errors"] : undefined;
    if (!isObject(body) || (Array.isArray(errors) ? errors.length > 0 : errors != null) || !isObject(body["data"])) {
      // Counters and a short code only (ADR 82, point 5): the free message can echo offer or account ids.
      const first: unknown = Array.isArray(errors) ? errors[0] : undefined;
      const ext = isObject(first) && isObject(first["extensions"]) ? first["extensions"] : {};
      const raw = ext["code"] ?? ext["classification"];
      const code = typeof raw === "string" && /^[A-Z_]{1,40}$/.test(raw) ? raw : "";
      this.log?.warn("EA graphql errors", { what, count: Array.isArray(errors) ? errors.length : 0, code });
      throw new ConnectorError("store.unexpected-response", `${what} answer has errors or no data`);
    }
    return body["data"];
  }

  private get(query: string, variables: Record<string, unknown>, headers: { authorization: Secret }) {
    const q = new URLSearchParams({ query, variables: JSON.stringify(variables) });
    return this.http.request({ method: "GET", url: `${GRAPHQL_URL}?${q.toString()}`, headers });
  }
}

/** The visible player name for the wizard (assumption EAA8); null if absent. Never the person ids. */
export async function fetchDisplayName(ctx: Pick<SyncContext, "http" | "log">, token: Secret): Promise<string | null> {
  const data = await new EaGraphql(ctx.http, token, loginError).query("query{me{player{displayName}}}", {}, "EA identity");
  const me = data["me"];
  if (!isObject(me)) throw new ConnectorError("store.unexpected-response", "EA identity answer has no me");
  const player = me["player"];
  const raw = isObject(player) ? player["displayName"] : undefined; // no player: connected without a name
  // eslint-disable-next-line no-control-regex
  const name = typeof raw === "string" ? raw.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 64) : "";
  return name === "" ? null : name;
}
