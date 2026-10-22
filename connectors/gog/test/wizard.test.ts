import { fakeHttp, sentHeaders, sentQuery, wizardContext, type MemoryVault } from "@ludiary/connector-testkit";
import { ConnectorError } from "@ludiary/contracts";
import { describe, expect, it } from "vitest";
import { createGogConnector } from "../src";
import { GOG_CLIENT_ID, GOG_CLIENT_SECRET, GOG_REDIRECT_URI } from "../src/auth";
import { ACCESS, CODE, readJson, REFRESH, REFRESH_2, tokenBody } from "./helpers";

const wiz = createGogConnector().connection!;
const HOSTS = ["auth.gog.com", "embed.gog.com"];
type Answer = { status: number; body?: unknown; headers?: Record<string, string> };

const userOk: Answer = { status: 200, body: { ...(readJson("account", "user-data.json") as object), email: "someone@example.invalid" } };
function gog(token: Answer = { status: 200, body: tokenBody() }, user: Answer = userOk) {
  return fakeHttp((r) => (r.url.startsWith("https://auth.gog.com/token") ? token : user), { hosts: HOSTS });
}
const fields = (redirectUrl: string) => ({ kind: "fields", values: { redirectUrl } }) as const;
const failure = async (p: Promise<unknown>): Promise<ConnectorError> => {
  const e = await p.then(() => null, (x: unknown) => x);
  expect(e).toBeInstanceOf(ConnectorError);
  return e as ConnectorError;
};
const stored = (ctx: { secrets: unknown }) => (ctx.secrets as MemoryVault).values;

