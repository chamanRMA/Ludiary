// Steam connection wizard (ADR 74, point 4): choose -> login (OpenID) -> apikey -> [profile] -> done.
// steamId and apiKey wait in ctx.wizardState (memory only) until the test call succeeds, then go to ctx.secrets.
import {
  ConnectorError,
  makeSecret,
  type ConnectionWizard,
  type HttpClient,
  type I18nKey,
  type Secret,
  type SyncContext,
  type WizardContext,
  type WizardDone,
  type WizardInput,
  type WizardStep,
} from "@ludiary/contracts";
import { fetchOwnedGames, isPrivateResponse, throwForStatus } from "./library";
import { buildLoginUrl, verifyAssertion } from "./openid";

const KEY_PAGE = "https://steamcommunity.com/dev/apikey";
const SUMMARIES_URL = "https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/";
const KEY_RE = /^[0-9A-Fa-f]{32}$/;
const k = (s: string): I18nKey => `connectors.steam.${s}` as I18nKey;

const STEP_CHOOSE: WizardStep = { kind: "info", id: "choose", titleKey: k("choose.title"), bodyKey: k("choose.body") };
const STEP_PROFILE: WizardStep = { kind: "info", id: "profile", titleKey: k("profile.title"), bodyKey: k("profile.body") };
const STEP_APIKEY: WizardStep = {
  kind: "open-external",
  id: "apikey",
  titleKey: k("apikey.title"),
  bodyKey: k("apikey.body"),
  url: KEY_PAGE,
  awaits: "input",
  fields: [{ name: "apiKey", labelKey: k("apikey.field"), secret: true, paste: true, pattern: KEY_RE.source, maxLength: 64 }],
};

const wrongInput = (): ConnectorError => new ConnectorError("internal", "Unexpected input for this wizard step");

/** Only personaname is read from the profile (ADR 74, point 12). null on any failure: the connection goes on without a name. */
async function fetchPersonaName(http: HttpClient, steamId: Secret, apiKey: Secret): Promise<string | null> {
  const res = await http.request({
    method: "GET",
    url: SUMMARIES_URL,
    headers: { "x-webapi-key": apiKey },
    query: { steamids: steamId, format: "json" },
  });
  throwForStatus(res, "GetPlayerSummaries");
  const body = (await res.json()) as { response?: { players?: unknown } } | null;
  const players = body?.response?.players;
  const name = Array.isArray(players) ? (players[0] as { personaname?: unknown } | undefined)?.personaname : undefined;
  // eslint-disable-next-line no-control-regex
  const clean = typeof name === "string" ? name.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 64) : "";
  return clean === "" ? null : clean;
}

/** The test call. Returns the next step if the profile is private, or done with the stored secrets. */
async function testAndFinish(ctx: WizardContext, steamId: Secret, apiKey: Secret): Promise<WizardStep | WizardDone> {
  const response = await fetchOwnedGames(ctx.http, steamId, apiKey, false);
  await ctx.wizardState.set("apiKey", apiKey);
  if (isPrivateResponse(response)) return STEP_PROFILE;

  await ctx.secrets.set("steamId", steamId);
  await ctx.secrets.set("apiKey", apiKey);
  let accountLabel: string | null = null;
  try {
    accountLabel = await fetchPersonaName(ctx.http, steamId, apiKey);
  } catch (e) {
    ctx.log.info("Steam account name not available", { code: e instanceof ConnectorError ? e.code : "unknown" });
  }
  return accountLabel === null ? { kind: "done" } : { kind: "done", accountLabel };
}

export const steamConnection: ConnectionWizard = {
  async start() {
    return STEP_CHOOSE;
  },

  async submit(ctx: WizardContext, stepId: string, input: WizardInput) {
    const steamId = await ctx.wizardState.get("steamId");
    switch (stepId) {
      case "choose":
        if (input.kind !== "continue") throw wrongInput();
        return { kind: "open-external", id: "login", titleKey: k("login.title"), bodyKey: k("login.body"), url: buildLoginUrl(ctx.callbackUrl), awaits: "callback" } as const;

      case "login": {
        if (input.kind !== "callback") throw wrongInput();
        const id = await verifyAssertion(input.query, ctx);
        await ctx.wizardState.set("steamId", id);
        return STEP_APIKEY;
      }

      case "apikey": {
        if (input.kind !== "fields" || !steamId) throw wrongInput();
        const raw = input.values["apiKey"]?.trim() ?? "";
        if (!KEY_RE.test(raw)) {
          throw new ConnectorError("auth.invalid", "The API key does not have the expected format", { messageKey: k("error.format") });
        }
        return testAndFinish(ctx, steamId, makeSecret(raw));
      }

      case "profile": {
        const apiKey = await ctx.wizardState.get("apiKey");
        if (input.kind !== "continue" || !steamId || !apiKey) throw wrongInput();
        return testAndFinish(ctx, steamId, apiKey);
      }

      default:
        throw wrongInput();
    }
  },

  async status(ctx: SyncContext) {
    const ok = (await ctx.secrets.get("steamId")) !== null && (await ctx.secrets.get("apiKey")) !== null;
    return { state: ok ? "connected" : "expired" };
  },

  async disconnect(ctx: SyncContext) {
    await ctx.secrets.delete("steamId");
    await ctx.secrets.delete("apiKey");
  },
};
