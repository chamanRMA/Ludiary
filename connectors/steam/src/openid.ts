// Steam OpenID 2.0 (ADR 74, point 3). Out: checkid_setup URL. Back: the 8 checks, then check_authentication.
// The assertion grants no access to the account; it only proves which SteamID the user owns.
import { ConnectorError, type HttpClient, type I18nKey } from "@ludiary/contracts";

export const OPENID_ENDPOINT = "https://steamcommunity.com/openid/login";
const NS = "http://specs.openid.net/auth/2.0";
const IDENTIFIER_SELECT = "http://specs.openid.net/auth/2.0/identifier_select";
const CLAIMED_RE = /^https:\/\/steamcommunity\.com\/openid\/id\/(7656119\d{10})$/;
const NONCE_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})Z/;
const REQUIRED_SIGNED = ["op_endpoint", "claimed_id", "identity", "return_to", "response_nonce", "assoc_handle"];
const MAX_AGE_MS = 5 * 60_000;
const MAX_FUTURE_MS = 60_000;

const K_OPENID = "connectors.steam.error.openid" as I18nKey;

const invalid = (why: string): ConnectorError =>
  // `why` is a fixed English phrase (never assertion data): it can reach the log.
  new ConnectorError("auth.invalid", `Steam OpenID assertion rejected: ${why}`, { messageKey: K_OPENID });

/** The URL the wizard sends the user to. realm = origin of callbackUrl + "/". */
export function buildLoginUrl(callbackUrl: string): string {
  const realm = new URL(callbackUrl).origin + "/";
  const q = new URLSearchParams({
    "openid.ns": NS,
    "openid.mode": "checkid_setup",
    "openid.return_to": callbackUrl,
    "openid.realm": realm,
    "openid.identity": IDENTIFIER_SELECT,
    "openid.claimed_id": IDENTIFIER_SELECT,
  });
  return `${OPENID_ENDPOINT}?${q.toString()}`;
}

function nonceTime(nonce: string): number {
  const m = NONCE_RE.exec(nonce);
  if (!m) return NaN;
  const [, y, mo, d, h, mi, s] = m.map(Number) as number[];
  const t = Date.UTC(y!, mo! - 1, d!, h!, mi!, s!);
  // Date.UTC rolls 13th months or 31st of February over: only an exact round trip is a real date.
  return new Date(t).toISOString().slice(0, 19) + "Z" === m[0] ? t : NaN;
}

/** Fields of a key:value-per-line reply. A repeated key makes the reply ambiguous: null. */
function parseKeyValue(text: string): Map<string, string> | null {
  const out = new Map<string, string>();
  for (const line of text.split(/\r?\n/)) {
    if (line === "") continue;
    const i = line.indexOf(":");
    if (i <= 0) return null;
    const k = line.slice(0, i);
    if (out.has(k)) return null;
    out.set(k, line.slice(i + 1));
  }
  return out;
}

/**
 * Verifies the assertion that came back to callbackUrl and returns the SteamID64. Throws ConnectorError:
 * 'auth.required' (login.cancelled) when the user cancelled, 'auth.invalid' (error.openid) for any other failure.
 */
export async function verifyAssertion(
  query: Readonly<Record<string, string>>,
  ctx: { callbackUrl: string; now(): number; http: HttpClient },
): Promise<string> {
  const q = (name: string): string | undefined => (Object.hasOwn(query, name) ? query[name] : undefined);

  const mode = q("openid.mode");
  if (mode === "cancel") {
    throw new ConnectorError("auth.required", "The user cancelled the Steam login", {
      messageKey: "connectors.steam.login.cancelled" as I18nKey,
    });
  }
  if (mode !== "id_res") throw invalid("mode");
  if (q("openid.ns") !== NS) throw invalid("ns");
  if (q("openid.op_endpoint") !== OPENID_ENDPOINT) throw invalid("op_endpoint");
  if (q("openid.return_to") !== ctx.callbackUrl) throw invalid("return_to");

  const claimed = q("openid.claimed_id");
  const m = claimed === undefined ? null : CLAIMED_RE.exec(claimed);
  if (!m || q("openid.identity") !== claimed) throw invalid("claimed_id");
  const steamId = m[1] as string;

  const signed = (q("openid.signed") ?? "").split(",");
  if (!REQUIRED_SIGNED.every((f) => signed.includes(f))) throw invalid("signed");
  if (!q("openid.sig")) throw invalid("sig");

  const age = ctx.now() - nonceTime(q("openid.response_nonce") ?? "");
  if (!(age <= MAX_AGE_MS && age >= -MAX_FUTURE_MS)) throw invalid("response_nonce");

  // Exactly what Steam sent, with the mode changed. Other parameters are never forwarded.
  const form: Record<string, string> = {};
  for (const [k, v] of Object.entries(query)) if (k.startsWith("openid.")) form[k] = v;
  form["openid.mode"] = "check_authentication";
  const res = await ctx.http.request({ method: "POST", url: OPENID_ENDPOINT, body: { form } });
  if (res.status !== 200) throw invalid("check_authentication status");
  const fields = parseKeyValue(await res.text());
  if (fields?.get("ns") !== NS || fields.get("is_valid") !== "true") throw invalid("check_authentication reply");
  return steamId;
}
