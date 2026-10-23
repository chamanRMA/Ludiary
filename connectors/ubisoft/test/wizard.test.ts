import { fakeHttp, sentHeaders, wizardContext, type MemoryVault } from "@ludiary/connector-testkit";
import { ConnectorError, makeSecret } from "@ludiary/contracts";
import { describe, expect, it } from "vitest";
import { createUbisoftConnector } from "../src";
import { APP_ID, GENOME_ID } from "../src/auth";
import { NAME, REMEMBER, REMEMBER_2, SESSION_ID, TICKET } from "./helpers";

const c = createUbisoftConnector();
const wiz = c.connection!;
type Answer = { status: number; body?: unknown; headers?: Record<string, string> };
const ok = (extra: Record<string, unknown> = {}): Answer => ({
  status: 200,
  body: { ticket: TICKET, sessionId: SESSION_ID, rememberMeTicket: REMEMBER_2, nameOnPlatform: NAME, expiration: "2026-10-24T00:00:00Z", userId: "u-1", email: "a@b.invalid", ...extra },
});
const ubi = (a: Answer = ok()) => fakeHttp(() => a, { hosts: c.apiHosts });
const embedded = (v = REMEMBER) => ({ kind: "embedded", values: { rememberMeTicket: makeSecret(v) } }) as const;
const failure = async (p: Promise<unknown>): Promise<ConnectorError> => {
  const e = await p.then(() => null, (x: unknown) => x);
  expect(e).toBeInstanceOf(ConnectorError);
  return e as ConnectorError;
};
const stored = (ctx: { secrets: unknown }) => (ctx.secrets as MemoryVault).values;

