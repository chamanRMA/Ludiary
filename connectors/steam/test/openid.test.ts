import { fakeHttp, sentForm, wizardContext } from "@ludiary/connector-testkit";
import { ConnectorError } from "@ludiary/contracts";
import { describe, expect, it } from "vitest";
import { buildLoginUrl, verifyAssertion } from "../src";
import { CALLBACK, NOW, readFixture, readJson, STEAM_ID } from "./helpers";

const valid = readJson<Record<string, string>>("openid", "assertion-valid.json");
const reply = (name: string) => readFixture("openid", name);

function run(query: Record<string, string>, answer = { status: 200, body: reply("check-authentication-valid.txt") }, now = NOW) {
  const http = fakeHttp(() => answer, { hosts: ["steamcommunity.com"] });
  const ctx = wizardContext({ http, now });
  return { http, result: verifyAssertion(query, ctx) };
}
const failure = async (p: Promise<unknown>): Promise<ConnectorError> => {
  const e = await p.then(() => null, (x: unknown) => x);
  expect(e).toBeInstanceOf(ConnectorError);
  return e as ConnectorError;
};
const without = (k: string): Record<string, string> => {
  const { [k]: _omit, ...rest } = valid;
  return rest;
};

describe("buildLoginUrl", () => {
  it("is checkid_setup with return_to and the origin of callbackUrl as realm", () => {
    const u = new URL(buildLoginUrl(CALLBACK));
    expect(u.origin + u.pathname).toBe("https://steamcommunity.com/openid/login");
    expect(Object.fromEntries(u.searchParams)).toEqual({
      "openid.ns": "http://specs.openid.net/auth/2.0",
      "openid.mode": "checkid_setup",
      "openid.return_to": CALLBACK,
      "openid.realm": "http://ludiary.localhost:4780/",
      "openid.identity": "http://specs.openid.net/auth/2.0/identifier_select",
      "openid.claimed_id": "http://specs.openid.net/auth/2.0/identifier_select",
    });
    const other = new URL(buildLoginUrl("http://127.0.0.1:5000/connect/return?w=x"));
    expect(other.searchParams.get("openid.realm")).toBe("http://127.0.0.1:5000/");
  });
});

