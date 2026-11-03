// IsThereAnyDeal key wizard (ADR 86, point 6): info -> open-external with a secret field -> check. The key waits in
// ctx.wizardState; the core stores it (point 15, A1). This package never writes ctx.secrets here.
import { ConnectorError, makeSecret, type ConnectionWizard, type I18nKey, type WizardStep } from "@ludiary/contracts";
import { itadRequest } from "./client";
import { ITAD_SHOP_IDS } from "./shops";

export const ITAD_KEY_PAGE = "https://isthereanydeal.com/apps/my/";
const KEY_RE = /^[A-Za-z0-9_-]{16,128}$/; // ITAD7: format not published, permissive
const k = (s: string): I18nKey => `connectors.itad.${s}` as I18nKey;

const STEP_INFO: WizardStep = { kind: "info", id: "intro", titleKey: k("intro.title"), bodyKey: k("intro.body") };
const STEP_KEY: WizardStep = {
  kind: "open-external",
  id: "apikey",
  titleKey: k("apikey.title"),
  bodyKey: k("apikey.body"),
  url: ITAD_KEY_PAGE,
  awaits: "input",
  fields: [{ name: "apiKey", labelKey: k("apikey.field"), secret: true, paste: true, pattern: KEY_RE.source, maxLength: 128 }],
};

const wrongInput = (): ConnectorError => new ConnectorError("internal", "Unexpected input for this wizard step");

export const itadConnection: ConnectionWizard = {
  async start() {
    return STEP_INFO;
  },

  async submit(ctx, stepId, input) {
    if (stepId === "intro") {
      if (input.kind !== "continue") throw wrongInput();
      return STEP_KEY;
    }
    if (stepId !== "apikey" || input.kind !== "fields") throw wrongInput();
    const raw = input.values["apiKey"]?.trim() ?? "";
    if (!KEY_RE.test(raw)) {
      throw new ConnectorError("auth.invalid", "The API key does not have the expected format", { messageKey: k("errors.format") });
    }
    const key = makeSecret(raw);
    // One cheap call; 401/403 -> auth.invalid on this same step (the engine keeps the step).
    await itadRequest(ctx, key, { method: "POST", path: `/lookup/id/shop/${ITAD_SHOP_IDS.steam}/v1`, json: ["app/220"] });
    await ctx.wizardState.set("apiKey", key);
    return { kind: "done" };
  },

  // Not used for services: the core derives the state (point 15).
  async status(ctx) {
    return { state: (await ctx.secrets.get("apiKey")) ? "connected" : "disconnected" };
  },

  // Nothing to do: no tool sessions. The core deletes the scope, the cache and the links.
  async disconnect() {},
};
