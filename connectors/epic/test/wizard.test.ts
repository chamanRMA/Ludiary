import { fakeHttp, sentForm, sentHeaders, wizardContext, type MemoryVault } from "@ludiary/connector-testkit";
import { ConnectorError } from "@ludiary/contracts";
import { describe, expect, it } from "vitest";
import { createEpicConnector } from "../src";
import { EPIC_CLIENT_ID, EPIC_CLIENT_SECRET } from "../src/auth";
import { ACCESS, CODE, REFRESH, REFRESH_2 } from "./helpers";

const wiz = createEpicConnector().connection!;
const HOSTS = ["account-public-service-prod03.ol.epicgames.com"];
type Answer = { status: number; body?: unknown; headers?: Record<string, string> };
const tokens = (extra: Record<string, unknown> = {}): Answer => ({
  status: 200,
  body: { access_token: ACCESS, refresh_token: REFRESH_2, expires_in: 28800, refresh_expires: 1209600, token_type: "bearer", account_id: "00000000000000000000000000000a01", displayName: "TestUser", ...extra },
});
const epic = (a: Answer = tokens()) => fakeHttp(() => a, { hosts: HOSTS });
const fields = (authorizationCode: string) => ({ kind: "fields", values: { authorizationCode } }) as const;
const failure = async (p: Promise<unknown>): Promise<ConnectorError> => {
  const e = await p.then(() => null, (x: unknown) => x);
  expect(e).toBeInstanceOf(ConnectorError);
  return e as ConnectorError;
};
const stored = (ctx: { secrets: unknown }) => (ctx.secrets as MemoryVault).values;

