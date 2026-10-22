import { describe, expect, it } from "vitest";
import { extractValue, safeExternalUrl, validateField, valuesToSend } from "./validate";

const steam = { pattern: "^[0-9A-Fa-f]{32}$", maxLength: 40 };
const hex32 = "0123456789abcdef0123456789ABCDEF";

describe("validateField", () => {
  it("accepts a 32-character hexadecimal Steam key and trims spaces", () => {
    expect(validateField(`  ${hex32}\n`, steam)).toEqual({ ok: true, value: hex32 });
  });
  it("rejects wrong formats, empty values and too-long values", () => {
    expect(validateField("zzzz", steam)).toEqual({ ok: false, reason: "format" });
    expect(validateField(hex32.slice(1), steam)).toEqual({ ok: false, reason: "format" });
    expect(validateField("   ", steam)).toEqual({ ok: false, reason: "empty" });
    expect(validateField("a".repeat(41), steam)).toEqual({ ok: false, reason: "too-long" });
  });
  it("applies extract before the pattern (ADR 43)", () => {
    const gog = { pattern: "^[A-Za-z0-9_-]{10,512}$", maxLength: 2048, extract: "url-query:code" } as const;
    expect(validateField("https://embed.gog.com/on_login_success?origin=client&code=AbCdEf123456", gog)).toEqual({ ok: true, value: "AbCdEf123456" });
    const epic = { pattern: "^[a-f0-9]{32}$", maxLength: 4096, extract: "json-field:authorizationCode" } as const;
    expect(validateField(JSON.stringify({ authorizationCode: hex32.toLowerCase() }), epic).ok).toBe(true);
  });
  it("does not throw on an invalid pattern", () => {
    expect(validateField("x", { pattern: "(", maxLength: 5 })).toEqual({ ok: false, reason: "format" });
  });
});

describe("extractValue", () => {
  it("json-field: JSON, the part between braces, or the bare value (ADR 78 point 7)", () => {
    expect(extractValue("abc", "json-field:x")).toBe("abc");
    expect(extractValue('"abc"', "json-field:x")).toBe("abc");
    expect(extractValue('{"x":"abc"}', "json-field:x")).toBe("abc");
    expect(extractValue('junk {"x": "abc"} more', "json-field:x")).toBe("abc");
    expect(extractValue('{"y":"abc"}', "json-field:x")).toBeNull();
    expect(extractValue('{"x": 1}', "json-field:x")).toBeNull();
    expect(extractValue("{broken", "json-field:x")).toBeNull();
    expect(extractValue("12345678901234567890123456789012", "json-field:x")).toBe("12345678901234567890123456789012");
  });
  it("url-query needs an address with the parameter; the text is never echoed back (ADR 77, audit M1)", () => {
    expect(extractValue("abc", "url-query:code")).toBeNull();
    expect(extractValue("https://embed.gog.com/x?origin=client", "url-query:code")).toBeNull();
    expect(extractValue("https://embed.gog.com/x?code=abc_1", "url-query:code")).toBe("abc_1");
    expect(validateField("abcdefghij12345", { maxLength: 100, extract: "url-query:code" })).toEqual({ ok: false, reason: "format" });
    expect(validateField("https://embed.gog.com/x?code=abcdefghij", { maxLength: 100, extract: "url-query:code" })).toEqual({ ok: true, value: "abcdefghij" });
  });
});

describe("safeExternalUrl", () => {
  it("only lets https through", () => {
    expect(safeExternalUrl("https://steamcommunity.com/dev/apikey")).toBe("https://steamcommunity.com/dev/apikey");
    expect(safeExternalUrl("http://example.com")).toBeNull();
    expect(safeExternalUrl("javascript:alert(1)")).toBeNull();
    expect(safeExternalUrl("file:///C:/Windows")).toBeNull();
    expect(safeExternalUrl("not a url")).toBeNull();
  });
});

describe("valuesToSend", () => {
  const f = { name: "authorizationCode", pattern: "^[0-9a-f]{32}$", maxLength: 4096, extract: "json-field:authorizationCode" } as const;
  it("sends the extracted code, never the pasted text", () => {
    const code = "0".repeat(24) + "0000c0de";
    const sent = valuesToSend([f], { authorizationCode: `{"redirectUrl":"x","authorizationCode":"${code}","sid":"abc"}` });
    expect(sent).toEqual({ authorizationCode: code });
    expect(JSON.stringify(sent)).not.toMatch(/sid|redirectUrl/);
  });
  it("sends an empty value, never the pasted text, when the extraction fails", () => {
    expect(valuesToSend([f], { authorizationCode: '{"sid":"secret-sid"}' })).toEqual({ authorizationCode: "" });
  });
  it("leaves fields without extract as typed", () => {
    expect(valuesToSend([{ name: "k", maxLength: 9 }], { k: "abc" })).toEqual({ k: "abc" });
  });
});
