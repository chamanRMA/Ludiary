// Epic login, code exchange, session renewal and the application token over plain HTTP (ADR 78, points 2, 5 and 7).
// Only the refresh token is stored; the access token lives in memory for one operation.
import { ConnectorError, makeSecret, type I18nKey, type Secret, type SyncContext } from "@ludiary/contracts";
import { isObject, cleanText } from "./ids";

// Public client of the Epic Games launcher, the same for every launcher install and published in legendary, egs-api and
// Playnite. Without the user's login it grants nothing, so it is not a secret of ADR invariant 5 (ADR 78, point 2).
// Assumption EA1: Epic tolerates third parties presenting it. This is the ONLY file where the values may appear.
export const EPIC_CLIENT_ID = "34a02cf8f4414e29b15921876da36f9a";
export const EPIC_CLIENT_SECRET = "daafbccc737745039dffe53d94fc76cf";
export const EPIC_TOKEN_URL = "https://account-public-service-prod03.ol.epicgames.com/account/api/oauth/token";

/** `basic` header value, computed from the two constants (never stored encoded in any file). */
export const basicAuth = (): Secret => makeSecret("basic " + btoa(`${EPIC_CLIENT_ID}:${EPIC_CLIENT_SECRET}`));

const REDIRECT = `https://www.epicgames.com/id/api/redirect?clientId=${EPIC_CLIENT_ID}&responseType=code`;
export const EPIC_LOGIN_URL = "https://www.epicgames.com/id/login?redirectUrl=" + encodeURIComponent(REDIRECT);

const EG1_RE = /^eg1~[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
const validToken = (v: unknown): v is string => typeof v === "string" && v.length >= 16 && v.length <= 8192 && EG1_RE.test(v);
const k = (s: string): I18nKey => `connectors.epic.${s}` as I18nKey;
const CORRECTIVE = "errors.com.epicgames.oauth.corrective_action_required";

export interface EpicTokens {
  readonly access: Secret;
  readonly refresh: Secret;
  readonly displayName: string | null;
  /** Seconds the refresh token lives, if Epic says (assumption EA5). Not personal data. */
  readonly refreshExpires: number | null;
  /** Seconds the access token lives (`expires_in`). Not personal data. */
  readonly accessExpires: number | null;
}

type Res = Awaited<ReturnType<SyncContext["http"]["request"]>>;

/** Retry-After in seconds (the HTTP-date form is ignored). */
export function retryAfterMs(headers: Readonly<Record<string, string>>): number | undefined {
  const raw = Object.entries(headers).find(([n]) => n.toLowerCase() === "retry-after")?.[1];
  if (raw === undefined || !/^\d{1,6}$/.test(raw.trim())) return undefined;
  return Number(raw.trim()) * 1000;
}

/** Statuses every Epic call treats alike: 429 with Retry-After, anything else unexpected. */
export function throwForStatus(res: Pick<Res, "status" | "headers">, what: string): never {
  if (res.status === 429) {
    const ms = retryAfterMs(res.headers);
    throw new ConnectorError("store.rate-limited", `${what} answered 429`, ms === undefined ? {} : { retryAfterMs: ms });
  }
  throw new ConnectorError("store.unexpected-response", `${what} answered ${res.status}`);
}

export const expiredError = (what: string): ConnectorError =>
  new ConnectorError("auth.expired", `${what} rejected the Epic session`, { messageKey: k("error.expired") });

async function post(ctx: Pick<SyncContext, "http">, form: Record<string, string | Secret>): Promise<Res> {
  return ctx.http.request({
    method: "POST",
    url: EPIC_TOKEN_URL,
    headers: { authorization: basicAuth() },
    body: { form: { ...form, token_type: "eg1" } },
  });
}

async function userTokens(res: Res): Promise<EpicTokens> {
  const body = await res.json();
  const o = isObject(body) ? body : {};
  const [access, refresh] = [o["access_token"], o["refresh_token"]];
  if (!validToken(access) || !validToken(refresh)) throw new ConnectorError("store.unexpected-response", "Epic token answer has no valid tokens");
  const name = typeof o["displayName"] === "string" ? cleanText(o["displayName"], 64) : "";
  const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null);
  return {
    access: makeSecret(access),
    refresh: makeSecret(refresh),
    displayName: name === "" ? null : name,
    refreshExpires: num(o["refresh_expires"]),
    accessExpires: num(o["expires_in"]),
  };
}

/** Application token (no user) for the public catalog. Any refusal is 'unexpected' for the batch (ADR 78, point 5). */
export async function appToken(ctx: Pick<SyncContext, "http">): Promise<Secret> {
  const res = await post(ctx, { grant_type: "client_credentials" });
  if (res.status !== 200) throwForStatus(res, "Epic application token");
  const body = await res.json();
  const t = isObject(body) ? body["access_token"] : undefined;
  if (!validToken(t)) throw new ConnectorError("store.unexpected-response", "Epic application token answer is not valid");
  return makeSecret(t);
}

/** Authorization code -> tokens. 400/401 (expired, used or mis-copied code) is auth.invalid. Only `errorCode` of an error body is read. */
export async function exchangeCode(ctx: Pick<SyncContext, "http">, code: Secret): Promise<EpicTokens> {
  const res = await post(ctx, { grant_type: "authorization_code", code });
  if (res.status === 400 || res.status === 401) {
    let corrective = false;
    try {
      const b = await res.json();
      corrective = isObject(b) && b["errorCode"] === CORRECTIVE;
    } catch {
      /* not JSON: plain invalid code */
    }
    throw new ConnectorError("auth.invalid", "Epic rejected the authorization code", { messageKey: k(corrective ? "error.corrective" : "error.code") });
  }
  if (res.status !== 200) throwForStatus(res, "Epic token");
  return userTokens(res);
}

/**
 * Renews the session and returns the access token. The rotated refresh token is saved BEFORE anything uses the
 * access token: Epic hands out a new one on each renewal (EA5) and a crash in between would lose the session.
 */
export async function refreshSession(ctx: SyncContext): Promise<Secret> {
  const stored = await ctx.secrets.get("refreshToken");
  if (stored === null) throw new ConnectorError("auth.required", "Epic is not connected");
  const res = await post(ctx, { grant_type: "refresh_token", refresh_token: stored });
  if (res.status === 400 || res.status === 401 || res.status === 403) throw expiredError("Epic token");
  if (res.status !== 200) throwForStatus(res, "Epic token");
  const tokens = await userTokens(res);
  await ctx.secrets.set("refreshToken", tokens.refresh);
  ctx.log.info("Epic session renewed", { refreshExpires: tokens.refreshExpires ?? -1, accessExpires: tokens.accessExpires ?? -1 });
  return tokens.access;
}

export const bearer = (access: Secret): Secret => makeSecret("bearer " + access.reveal());