describe("Epic wizard (ADR 78, point 7)", () => {
  it("start: one step with the exact login URL and a paste field extracting authorizationCode", async () => {
    const step = await wiz.start(wizardContext({}));
    expect(step).toMatchObject({
      kind: "open-external",
      id: "login",
      awaits: "input",
      fields: [{ name: "authorizationCode", secret: true, paste: true, extract: "json-field:authorizationCode", pattern: "^[0-9a-f]{32}$", maxLength: 4096 }],
    });
    const redirect = `https://www.epicgames.com/id/api/redirect?clientId=${EPIC_CLIENT_ID}&responseType=code`;
    expect((step as { url: string }).url).toBe("https://www.epicgames.com/id/login?redirectUrl=" + encodeURIComponent(redirect));
    expect(createEpicConnector().authHosts).toContain(new URL((step as { url: string }).url).hostname);
  });

  it("exchanges the code: exact form and header, stores only the refresh token, returns the name, logs refresh_expires as a number", async () => {
    const http = epic();
    const ctx = wizardContext({ http });
    expect(await wiz.submit(ctx, "login", fields(` ${CODE}\n`))).toEqual({ kind: "done", accountLabel: "TestUser" });
    expect([...stored(ctx)]).toEqual([["refreshToken", REFRESH_2]]);
    expect(http.requests).toHaveLength(1);
    const req = http.requests[0]!;
    expect(req).toMatchObject({ method: "POST", url: "https://account-public-service-prod03.ol.epicgames.com/account/api/oauth/token" });
    expect(sentForm(req)).toEqual({ grant_type: "authorization_code", code: CODE, token_type: "eg1" });
    expect(sentHeaders(req)["authorization"]).toBe("basic " + btoa(`${EPIC_CLIENT_ID}:${EPIC_CLIENT_SECRET}`));
    expect(ctx.logs.map((l) => l.fields)).toEqual([{ refreshExpires: 1209600, accessExpires: 28800 }]);
    const out = JSON.stringify(ctx.logs) + JSON.stringify(req);
    for (const s of [CODE, ACCESS, REFRESH_2, "TestUser"]) expect(out).not.toContain(s);
  });

  it("displayName is cleaned and capped; absent means done without a name", async () => {
    const long = await wiz.submit(wizardContext({ http: epic(tokens({ displayName: "\u0000Test\nUser" + "x".repeat(100) })) }), "login", fields(CODE));
    expect((long as { accountLabel: string }).accountLabel).toHaveLength(64);
    expect((long as { accountLabel: string }).accountLabel.startsWith("Test User")).toBe(true);
    expect(await wiz.submit(wizardContext({ http: epic(tokens({ displayName: undefined })) }), "login", fields(CODE))).toEqual({ kind: "done" });
  });

  it("a code that does not look like one never reaches Epic, nor does the rest of the pasted JSON", async () => {
    for (const bad of ["", "abc", CODE.toUpperCase(), CODE + "0", `{"authorizationCode":"${CODE}","exchangeCode":"x","sid":"y"}`]) {
      const http = epic();
      const e = await failure(wiz.submit(wizardContext({ http }), "login", fields(bad)));
      expect(e).toMatchObject({ code: "auth.invalid", details: { messageKey: "connectors.epic.error.code" } });
      expect(http.requests).toEqual([]);
      expect(e.message).not.toContain("exchangeCode");
    }
  });

  it("400 and 401 are auth.invalid; corrective_action_required has its own message; errorMessage is never used", async () => {
    for (const status of [400, 401]) {
      const e = await failure(wiz.submit(wizardContext({ http: epic({ status, body: { errorCode: "errors.com.epicgames.account.oauth.authorization_code_not_found", errorMessage: "SECRET-TEXT 00000000000000000000000000c0de01" } }) }), "login", fields(CODE)));
      expect(e).toMatchObject({ code: "auth.invalid", details: { messageKey: "connectors.epic.error.code" } });
      expect(e.message).not.toContain("SECRET-TEXT");
    }
    const c = await failure(wiz.submit(wizardContext({ http: epic({ status: 400, body: { errorCode: "errors.com.epicgames.oauth.corrective_action_required", errorMessage: "SECRET-TEXT" } }) }), "login", fields(CODE)));
    expect(c).toMatchObject({ code: "auth.invalid", details: { messageKey: "connectors.epic.error.corrective" } });
    expect(c.message).not.toContain("SECRET-TEXT");
    const plain = await failure(wiz.submit(wizardContext({ http: epic({ status: 400, body: "<html>" }) }), "login", fields(CODE)));
    expect(plain.code).toBe("auth.invalid");
  });

  it("429 is rate-limited, other statuses unexpected; tokens that do not fit the pattern are unexpected and nothing is stored", async () => {
    await expect(wiz.submit(wizardContext({ http: epic({ status: 429, headers: { "Retry-After": "5" } }) }), "login", fields(CODE))).rejects.toMatchObject({ code: "store.rate-limited", details: { retryAfterMs: 5000 } });
    await expect(wiz.submit(wizardContext({ http: epic({ status: 500 }) }), "login", fields(CODE))).rejects.toMatchObject({ code: "store.unexpected-response" });
    for (const body of [{ access_token: ACCESS }, { access_token: "plain", refresh_token: REFRESH_2 }, { access_token: ACCESS, refresh_token: "eg1~a.b" }, { access_token: ACCESS, refresh_token: "eg1~a.b.c" + "x".repeat(9000) }, null]) {
      const ctx = wizardContext({ http: epic({ status: 200, body }) });
      await expect(wiz.submit(ctx, "login", fields(CODE))).rejects.toMatchObject({ code: "store.unexpected-response" });
      expect(stored(ctx).size).toBe(0);
    }
  });

  it("other steps or inputs are internal errors", async () => {
    await expect(wiz.submit(wizardContext({}), "other", fields(CODE))).rejects.toMatchObject({ code: "internal" });
    await expect(wiz.submit(wizardContext({}), "login", { kind: "continue" })).rejects.toMatchObject({ code: "internal" });
  });

  it("status and disconnect", async () => {
    const connected = wizardContext({ secrets: { refreshToken: REFRESH } });
    expect(await wiz.status(connected)).toEqual({ state: "connected" });
    await wiz.disconnect(connected);
    expect(stored(connected).size).toBe(0);
    expect(await wiz.status(connected)).toEqual({ state: "expired" });
  });
});
