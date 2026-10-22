// GOG login, code exchange and session renewal over plain HTTP (ADR 77, points 2, 3 and 5).
// Only the refresh token is stored; the access token lives in memory for one operation.
import { ConnectorError, makeSecret, type I18nKey, type Secret, type SyncContext } from "@ludiary/contracts";
import { retryAfterMs } from "./media";

// Public client of GOG Galaxy, the same for every Galaxy install and published in its binary and in many repositories
// (gogapidocs, gogdl, Heroic, Lutris). Without the user's login it grants nothing, so it is not a secret of ADR invariant 5
// (ADR 77, point 2). Assumption GA1: GOG tolerates third parties presenting it.
export const GOG_CLIENT_ID = "46899977096215655";
export const GOG_CLIENT_SECRET = "9d85c43b1482497dbbce61f6e4aa173a433796eeae2ca8c5f6129f2dc4de46d9";
export const GOG_REDIRECT_URI = "https://embed.gog.com/on_login_success?origin=client";
export const GOG_TOKEN_URL = "https://auth.gog.com/token";

export const GOG_LOGIN_URL =
  "https://auth.gog.com/auth?" +
  new URLSearchParams({ client_id: GOG_CLIENT_ID, redirect_uri: GOG_REDIRECT_URI, response_type: "code", layout: "client2" }).toString();

const TOKEN_RE = /^[A-Za-z0-9_-]{64,4096}$/;
const k = (s: string): I18nKey => `connectors.gog.${s}` as I18nKey;

export interface GogTokens {
  readonly access: Secret;
  readonly refresh: Secret;
}

/** Statuses every GOG call treats alike: 429 with Retry-After, anything else unexpected. */
export function throwForStatus(res: { status: number; headers: Readonly<Record<string, string>> }, what: string): never {
  if (res.status === 429) {
    const ms = retryAfterMs(res.headers);
    throw new ConnectorError("store.rate-limited", `${what} answered 429`, ms === undefined ? {} : { retryAfterMs: ms });
  }
  throw new ConnectorError("store.unexpected-response", `${what} answered ${res.status}`);
}

export const expiredError = (what: string): ConnectorError =>
  new ConnectorError("auth.expired", `${what} rejected the GOG session`, { messageKey: k("error.expired") });

async function tokenRequest(
  ctx: Pick<SyncContext, "http">,
  params: Record<string, string | Secret>,
  rejectedStatuses: readonly number[],
  rejected: () => ConnectorError,
): Promise<GogTokens> {
  const res = await ctx.http.request({
    method: "GET",
    url: GOG_TOKEN_URL,
    query: { client_id: GOG_CLIENT_ID, client_secret: GOG_CLIENT_SECRET, ...params },
  });
  if (rejectedStatuses.includes(res.status)) throw rejected();
  if (res.status !== 200) throwForStatus(res, "GOG token");
  const body = await res.json();
  const o = typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
  const [access, refresh] = [o["access_token"], o["refresh_token"]];
  if (typeof access !== "string" || typeof refresh !== "string" || !TOKEN_RE.test(access) || !TOKEN_RE.test(refresh)) {
    throw new ConnectorError("store.unexpected-response", "GOG token answer has no valid tokens");
  }
  return { access: makeSecret(access), refresh: makeSecret(refresh) };
}

/** Code -> tokens. 400/401 (expired, used or mis-copied code) is auth.invalid. */
export const exchangeCode = (ctx: Pick<SyncContext, "http">, code: Secret): Promise<GogTokens> =>
  tokenRequest(ctx, { grant_type: "authorization_code", code, redirect_uri: GOG_REDIRECT_URI }, [400, 401], () =>
    new ConnectorError("auth.invalid", "GOG rejected the authorization code", { messageKey: k("error.code") }),
  );

/**
 * Renews the session and returns the access token. The rotated refresh token is saved BEFORE anything uses the
 * access token: GOG may invalidate the old one (GA4) and a crash in between would lose the session.
 */
export async function refreshSession(ctx: SyncContext): Promise<Secret> {
  const stored = await ctx.secrets.get("refreshToken");
  if (stored === null) throw new ConnectorError("auth.required", "GOG is not connected");
  const tokens = await tokenRequest(ctx, { grant_type: "refresh_token", refresh_token: stored }, [400, 401, 403], () => expiredError("GOG token"));
  await ctx.secrets.set("refreshToken", tokens.refresh);
  return tokens.access;
}

export const bearer = (access: Secret): Secret => makeSecret("Bearer " + access.reveal());