describe("verifyAssertion (ADR 74, point 3)", () => {
  it("accepts a valid assertion, returns the SteamID and POSTs the received openid.* with the mode changed", async () => {
    const { http, result } = run({ ...valid, other: "ignored" });
    expect(await result).toBe(STEAM_ID);
    expect(http.requests).toHaveLength(1);
    const r = http.requests[0]!;
    expect(r.method).toBe("POST");
    expect(r.url).toBe("https://steamcommunity.com/openid/login");
    expect(sentForm(r)).toEqual({ ...valid, "openid.mode": "check_authentication" });
  });

  it("mode=cancel is auth.required with login.cancelled and makes no call", async () => {
    const { http, result } = run({ "openid.mode": "cancel" });
    const e = await failure(result);
    expect(e.code).toBe("auth.required");
    expect(e.details.messageKey).toBe("connectors.steam.login.cancelled");
    expect(http.requests).toHaveLength(0);
  });

  const bad: [string, Record<string, string>][] = [
    ["other mode", { ...valid, "openid.mode": "setup_needed" }],
    ["no mode", without("openid.mode")],
    ["other ns", { ...valid, "openid.ns": "http://specs.openid.net/auth/1.1" }],
    ["other op_endpoint", { ...valid, "openid.op_endpoint": "https://steamcommunity.com.evil.example/openid/login" }],
    ["foreign w in return_to", { ...valid, "openid.return_to": "http://ludiary.localhost:4780/connect/return?w=11111111-1111-4111-8111-111111111111" }],
    ["return_to of another site", { ...valid, "openid.return_to": "https://evil.example/connect/return?w=00000000-0000-4000-8000-000000000000" }],
    ["claimed_id on another host", { ...valid, "openid.claimed_id": "https://evil.example/openid/id/76561190000000000", "openid.identity": "https://evil.example/openid/id/76561190000000000" }],
    ["claimed_id not a SteamID64", { ...valid, "openid.claimed_id": "https://steamcommunity.com/openid/id/1234", "openid.identity": "https://steamcommunity.com/openid/id/1234" }],
    ["claimed_id with a suffix", { ...valid, "openid.claimed_id": valid["openid.claimed_id"] + "/x", "openid.identity": valid["openid.claimed_id"] + "/x" }],
    ["different identity", { ...valid, "openid.identity": "https://steamcommunity.com/openid/id/76561190000000001" }],
    ["signed without return_to", { ...valid, "openid.signed": "signed,op_endpoint,claimed_id,identity,response_nonce,assoc_handle" }],
    ["no signed", without("openid.signed")],
    ["no sig", without("openid.sig")],
    ["no nonce", without("openid.response_nonce")],
    ["nonce without a date", { ...valid, "openid.response_nonce": "yesterdayXYZ" }],
    ["nonce with an impossible date", { ...valid, "openid.response_nonce": "2026-13-45T11:58:00Zabc" }],
    ["expired nonce", { ...valid, "openid.response_nonce": "2026-10-22T11:54:59Zabc" }],
    ["nonce from the future", { ...valid, "openid.response_nonce": "2026-10-22T12:01:01Zabc" }],
  ];
  it.each(bad)("%s is auth.invalid with error.openid and makes no call", async (_n, q) => {
    const { http, result } = run(q);
    const e = await failure(result);
    expect(e.code).toBe("auth.invalid");
    expect(e.details.messageKey).toBe("connectors.steam.error.openid");
    expect(http.requests).toHaveLength(0);
  });

  it("the nonce window is 5 minutes back and 1 minute forward, inclusive", async () => {
    expect(await run({ ...valid, "openid.response_nonce": "2026-10-22T11:55:00Zabc" }).result).toBe(STEAM_ID);
    expect(await run({ ...valid, "openid.response_nonce": "2026-10-22T12:01:00Zabc" }).result).toBe(STEAM_ID);
  });

  it.each([
    ["is_valid:false", "check-authentication-invalid.txt"],
    ["is_valid:true only inside another line", "check-authentication-substring.txt"],
  ])("check_authentication reply %s is auth.invalid", async (_n, file) => {
    const e = await failure(run(valid, { status: 200, body: reply(file) }).result);
    expect(e.code).toBe("auth.invalid");
    expect(e.details.messageKey).toBe("connectors.steam.error.openid");
  });

  it.each([
    ["no ns line", "is_valid:true\n"],
    ["other ns", "ns:http://specs.openid.net/auth/1.1\nis_valid:true\n"],
    ["a repeated is_valid", "ns:http://specs.openid.net/auth/2.0\nis_valid:false\nis_valid:true\n"],
    ["is_valid with a space", "ns:http://specs.openid.net/auth/2.0\nis_valid: true\n"],
    ["an empty body", ""],
    ["HTML", "<html>is_valid:true</html>"],
  ])("a reply with %s is auth.invalid", async (_n, body) => {
    expect((await failure(run(valid, { status: 200, body }).result)).code).toBe("auth.invalid");
  });

  it("accepts CRLF line ends", async () => {
    const answer = { status: 200, body: "ns:http://specs.openid.net/auth/2.0\r\nis_valid:true\r\n" };
    expect(await run(valid, answer).result).toBe(STEAM_ID);
  });

  it("a non-200 status is auth.invalid; a transport error propagates", async () => {
    expect((await failure(run(valid, { status: 500, body: reply("check-authentication-valid.txt") }).result)).code).toBe("auth.invalid");
    const http = fakeHttp(() => {
      throw new ConnectorError("network.unavailable", "down");
    });
    const e = await failure(verifyAssertion(valid, wizardContext({ http, now: NOW })));
    expect(e.code).toBe("network.unavailable");
  });

  it("never logs assertion data", async () => {
    const http = fakeHttp(() => ({ status: 200, body: reply("check-authentication-valid.txt") }));
    const ctx = wizardContext({ http, now: NOW });
    await verifyAssertion(valid, ctx);
    await verifyAssertion({ ...valid, "openid.mode": "x" }, ctx).catch(() => undefined);
    expect(ctx.logs).toEqual([]);
  });
});
