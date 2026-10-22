import { fakeHttp, sentHeaders, sentQuery, wizardContext, type MemoryVault } from "@ludiary/connector-testkit";
import { ConnectorError, type WizardContext } from "@ludiary/contracts";
import { describe, expect, it } from "vitest";
import { createSteamConnector } from "../src";
import { API_KEY, CALLBACK, NOW, readFixture, readJson, STEAM_ID } from "./helpers";

const wiz = createSteamConnector().connection!;
const assertion = readJson<Record<string, string>>("openid", "assertion-valid.json");
const ownedPublic = { status: 200, body: readJson("owned", "owned-games.json") };
const ownedPrivate = { status: 200, body: readJson("owned", "owned-games-private.json") };
const summaries = { status: 200, body: readJson("summaries", "player-summaries.json") };

type Answer = { status: number; body?: unknown };
/** A Steam double that answers by endpoint; `owned` and `summ` may change between calls. */
function steam(a: { owned?: Answer; summ?: Answer; openid?: Answer } = {}) {
  const state = { owned: a.owned ?? ownedPublic, summ: a.summ ?? summaries, openid: a.openid ?? { status: 200, body: readFixture("openid", "check-authentication-valid.txt") } };
  const http = fakeHttp(
    (req) => (req.url.includes("GetOwnedGames") ? state.owned : req.url.includes("GetPlayerSummaries") ? state.summ : state.openid),
    { hosts: ["api.steampowered.com", "steamcommunity.com"] },
  );
  return { http, state };
}
const ctxFor = (http: ReturnType<typeof fakeHttp>, state: Record<string, string> = {}) => wizardContext({ http, now: NOW, callbackUrl: CALLBACK, state });
const fields = (apiKey: string) => ({ kind: "fields", values: { apiKey } }) as const;
const failure = async (p: Promise<unknown>): Promise<ConnectorError> => {
  const e = await p.then(() => null, (x: unknown) => x);
  expect(e).toBeInstanceOf(ConnectorError);
  return e as ConnectorError;
};
const stored = (ctx: WizardContext) => (ctx.secrets as MemoryVault).values;

