// GOG connection wizard (ADR 77, points 3 and 4): one step, open the official login and paste the final address.
// The core applies extract 'url-query:code' and the pattern before submit; this file checks them again.
import {
  ConnectorError,
  makeSecret,
  type ConnectionWizard,
  type HttpClient,
  type I18nKey,
  type Secret,
  type SyncContext,
  type WizardContext,
  type WizardInput,
  type WizardStep,
} from "@ludiary/contracts";
import { bearer, exchangeCode, GOG_LOGIN_URL } from "./auth";

const USER_DATA_URL = "https://embed.gog.com/userData.json";
const CODE_RE = /^[A-Za-z0-9_-]{10,512}$/;
const k = (s: string): I18nKey => `connectors.gog.${s}` as I18nKey;

const STEP_LOGIN: WizardStep = {
  kind: "open-external",
  id: "login",
  titleKey: k("login.title"),
  bodyKey: k("login.body"),
  url: GOG_LOGIN_URL,
  awaits: "input",
  fields: [
    { name: "redirectUrl", labelKey: k("login.field"), secret: true, paste: true, extract: "url-query:code", pattern: CODE_RE.source, maxLength: 2048 },
  ],
};

const wrongInput = (): ConnectorError => new ConnectorError("internal", "Unexpected input for this wizard step");

/** Only `username` is read (ADR 77, point 4); the e-mail in the same answer is dropped. null on any failure. */
async function fetchUsername(http: HttpClient, access: Secret): Promise<string | null> {
  const res = await http.request({ method: "GET", url: USER_DATA_URL, headers: { authorization: bearer(access) } });
  if (res.status !== 200) return null;
  const body = (await res.json()) as { username?: unknown } | null;
  // eslint-disable-next-line no-control-regex
  const clean = typeof body?.username === "string" ? body.username.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 64) : "";
  return clean === "" ? null : clean;
}

export const gogConnection: ConnectionWizard = {
  async start() {
    return STEP_LOGIN;
  },

  async submit(ctx: WizardContext, stepId: string, input: WizardInput) {
    if (stepId !== "login" || input.kind !== "fields") throw wrongInput();
    const raw = input.values["redirectUrl"]?.trim() ?? "";
    if (!CODE_RE.test(raw)) {
      throw new ConnectorError("auth.invalid", "The authorization code does not have the expected format", { messageKey: k("error.code") });
    }
    const tokens = await exchangeCode(ctx, makeSecret(raw));
    await ctx.secrets.set("refreshToken", tokens.refresh);
    let accountLabel: string | null = null;
    try {
      accountLabel = await fetchUsername(ctx.http, tokens.access);
    } catch (e) {
      ctx.log.info("GOG account name not available", { code: e instanceof ConnectorError ? e.code : "unknown" });
    }
    return accountLabel === null ? { kind: "done" } : { kind: "done", accountLabel };
  },

  async status(ctx: SyncContext) {
    return { state: (await ctx.secrets.get("refreshToken")) !== null ? "connected" : "expired" };
  },

  async disconnect(ctx: SyncContext) {
    await ctx.secrets.delete("refreshToken");
  },
};
