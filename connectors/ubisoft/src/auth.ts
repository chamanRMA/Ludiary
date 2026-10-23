// Ubisoft login URL and session renewal over plain HTTP (ADR 80, points 7 and 8).
// Only the rememberMeTicket is stored; ticket and sessionId live in memory for one operation.
import { ConnectorError, makeSecret, type I18nKey, type Secret, type SyncContext } from "@ludiary/contracts";

// Public identifiers of the Ubisoft web login, the same for everyone (Lutris, util/ubisoft/consts.py). They travel in the
// public login URL, so they are not secrets of ADR invariant 5. Assumption UB13: the session born with this appId renews
// with the same Ubi-AppId. Galaxy's pair is plan B.
export const APP_ID = "82b650c0-6cb3-40c0-9f41-25a53b62b206";
export const GENOME_ID = "42d07c95-9914-4450-8b38-267c4e462b21";

export const SESSIONS_URL = "https://public-ubiservices.ubi.com/v3/profiles/sessions";
/** Accepted shape of rememberMeTicket and ticket (assumption UB3); the redactor's pattern is a superset of it. */
export const TICKET_RE = /^[A-Za-z0-9+/=_.-]{64,8192}$/;
const SESSION_ID_RE = /^[0-9a-fA-F]{8}-([0-9a-fA-F]{4}-){3}[0-9a-fA-F]{12}$/;

export const k = (s: string): I18nKey => `connectors.ubisoft.${s}` as I18nKey;

export function loginUrl(locale: string): string {
  const q = new URLSearchParams({
    appId: APP_ID,
    genomeId: GENOME_ID,
    lang: locale.toLowerCase().startsWith("es") ? "es-ES" : "en-US",
    nextUrl: "https://connect.ubisoft.com/ready",
  });
  return `https://connect.ubisoft.com/login?${q.toString()}`;
}

export const expiredError = (what: string): ConnectorError =>
  new ConnectorError("auth.expired", `${what} rejected the Ubisoft session`, { messageKey: k("error.expired") });
export const loginError = (): ConnectorError =>
  new ConnectorError("auth.invalid", "Ubisoft did not accept the sign-in", { messageKey: k("error.login") });

/** 429 with Retry-After, anything else unexpected. */
export function throwForStatus(res: { status: number; headers: Readonly<Record<string, string>> }, what: string): never {
  if (res.status === 429) {
    const secs = Number(res.headers["retry-after"]);
    const ms = Number.isFinite(secs) && secs >= 0 ? Math.min(secs, 3600) * 1000 : undefined;
    throw new ConnectorError("store.rate-limited", `${what} answered 429`, ms === undefined ? {} : { retryAfterMs: ms });
  }
  throw new ConnectorError("store.unexpected-response", `${what} answered ${res.status}`);
}

export interface Renewed {
  readonly ticket: Secret;
  readonly sessionId: Secret;
  /** A valid rememberMeTicket different from the one sent; null if none came. */
  readonly rotated: Secret | null;
  readonly name: string | null;
}

/**
 * POST v3/profiles/sessions with the rememberMeTicket (assumption UB4). `rejected` builds the error for 400/401/403 and for a
 * second-factor request; the caller decides (auth.expired in sync, auth.invalid in the wizard). Saving the rotated ticket is the
 * caller's first step, before it uses the access ticket.
 */
export async function renew(ctx: Pick<SyncContext, "http" | "log">, rm: Secret, rejected: () => ConnectorError): Promise<Renewed> {
  const res = await ctx.http.request({
    method: "POST",
    url: SESSIONS_URL,
    headers: { "ubi-appid": APP_ID, authorization: makeSecret("rm_v1 t=" + rm.reveal()) },
    body: { json: { rememberMe: true } },
  });
  if (res.status === 400 || res.status === 401 || res.status === 403) throw rejected();
  if (res.status !== 200) throwForStatus(res, "Ubisoft sessions");
  const body = await res.json();
  const o = typeof body === "object" && body !== null && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
  const [ticket, sessionId, remember] = [o["ticket"], o["sessionId"], o["rememberMeTicket"]];
  if ((typeof ticket !== "string" || ticket === "") && o["twoFactorAuthenticationTicket"]) throw rejected(); // Ubisoft asks for the second factor
  if (typeof ticket !== "string" || !TICKET_RE.test(ticket) || typeof sessionId !== "string" || !SESSION_ID_RE.test(sessionId)) {
    throw new ConnectorError("store.unexpected-response", "Ubisoft sessions answer has no valid ticket and session");
  }
  if (remember !== undefined && remember !== null && (typeof remember !== "string" || !TICKET_RE.test(remember))) {
    throw new ConnectorError("store.unexpected-response", "Ubisoft sessions answer has a malformed rememberMeTicket");
  }
  const rotated = typeof remember === "string" && remember !== rm.reveal() ? makeSecret(remember) : null;
  ctx.log.info("Ubisoft session renewed", { rotated: rotated !== null, hasExpiration: o["expiration"] !== undefined });
  // eslint-disable-next-line no-control-regex
  const name = typeof o["nameOnPlatform"] === "string" ? o["nameOnPlatform"].replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 64) : "";
  return { ticket: makeSecret(ticket), sessionId: makeSecret(sessionId), rotated, name: name === "" ? null : name };
}

/** Renews for listLibrary: rotated ticket saved FIRST, then the session is handed back. */
export async function refreshSession(ctx: SyncContext): Promise<Renewed> {
  const stored = await ctx.secrets.get("rememberMeTicket");
  if (stored === null) throw new ConnectorError("auth.required", "Ubisoft is not connected");
  const r = await renew(ctx, stored, () => expiredError("Ubisoft sessions"));
  if (r.rotated !== null) await ctx.secrets.set("rememberMeTicket", r.rotated);
  return r;
}
