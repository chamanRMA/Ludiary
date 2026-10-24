// EA connection wizard (ADR 82, point 2): one open-external step, as Epic. The user signs in to ea.com in the browser, opens the
// token URL and pastes the JSON it shows. The core extracts `access_token` and applies the pattern; this file checks it again.
import {
  ConnectorError,
  makeSecret,
  type ConnectionWizard,
  type SyncContext,
  type WizardContext,
  type WizardInput,
  type WizardStep,
} from "@ludiary/contracts";
import { CAPTURE_URL, fetchDisplayName, k, readSession, TOKEN_RE, TOKEN_TTL_MS } from "./auth";

export const loginStep = (): WizardStep => ({
  kind: "open-external",
  id: "login",
  titleKey: k("login.title"),
  bodyKey: k("login.body"),
  url: CAPTURE_URL,
  awaits: "input",
  fields: [{ name: "token", labelKey: k("login.field"), secret: true, paste: true, extract: "json-field:access_token", pattern: TOKEN_RE.source, maxLength: 4096 }], // the core caps fields at 4096
});

export const eaConnection: ConnectionWizard = {
  async start(_ctx: WizardContext) {
    return loginStep();
  },

  async submit(ctx: WizardContext, stepId: string, input: WizardInput) {
    if (stepId !== "login" || input.kind !== "fields") throw new ConnectorError("internal", "Unexpected input for this wizard step");
    const raw = input.values["token"]?.trim() ?? "";
    // e.g. {"error":"login_required"} when there is no EA session in the browser
    if (!TOKEN_RE.test(raw)) throw new ConnectorError("auth.invalid", "The pasted text is not an EA token", { messageKey: k("error.token") });
    const token = makeSecret(raw);
    // The identity query proves the token. Nothing is stored if it fails.
    const name = await fetchDisplayName(ctx, token);
    await ctx.secrets.set("accessToken", token);
    await ctx.secrets.set("accessTokenExpiresAt", String(ctx.now() + TOKEN_TTL_MS));
    return name === null ? { kind: "done" } : { kind: "done", accountLabel: name };
  },

  async status(ctx: SyncContext) {
    const s = await readSession(ctx);
    return { state: s !== null && ctx.now() < s.expiresAt ? "connected" : "expired" };
  },

  async disconnect(ctx: SyncContext) {
    await ctx.secrets.delete("accessToken");
    await ctx.secrets.delete("accessTokenExpiresAt");
  },
};
