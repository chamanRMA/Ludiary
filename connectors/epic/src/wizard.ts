// Epic connection wizard (ADR 78, point 7): one step, open the official login and paste the page it ends on.
// The core extracts `authorizationCode` from the pasted JSON and applies the pattern; this file checks it again.
// The other members of that JSON (exchangeCode, sid) are never read.
import { ConnectorError, makeSecret, type ConnectionWizard, type I18nKey, type SyncContext, type WizardContext, type WizardInput, type WizardStep } from "@ludiary/contracts";
import { EPIC_LOGIN_URL, exchangeCode } from "./auth";

const CODE_RE = /^[0-9a-f]{32}$/;
const k = (s: string): I18nKey => `connectors.epic.${s}` as I18nKey;

const STEP_LOGIN: WizardStep = {
  kind: "open-external",
  id: "login",
  titleKey: k("login.title"),
  bodyKey: k("login.body"),
  url: EPIC_LOGIN_URL,
  awaits: "input",
  fields: [
    { name: "authorizationCode", labelKey: k("login.field"), secret: true, paste: true, extract: "json-field:authorizationCode", pattern: CODE_RE.source, maxLength: 4096 },
  ],
};

const wrongInput = (): ConnectorError => new ConnectorError("internal", "Unexpected input for this wizard step");

export const epicConnection: ConnectionWizard = {
  async start() {
    return STEP_LOGIN;
  },

  async submit(ctx: WizardContext, stepId: string, input: WizardInput) {
    if (stepId !== "login" || input.kind !== "fields") throw wrongInput();
    const raw = input.values["authorizationCode"]?.trim() ?? "";
    if (!CODE_RE.test(raw)) {
      throw new ConnectorError("auth.invalid", "The authorization code does not have the expected format", { messageKey: k("error.code") });
    }
    const tokens = await exchangeCode(ctx, makeSecret(raw));
    await ctx.secrets.set("refreshToken", tokens.refresh);
    // Seconds only (assumption EA5): not personal data.
    ctx.log.info("Epic session stored", { refreshExpires: tokens.refreshExpires ?? -1, accessExpires: tokens.accessExpires ?? -1 });
    return tokens.displayName === null ? { kind: "done" } : { kind: "done", accountLabel: tokens.displayName };
  },

  async status(ctx: SyncContext) {
    return { state: (await ctx.secrets.get("refreshToken")) !== null ? "connected" : "expired" };
  },

  async disconnect(ctx: SyncContext) {
    await ctx.secrets.delete("refreshToken");
  },
};