describe("GOG wizard (ADR 77, points 3 and 4)", () => {
  it("start: one step with the exact login URL and a paste field extracting the code", async () => {
    const step = await wiz.start(wizardContext({}));
    expect(step).toMatchObject({
      kind: "open-external",
      id: "login",
      awaits: "input",
      fields: [{ name: "redirectUrl", secret: true, paste: true, extract: "url-query:code", pattern: "^[A-Za-z0-9_-]{10,512}$", maxLength: 2048 }],
    });
    const url = new URL((step as { url: string }).url);
    expect([url.origin, url.pathname]).toEqual(["https://auth.gog.com", "/auth"]);
    expect(Object.fromEntries(url.searchParams)).toEqual({ client_id: GOG_CLIENT_ID, redirect_uri: GOG_REDIRECT_URI, response_type: "code", layout: "client2" });
    expect(url.search).toContain("redirect_uri=https%3A%2F%2Fembed.gog.com%2Fon_login_success%3Forigin%3Dclient");
    expect(createGogConnector().authHosts).toContain(url.hostname);
  });

  it("exchanges the code, stores only the refresh token once and returns the name", async () => {
    const http = gog();
    const ctx = wizardContext({ http });
    const done = await wiz.submit(ctx, "login", fields(` ${CODE}\n`));
    expect(done).toEqual({ kind: "done", accountLabel: "TestUser" });
    expect([...stored(ctx)]).toEqual([["refreshToken", REFRESH_2]]);
    expect((ctx.secrets as MemoryVault).sets).toEqual(["refreshToken"]);

    const [exchange, user] = http.requests;
    expect(exchange!.url).toBe("https://auth.gog.com/token");
    expect(sentQuery(exchange!)).toEqual({
      client_id: GOG_CLIENT_ID,
      client_secret: GOG_CLIENT_SECRET,
      grant_type: "authorization_code",
      code: CODE,
      redirect_uri: GOG_REDIRECT_URI,
    });
    expect(user!.url).toBe("https://embed.gog.com/userData.json");
    expect(sentHeaders(user!)).toEqual({ authorization: `Bearer ${ACCESS}` });
    // Secrets are redacted in everything that serialises the request; nothing sensitive reaches the log.
    for (const r of http.requests) expect(JSON.stringify(r)).not.toMatch(new RegExp(`${CODE}|${ACCESS}|${REFRESH_2}`));
    expect(ctx.wizardState.values.size).toBe(0); // neither the code nor a token ever sits in the wizard state
    expect(JSON.stringify(ctx.logs)).not.toMatch(/TestUser|someone@|gog-test/);
  });

  it("a code with a bad format is rejected before any call", async () => {
    const http = gog();
    for (const bad of ["", "short", "a b c d e f g h i j", "x".repeat(513), "code=" + CODE]) {
      const e = await failure(wiz.submit(wizardContext({ http }), "login", fields(bad)));
      expect([e.code, e.details.messageKey]).toEqual(["auth.invalid", "connectors.gog.error.code"]);
    }
    expect(http.requests).toHaveLength(0);
  });

  it.each([400, 401])("a %i on the exchange is auth.invalid with error.code and nothing is stored", async (status) => {
    const ctx = wizardContext({ http: gog({ status }) });
    const e = await failure(wiz.submit(ctx, "login", fields(CODE)));
    expect([e.code, e.details.messageKey]).toEqual(["auth.invalid", "connectors.gog.error.code"]);
    expect(stored(ctx).size).toBe(0);
  });

  it("429 keeps Retry-After; 500, 403 and bad bodies are unexpected", async () => {
    const limited = await failure(wiz.submit(wizardContext({ http: gog({ status: 429, headers: { "Retry-After": "30" } }) }), "login", fields(CODE)));
    expect([limited.code, limited.details.retryAfterMs]).toEqual(["store.rate-limited", 30_000]);
    for (const token of [
      { status: 500 },
      { status: 403 },
      { status: 200, body: { access_token: ACCESS } },
      { status: 200, body: { access_token: ACCESS, refresh_token: "bad token!" } },
      { status: 200, body: { access_token: "short-token", refresh_token: REFRESH } },
      { status: 200, body: { access_token: 5, refresh_token: REFRESH } },
      { status: 200, body: "<html>" },
    ]) {
      const ctx = wizardContext({ http: gog(token) });
      expect((await failure(wiz.submit(ctx, "login", fields(CODE)))).code).toBe("store.unexpected-response");
      expect(stored(ctx).size).toBe(0);
    }
  });

  it("a network error keeps its code", async () => {
    const down = fakeHttp(() => {
      throw new ConnectorError("network.unavailable", "down");
    });
    expect((await failure(wiz.submit(wizardContext({ http: down }), "login", fields(CODE)))).code).toBe("network.unavailable");
  });

  it.each([
    ["500", { status: 500 }],
    ["not JSON", { status: 200, body: "<html>" }],
    ["no username", { status: 200, body: { email: "someone@example.invalid" } }],
    ["empty name", { status: 200, body: { username: " \n" } }],
  ])("if userData.json fails (%s) the connection goes on without a name", async (_n, user) => {
    const ctx = wizardContext({ http: gog(undefined, user) });
    expect(await wiz.submit(ctx, "login", fields(CODE))).toEqual({ kind: "done" });
    expect([...stored(ctx).keys()]).toEqual(["refreshToken"]);
  });

  it("the name is cleaned and cut to 64", async () => {
    const user = { status: 200, body: { username: "Te\u0007st\n" + "x".repeat(100) } };
    const done = await wiz.submit(wizardContext({ http: gog(undefined, user) }), "login", fields(CODE));
    expect((done as { accountLabel: string }).accountLabel).toBe(("Test" + "x".repeat(100)).slice(0, 64));
  });

  it("wrong step or input is 'internal'", async () => {
    const ctx = wizardContext({ http: gog() });
    for (const [step, input] of [["login", { kind: "continue" }], ["nope", fields(CODE)]] as const) {
      expect((await failure(wiz.submit(ctx, step, input))).code).toBe("internal");
    }
  });

  it("status is local; disconnect deletes only refreshToken", async () => {
    const http = gog();
    expect(await wiz.status(wizardContext({ http, secrets: { refreshToken: REFRESH } }))).toEqual({ state: "connected" });
    expect(await wiz.status(wizardContext({ http }))).toEqual({ state: "expired" });
    expect(http.requests).toHaveLength(0);
    const ctx = wizardContext({ secrets: { refreshToken: REFRESH, other: "keep" } });
    await wiz.disconnect(ctx);
    expect([...stored(ctx).keys()]).toEqual(["other"]);
  });
});