describe("Steam wizard (ADR 74, point 4)", () => {
  it("walks choose -> login -> apikey -> done", async () => {
    const { http } = steam();
    const ctx = ctxFor(http);

    const choose = await wiz.start(ctx);
    expect(choose).toMatchObject({ kind: "info", id: "choose" });

    const login = await wiz.submit(ctx, "choose", { kind: "continue" });
    expect(login).toMatchObject({ kind: "open-external", id: "login", awaits: "callback" });
    const url = new URL((login as { url: string }).url);
    expect(url.host).toBe("steamcommunity.com");
    expect(url.searchParams.get("openid.return_to")).toBe(CALLBACK);

    const apikey = await wiz.submit(ctx, "login", { kind: "callback", query: assertion });
    expect(apikey).toMatchObject({
      kind: "open-external",
      id: "apikey",
      url: "https://steamcommunity.com/dev/apikey",
      awaits: "input",
      fields: [{ name: "apiKey", secret: true, paste: true, pattern: "^[0-9A-Fa-f]{32}$", maxLength: 64 }],
    });
    expect(stored(ctx).size).toBe(0); // nothing leaves the wizard state until the key works

    const done = await wiz.submit(ctx, "apikey", fields(` ${API_KEY}\n`));
    expect(done).toEqual({ kind: "done", accountLabel: "TestPersona" });
    expect([...stored(ctx)]).toEqual([["steamId", STEAM_ID], ["apiKey", API_KEY]]);
    expect((ctx.secrets as MemoryVault).sets).toEqual(["steamId", "apiKey"]);
  });

  it("every step the wizard returns passes the core's rules (key prefix, https auth host, field limits)", async () => {
    const { http } = steam();
    const ctx = ctxFor(http);
    const c = createSteamConnector();
    const steps = [
      await wiz.start(ctx),
      await wiz.submit(ctx, "choose", { kind: "continue" }),
      await wiz.submit(ctx, "login", { kind: "callback", query: assertion }),
    ];
    for (const s of steps) {
      expect(s).toMatchObject({ id: expect.stringMatching(/^[a-z][a-z0-9-]{0,31}$/) });
      const keys = [(s as { titleKey: string }).titleKey, (s as { bodyKey: string }).bodyKey];
      for (const k of keys) expect(k.startsWith("connectors.steam.")).toBe(true);
      if (s.kind === "open-external") {
        const u = new URL(s.url);
        expect(u.protocol).toBe("https:");
        expect(c.authHosts).toContain(u.hostname);
        for (const f of s.fields ?? []) expect(() => new RegExp(f.pattern ?? "")).not.toThrow();
      }
    }
  });

  it("the key travels in x-webapi-key and not in the URL; the test call has include_appinfo=false", async () => {
    const { http } = steam();
    const ctx = ctxFor(http, { steamId: STEAM_ID });
    await wiz.submit(ctx, "apikey", fields(API_KEY));
    const owned = http.requests.find((r) => r.url.includes("GetOwnedGames"))!;
    expect(sentHeaders(owned)).toEqual({ "x-webapi-key": API_KEY });
    expect(sentQuery(owned)["include_appinfo"]).toBe("false");
    for (const r of http.requests) {
      expect(r.url).not.toContain(API_KEY);
      expect(JSON.stringify(r)).not.toContain(API_KEY);
      expect(JSON.stringify(r)).not.toContain(STEAM_ID);
    }
    expect(JSON.stringify(ctx.logs)).not.toMatch(new RegExp(`${API_KEY}|${STEAM_ID}|TestPersona`));
  });

  it("a key with a bad format is rejected before any call", async () => {
    const { http } = steam();
    for (const bad of ["", "abc", API_KEY + "0", API_KEY.slice(1), API_KEY.replace("0", "g"), `${API_KEY} ${API_KEY}`]) {
      const ctx = ctxFor(http, { steamId: STEAM_ID });
      const e = await failure(wiz.submit(ctx, "apikey", fields(bad)));
      expect(e.code).toBe("auth.invalid");
      expect(e.details.messageKey).toBe("connectors.steam.error.format");
    }
    expect(http.requests).toHaveLength(0);
  });

  it.each([401, 403])("a %i on the test call is auth.invalid with error.key and nothing is stored", async (status) => {
    const { http } = steam({ owned: { status } });
    const ctx = ctxFor(http, { steamId: STEAM_ID });
    const e = await failure(wiz.submit(ctx, "apikey", fields(API_KEY)));
    expect([e.code, e.details.messageKey]).toEqual(["auth.invalid", "connectors.steam.error.key"]);
    expect(stored(ctx).size).toBe(0);
  });

  it("429 and network errors keep their code", async () => {
    const limited = ctxFor(steam({ owned: { status: 429 } }).http, { steamId: STEAM_ID });
    expect((await failure(wiz.submit(limited, "apikey", fields(API_KEY)))).code).toBe("store.rate-limited");
    const down = fakeHttp(() => {
      throw new ConnectorError("network.unavailable", "down");
    });
    expect((await failure(wiz.submit(ctxFor(down, { steamId: STEAM_ID }), "apikey", fields(API_KEY)))).code).toBe("network.unavailable");
  });

  it("a private profile goes to the profile step; Continue retries with the key kept in the wizard state", async () => {
    const { http, state } = steam({ owned: ownedPrivate });
    const ctx = ctxFor(http, { steamId: STEAM_ID });

    expect(await wiz.submit(ctx, "apikey", fields(API_KEY))).toMatchObject({ kind: "info", id: "profile" });
    expect(stored(ctx).size).toBe(0);
    expect(ctx.wizardState.values.get("apiKey")).toBe(API_KEY);

    // Still private: stays on the profile step.
    expect(await wiz.submit(ctx, "profile", { kind: "continue" })).toMatchObject({ id: "profile" });
    expect(stored(ctx).size).toBe(0);

    state.owned = ownedPublic;
    expect(await wiz.submit(ctx, "profile", { kind: "continue" })).toMatchObject({ kind: "done" });
    expect([...stored(ctx).keys()]).toEqual(["steamId", "apiKey"]);
  });

  it("the account name is the only profile field read, and it is only returned as accountLabel", async () => {
    const { http } = steam();
    const ctx = ctxFor(http, { steamId: STEAM_ID });
    const done = await wiz.submit(ctx, "apikey", fields(API_KEY));
    expect(done).toEqual({ kind: "done", accountLabel: "TestPersona" });
    const summ = http.requests.find((r) => r.url.includes("GetPlayerSummaries"))!;
    expect(summ.url).toBe("https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/");
    expect(sentQuery(summ)["steamids"]).toBe(STEAM_ID);
    expect(sentHeaders(summ)).toEqual({ "x-webapi-key": API_KEY });
    // Nothing else of the profile reaches the vault or the log.
    expect([...stored(ctx).keys()]).toEqual(["steamId", "apiKey"]);
    expect(JSON.stringify([...stored(ctx).values(), ctx.logs])).not.toMatch(/Fictional|avatar|ZZ|profiles/);
  });

  it.each([
    ["500", { status: 500 }],
    ["403", { status: 403 }],
    ["a body without players", { status: 200, body: { response: {} } }],
    ["an empty name", { status: 200, body: { response: { players: [{ personaname: "  \n" }] } } }],
    ["not JSON", { status: 200, body: "<html>" }],
  ])("if the profile call fails (%s) the connection goes on without a name", async (_n, summ) => {
    const { http } = steam({ summ });
    const ctx = ctxFor(http, { steamId: STEAM_ID });
    expect(await wiz.submit(ctx, "apikey", fields(API_KEY))).toEqual({ kind: "done" });
    expect([...stored(ctx).keys()]).toEqual(["steamId", "apiKey"]);
  });

  it("a name with control characters is cleaned and one that is too long is cut", async () => {
    const summ = { status: 200, body: { response: { players: [{ personaname: "Te\u0007st\n" + "x".repeat(100) }] } } };
    const done = await wiz.submit(ctxFor(steam({ summ }).http, { steamId: STEAM_ID }), "apikey", fields(API_KEY));
    expect((done as { accountLabel: string }).accountLabel).toBe(("Test" + "x".repeat(100)).slice(0, 64));
  });

  it("login failures: cancel is auth.required, a bad assertion auth.invalid; no secret is stored", async () => {
    const { http } = steam({ openid: { status: 200, body: readFixture("openid", "check-authentication-invalid.txt") } });
    const ctx = ctxFor(http);
    expect((await failure(wiz.submit(ctx, "login", { kind: "callback", query: assertion }))).details.messageKey).toBe("connectors.steam.error.openid");
    expect((await failure(wiz.submit(ctx, "login", { kind: "callback", query: { "openid.mode": "cancel" } }))).code).toBe("auth.required");
    expect(ctx.wizardState.values.size + stored(ctx).size).toBe(0);
  });

  it("input that does not fit the step is 'internal' (a core bug), and so is an unknown step", async () => {
    const { http } = steam();
    const ctx = ctxFor(http, { steamId: STEAM_ID });
    for (const [step, input] of [
      ["choose", fields(API_KEY)],
      ["login", { kind: "continue" }],
      ["apikey", { kind: "continue" }],
      ["profile", { kind: "continue" }], // no key in the state
      ["nope", { kind: "continue" }],
    ] as const) {
      expect((await failure(wiz.submit(ctx, step, input))).code).toBe("internal");
    }
    // apikey before login: no SteamID in the state.
    expect((await failure(wiz.submit(ctxFor(http), "apikey", fields(API_KEY)))).code).toBe("internal");
    expect(http.requests).toHaveLength(0);
  });

  it("status is local: connected with both secrets, expired without either", async () => {
    const http = fakeHttp(() => ({ status: 500 }));
    const withBoth = wizardContext({ http, secrets: { steamId: STEAM_ID, apiKey: API_KEY } });
    expect(await wiz.status(withBoth)).toEqual({ state: "connected" });
    expect(await wiz.status(wizardContext({ http, secrets: { steamId: STEAM_ID } }))).toEqual({ state: "expired" });
    expect(await wiz.status(wizardContext({ http, secrets: { apiKey: API_KEY } }))).toEqual({ state: "expired" });
    expect(http.requests).toHaveLength(0);
  });

  it("disconnect deletes steamId and apiKey", async () => {
    const ctx = wizardContext({ secrets: { steamId: STEAM_ID, apiKey: API_KEY, other: "keep" } });
    await wiz.disconnect(ctx);
    expect([...(ctx.secrets as MemoryVault).values.keys()]).toEqual(["other"]);
  });
});
