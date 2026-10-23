import { ConnectorError, makeSecret } from "@ludiary/contracts";
import { describe, expect, it } from "vitest";
import {
  fakeHttp,
  FICTIONAL_API_KEY,
  FICTIONAL_EPIC_VALUES,
  FICTIONAL_GOG_VALUES,
  FICTIONAL_STEAM_ID,
  findPrivacyViolations,
  memoryFiles,
  READ_TEXT_MAX_BYTES,
  scanContext,
  sentForm,
  sentHeaders,
  sentQuery,
  syncContext,
  wizardContext,
} from "../src";

describe("memoryFiles", () => {
  const tree = { "C:\\Games\\A\\a.txt": "hi", "D:\\Lib\\": "", "C:\\Games2\\x.txt": "x" };
  it("is case- and separator-insensitive and lists directories", async () => {
    const fs = memoryFiles(tree);
    expect(await fs.readText("c:/GAMES/a/A.TXT")).toBe("hi");
    expect(await fs.exists("C:\\games")).toBe(true);
    expect(await fs.exists("C:\\nope")).toBe(false);
    expect(await fs.readDir("C:\\Games")).toEqual([{ name: "A", isDirectory: true }]);
    expect(await fs.readDir("D:\\Lib")).toEqual([]);
    expect(fs.join("C:\\Games", "A", "..", "A", "a.txt")).toBe("C:\\Games\\A\\a.txt");
  });
  it("confines to roots (prefix trap and ..) with 'internal'", async () => {
    const fs = memoryFiles(tree, { roots: ["C:\\Games"] });
    for (const p of ["C:\\Games2\\x.txt", "C:\\Games\\..\\Games2\\x.txt", "D:\\Lib"]) {
      await expect(fs.readText(p)).rejects.toMatchObject({ code: "internal" });
    }
    expect(await fs.readText("C:\\Games\\A\\a.txt")).toBe("hi");
    await expect(fs.exists("relative")).rejects.toBeInstanceOf(ConnectorError);
  });
  it("applies the size limits and unreadable paths", async () => {
    const fs = memoryFiles({ "C:\\big.txt": "a".repeat(READ_TEXT_MAX_BYTES + 1), "C:\\p\\x": "" }, { unreadable: ["C:\\p"] });
    await expect(fs.readText("C:\\big.txt")).rejects.toMatchObject({ code: "store.unexpected-response" });
    await expect(fs.readText("C:\\missing.txt")).rejects.toMatchObject({ code: "scan.root-unreadable" });
    await expect(fs.readDir("C:\\p")).rejects.toMatchObject({ code: "scan.root-unreadable" });
    const many: Record<string, string> = {};
    for (let i = 0; i < 10_001; i++) many[`C:\\d\\f${i}`] = "";
    await expect(memoryFiles(many).readDir("C:\\d")).rejects.toMatchObject({ code: "scan.root-unreadable" });
  });
});

describe("contexts", () => {
  it("capture logs and progress", () => {
    const ctx = scanContext({ roots: ["C:\\x"] });
    ctx.log.warn("m", { a: 1 });
    ctx.progress.report({ done: 1 });
    expect(ctx.logs).toEqual([{ level: "warn", msg: "m", fields: { a: 1 } }]);
    expect(ctx.progressEvents).toEqual([{ done: 1 }]);
    expect(ctx.roots).toEqual([{ origin: "user", path: "C:\\x" }]);
  });
});

describe("findPrivacyViolations", () => {
  const find = (content: string): string[] => findPrivacyViolations([{ path: "f", content }]).map((v) => v.rule);
  it("detects the patterns of ADR 48 and 72", () => {
    expect(find("id 7656119" + "1".repeat(10))).toEqual(["SteamID64"]);
    expect(find('"LastOwner" "0"')).toEqual(["LastOwner"]);
    expect(find("C:\\Users\\bob\\x")).toContain("user profile path");
    expect(find("C:\\\\Users\\\\bob")).toContain("user profile path");
    expect(find("a@b.com")).toEqual(["email address"]);
    expect(find('"access_token": "abcdef123456"')).toContain("credential field");
    expect(find("clean text, D:\\SteamLibrary")).toEqual([]);
  });
});

describe("ADR 74 privacy: only the two fictional values are accepted", () => {
  const find = (content: string): string[] => findPrivacyViolations([{ path: "f", content }]).map((v) => v.rule);
  it("accepts the fictional SteamID and key, also as an api key field", () => {
    expect(find(`"steamid": "${FICTIONAL_STEAM_ID}"`)).toEqual([]);
    expect(find(`/openid/id/${FICTIONAL_STEAM_ID}`)).toEqual([]);
    expect(find(`"apiKey": "${FICTIONAL_API_KEY}"`)).toEqual([]);
    expect(find(`key=${FICTIONAL_API_KEY}`)).toEqual([]);
  });
  it("rejects any other SteamID or 32-hex value, even next to the fictional one", () => {
    expect(find("76561190000000001")).toEqual(["SteamID64"]);
    expect(find(FICTIONAL_STEAM_ID + "1")).toEqual(["SteamID64"]);
    expect(find("0123456789abcdef0123456789abcdee")).toEqual(["32-hex key"]);
    expect(find("0123456789ABCDEF0123456789ABCDEF")).toEqual(["32-hex key"]);
    expect(find(FICTIONAL_API_KEY + "0")).toEqual([]); // 33 chars: not a key shape
    expect(find(`${FICTIONAL_STEAM_ID} 76561190000000002`)).toEqual(["SteamID64"]);
  });
  it("a 40-hex hash is not mistaken for a key", () => {
    expect(find("a".repeat(40))).toEqual([]);
  });
});

