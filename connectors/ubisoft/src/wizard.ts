// Ubisoft connection wizard (ADR 80, point 7): one embedded-login step. The connector only describes the window;
// the core opens it and hands the captured rememberMeTicket back as `embedded` input.
import {
  ConnectorError,
  type ConnectionWizard,
  type SyncContext,
  type WizardContext,
  type WizardInput,
  type WizardStep,
} from "@ludiary/contracts";
import { k, loginError, loginUrl, renew, TICKET_RE } from "./auth";

export const loginStep = (locale: string): WizardStep => ({
  kind: "embedded-login",
  id: "login",
  titleKey: k("login.title"),
  bodyKey: k("login.body"),
  windowTitleKey: k("login.window"),
  url: loginUrl(locale),
  doneUrl: "https://connect.ubisoft.com/ready",
  captureUrl: "https://connect.ubisoft.com/login",
  // Assumption UB2: which of the two keys holds rememberMeTicket is unverified, so both are read.
  capture: [{ name: "rememberMeTicket", storageKeys: ["PRODrememberMe", "PRODloginData"], jsonField: "rememberMeTicket", pattern: TICKET_RE.source, maxLength: 8192 }],
});

export const ubisoftConnection: ConnectionWizard = {
  async start(ctx: WizardContext) {
    return loginStep(ctx.locale);
  },

  async submit(ctx: WizardContext, stepId: string, input: WizardInput) {
    if (stepId !== "login" || input.kind !== "embedded") throw new ConnectorError("internal", "Unexpected input for this wizard step");
    const captured = input.values["rememberMeTicket"];
    if (captured === undefined || !TICKET_RE.test(captured.reveal())) throw loginError();
    // The renewal proves the session. The ticket and sessionId it returns are dropped.
    const r = await renew(ctx, captured, loginError);
    await ctx.secrets.set("rememberMeTicket", r.rotated ?? captured);
    return r.name === null ? { kind: "done" } : { kind: "done", accountLabel: r.name };
  },

  async status(ctx: SyncContext) {
    return { state: (await ctx.secrets.get("rememberMeTicket")) !== null ? "connected" : "expired" };
  },

  async disconnect(ctx: SyncContext) {
    await ctx.secrets.delete("rememberMeTicket");
  },
};