describe("Ubisoft wizard (ADR 80, point 7)", () => {
  it("start: the exact embedded-login step", async () => {
    const step = await wiz.start(wizardContext({ locale: "es" }));
    expect(step).toEqual({
      kind: "embedded-login",
      id: "login",
      titleKey: "connectors.ubisoft.login.title",
      bodyKey: "connectors.ubisoft.login.body",
      windowTitleKey: "connectors.ubisoft.login.window",
      url: `https://connect.ubisoft.com/login?appId=${APP_ID}&genomeId=${GENOME_ID}&lang=es-ES&nextUrl=https%3A%2F%2Fconnect.ubisoft.com%2Fready`,
      doneUrl: "https://connect.ubisoft.com/ready",
      captureUrl: "https://connect.ubisoft.com/login",
      capture: [{ name: "rememberMeTicket", storageKeys: ["PRODrememberMe", "PRODloginData"], jsonField: "rememberMeTicket", pattern: "^[A-Za-z0-9+/=_.-]{64,8192}$", maxLength: 8192 }],
    });
    expect(((await wiz.start(wizardContext({ locale: "en" }))) as { url: string }).url).toContain("&lang=en-US&");
    expect(((await wiz.start(wizardContext({ locale: "fr" }))) as { url: string }).url).toContain("&lang=en-US&");
    for (const u of ["doneUrl", "captureUrl", "url"] as const) expect(c.authHosts).toContain(new URL((step as unknown as Record<string, string>)[u]!).hostname);
  });

  it("renews with the exact request, stores the rotated ticket once and returns the name", async () => {
    const http = ubi();
    const ctx = wizardContext({ http });
    expect(await wiz.submit(ctx, "login", embedded())).toEqual({ kind: "done", accountLabel: NAME });
    expect([...stored(ctx)]).toEqual([["rememberMeTicket", REMEMBER_2]]);
    expect((ctx.secrets as MemoryVault).sets).toEqual(["rememberMeTicket"]);
    const [req] = http.requests;
    expect([req!.method, req!.url, req!.body]).toEqual(["POST", "https://public-ubiservices.ubi.com/v3/profiles/sessions", { json: { rememberMe: true } }]);
    expect(sentHeaders(req!)).toEqual({ "ubi-appid": APP_ID, authorization: `rm_v1 t=${REMEMBER}` });
    expect(JSON.stringify(req)).not.toMatch(new RegExp(`${REMEMBER}|rm_v1`));
    expect(JSON.stringify(ctx.logs)).not.toMatch(/TestUser|ubisoft-test|a@b/);
    expect(ctx.logs.some((l) => l.fields?.["rotated"] === true && l.fields?.["hasExpiration"] === true)).toBe(true);
  });

  it("without a rotated ticket the captured one is stored", async () => {
    const ctx = wizardContext({ http: ubi(ok({ rememberMeTicket: undefined })) });
    await wiz.submit(ctx, "login", embedded());
    expect([...stored(ctx)]).toEqual([["rememberMeTicket", REMEMBER]]);
  });

  it.each([[undefined, { kind: "done" }], ["", { kind: "done" }], ["  \u0007Name\n ", { kind: "done", accountLabel: "Name" }], ["x".repeat(100), { kind: "done", accountLabel: "x".repeat(64) }]])(
    "account name %j is sanitised or omitted",
    async (n, expected) => {
      expect(await wiz.submit(wizardContext({ http: ubi(ok({ nameOnPlatform: n })) }), "login", embedded())).toEqual(expected);
    },
  );

  it.each([400, 401, 403])("a %i is auth.invalid with error.login and nothing is stored", async (status) => {
    const ctx = wizardContext({ http: ubi({ status }) });
    const e = await failure(wiz.submit(ctx, "login", embedded()));
    expect([e.code, e.details.messageKey]).toEqual(["auth.invalid", "connectors.ubisoft.error.login"]);
    expect(stored(ctx).size).toBe(0);
  });

  it("a second-factor request is auth.invalid", async () => {
    const ctx = wizardContext({ http: ubi({ status: 200, body: { twoFactorAuthenticationTicket: "x".repeat(70) } }) });
    const e = await failure(wiz.submit(ctx, "login", embedded()));
    expect([e.code, e.details.messageKey]).toEqual(["auth.invalid", "connectors.ubisoft.error.login"]);
    expect(stored(ctx).size).toBe(0);
  });

  it("429 keeps Retry-After; other statuses and odd answers are unexpected-response and store nothing", async () => {
    const e = await failure(wiz.submit(wizardContext({ http: ubi({ status: 429, headers: { "retry-after": "120" } }) }), "login", embedded()));
    expect([e.code, e.details.retryAfterMs]).toEqual(["store.rate-limited", 120_000]);
    for (const a of [{ status: 500 }, { status: 200, body: [] }, ok({ ticket: "short" }), ok({ sessionId: "nope" }), ok({ rememberMeTicket: "short!" }), ok({ rememberMeTicket: 5 })] as Answer[]) {
      const ctx = wizardContext({ http: ubi(a) });
      expect((await failure(wiz.submit(ctx, "login", embedded()))).code).toBe("store.unexpected-response");
      expect(stored(ctx).size).toBe(0);
    }
  });

  it("a network error propagates as is", async () => {
    const http = fakeHttp(() => {
      throw new ConnectorError("network.unavailable", "down");
    });
    expect((await failure(wiz.submit(wizardContext({ http }), "login", embedded()))).code).toBe("network.unavailable");
  });

  it("wrong step or input kind is internal; a captured value with a bad shape never reaches the network", async () => {
    const http = ubi();
    expect((await failure(wiz.submit(wizardContext({ http }), "other", embedded()))).code).toBe("internal");
    expect((await failure(wiz.submit(wizardContext({ http }), "login", { kind: "continue" }))).code).toBe("internal");
    const e = await failure(wiz.submit(wizardContext({ http }), "login", embedded("short")));
    expect(e.code).toBe("auth.invalid");
    expect(http.requests).toHaveLength(0);
  });

  it("status is local and disconnect deletes the secret", async () => {
    const ctx = wizardContext({ secrets: { rememberMeTicket: REMEMBER } });
    expect(await wiz.status(ctx)).toEqual({ state: "connected" });
    await wiz.disconnect(ctx);
    expect(stored(ctx).size).toBe(0);
    expect(await wiz.status(ctx)).toEqual({ state: "expired" });
  });
});