describe("ADR 77 privacy: the fictional GOG values", () => {
  const find = (content: string): string[] => findPrivacyViolations([{ path: "f", content }]).map((v) => v.rule);
  it("accepts the four fictional values as credential fields", () => {
    for (const v of FICTIONAL_GOG_VALUES) {
      expect(find(`"refresh_token": "${v}"`)).toEqual([]);
      expect(find(`"access_token":"${v}"`)).toEqual([]);
    }
    expect(find("code=gog-test-auth-code-0001")).toEqual([]);
  });
  it("rejects any other token value, even one that extends a fictional one", () => {
    expect(find('"refresh_token": "real-looking-token-value"')).toEqual(["credential field"]);
    expect(find('"refresh_token": "gog-test-refresh-token-3"')).toEqual(["credential field"]);
    expect(find('"client_secret": "0123abcd"')).toEqual(["credential field"]);
  });
});

describe("fakeHttp (ADR 74)", () => {
  const ok = () => ({ status: 200, body: "x" });
  it("reveals secrets of form, query and headers for assertions only", async () => {
    const http = fakeHttp(ok);
    await http.request({
      method: "POST",
      url: "https://a.example/p",
      headers: { "x-webapi-key": makeSecret("K") },
      query: { q: makeSecret("Q"), n: 1 },
      body: { form: { f: makeSecret("F"), g: "G" } },
    });
    const r = http.requests[0]!;
    expect(sentForm(r)).toEqual({ f: "F", g: "G" });
    expect(sentQuery(r)).toEqual({ q: "Q", n: "1" });
    expect(sentHeaders(r)).toEqual({ "x-webapi-key": "K" });
    expect(JSON.stringify(r)).not.toMatch(/[KQF]"/);
  });
  it("rejects like the real client: GET with body, bad headers, other hosts", async () => {
    const http = fakeHttp(ok, { hosts: ["a.example"] });
    const bad = [
      { method: "GET" as const, url: "https://a.example/", body: { json: {} } },
      { method: "GET" as const, url: "https://a.example/", headers: { Cookie: "x" } },
      { method: "GET" as const, url: "https://a.example/", headers: { cookie: "x" } },
      { method: "GET" as const, url: "https://a.example/", headers: { "x-a": "a\r\nb: c" } },
      { method: "GET" as const, url: "https://b.example/" },
      { method: "GET" as const, url: "http://a.example/" },
    ];
    for (const req of bad) await expect(http.request(req)).rejects.toMatchObject({ code: "internal" });
    expect((await http.request({ method: "GET", url: "https://a.example/" })).status).toBe(200);
  });
});

describe("syncContext and wizardContext (ADR 74)", () => {
  it("give an in-memory vault, a tool double that fails with tool.missing and a fixed clock", async () => {
    const ctx = wizardContext({ secrets: { a: "1" }, state: { s: "2" }, now: 42 });
    expect((await ctx.secrets.get("a"))?.reveal()).toBe("1");
    expect(String(await ctx.secrets.get("a"))).toBe("[redacted]");
    expect(await ctx.secrets.get("nope")).toBeNull();
    await ctx.wizardState.set("t", makeSecret("3"));
    expect(ctx.wizardState.values.get("t")).toBe("3");
    expect(ctx.now()).toBe(42);
    expect(ctx.callbackUrl).toMatch(/^http:\/\/ludiary\.localhost:\d+\/connect\/return\?w=/);
    await expect(ctx.tools.run("legendary", [])).rejects.toMatchObject({ code: "tool.missing" });
    const s = syncContext();
    expect(s.locale).toBe("en");
    s.log.info("m");
    expect(s.logs).toHaveLength(1);
  });
});

describe("ADR 78 privacy: the fictional Epic values", () => {
  const find = (content: string): string[] => findPrivacyViolations([{ path: "f", content }]).map((v) => v.rule);
  it("accepts 24-zero ids and the fictional eg1~ tokens", () => {
    expect(find("namespace 000000000000000000000000000000a1 id 00000000000000000000000000000001")).toEqual([]);
    for (const v of FICTIONAL_EPIC_VALUES) expect(find(`"refresh_token": "${v}"`)).toEqual([]);
  });
  it("rejects other 32-hex ids and other eg1~ tokens", () => {
    expect(find("000000000000000000000001000000a1")).toEqual(["32-hex key"]);
    expect(find("0000000000000000000000000000000a1")).toEqual([]); // 33 chars: not a key shape
    expect(find("aaaaaaaaaaaaaaaaaaaaaaaa000000a1")).toEqual(["32-hex key"]);
    expect(find('"access_token": "eg1~real.token.value"')).toContain("credential field");
    expect(find(`"access_token": "${FICTIONAL_EPIC_VALUES[0]}x"`)).toContain("credential field");
    expect(find("eg1~real.token.value")).toEqual(["unlisted eg1 token"]);
    expect(find("eg1~epic-testXtoken")).toEqual(["unlisted eg1 token"]); // the dots of a listed value are literal
    expect(find(FICTIONAL_EPIC_VALUES[0])).toEqual([]);
    for (const bad of ["eg1~epic-testXaccessXtoken", "eg1~epic-test.access.token.realSig_part", "eg1~epic-test.access.token_x"]) {
      expect(find(bad), bad).toContain("unlisted eg1 token");
    }
  });
});
