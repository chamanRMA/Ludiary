import { ConnectorError } from "@ludiary/contracts";
import { describe, expect, it } from "vitest";
import { parseVdf, vdfObject, vdfString, VDF_LIMITS } from "../src/vdf";

const bad = (text: string): void => {
  try {
    parseVdf(text);
  } catch (e) {
    expect(e).toBeInstanceOf(ConnectorError);
    expect((e as ConnectorError).code).toBe("store.unexpected-response");
    return;
  }
  throw new Error(`expected a failure for: ${text.slice(0, 40)}`);
};

describe("parseVdf", () => {
  it("parses nested objects and quoted strings", () => {
    const r = parseVdf('"A" { "b" "c" "d" { "e" "f" } }');
    expect(vdfString(vdfObject(r, "a"), "b")).toBe("c");
    expect(vdfString(vdfObject(vdfObject(r, "a"), "d"), "e")).toBe("f");
  });
  it("handles the escapes and keeps unknown ones", () => {
    const r = parseVdf('"k" "C:\\\\x\\"q\\"\\n\\t\\z"');
    expect(vdfString(r, "k")).toBe('C:\\x"q"\n\t\\z');
  });
  it("accepts unquoted tokens", () => {
    const r = parseVdf("a { b c }");
    expect(vdfString(vdfObject(r, "a"), "b")).toBe("c");
  });
  it("ignores // comments but not inside strings", () => {
    const r = parseVdf('// head\n"a" "http://x" // tail\n"b" "1"');
    expect(vdfString(r, "a")).toBe("http://x");
    expect(vdfString(r, "b")).toBe("1");
  });
  it("keys are case-insensitive and the last duplicate wins", () => {
    const r = parseVdf('"Key" "1" "KEY" "2"');
    expect(vdfString(r, "key")).toBe("2");
    expect(vdfString(r, "KEY")).toBe("2");
  });
  it("skips [$...] conditions after a value or a block", () => {
    const r = parseVdf('"a" "1" [$WIN32] "b" { "c" "2" } [!$X360] "d" "3"');
    expect(vdfString(r, "a")).toBe("1");
    expect(vdfString(vdfObject(r, "b"), "c")).toBe("2");
    expect(vdfString(r, "d")).toBe("3");
  });
  it("strips a BOM and accepts CRLF and strings with newlines", () => {
    const r = parseVdf('\uFEFF"a"\r\n{\r\n"b" "x\ny"\r\n}');
    expect(vdfString(vdfObject(r, "a"), "b")).toBe("x\ny");
  });
  it("accepts an empty document and a __proto__ key safely", () => {
    expect(parseVdf("").size).toBe(0);
    const r = parseVdf('"__proto__" { "polluted" "1" }');
    expect(vdfString(vdfObject(r, "__proto__"), "polluted")).toBe("1");
    expect(({} as Record<string, unknown>)["polluted"]).toBeUndefined();
  });
  it("rejects malformed input only with store.unexpected-response", () => {
    bad('"a" { "b" "c"');
    bad('"a" "b');
    bad('"a"');
    bad("}");
    bad('"a" { } }');
    bad("{");
    bad('"a" }');
    bad('"a" { "b" }');
  });
  it("limits nesting depth", () => {
    const d = VDF_LIMITS.maxDepth;
    expect(() => parseVdf("a{".repeat(d) + "}".repeat(d))).not.toThrow();
    bad("a{".repeat(d + 5) + "}".repeat(d + 5));
    bad("a{".repeat(200_000)); // hostile: fails fast, no stack overflow
  });
  it("limits input size, string size and entry count", () => {
    bad(" ".repeat(VDF_LIMITS.maxChars + 1));
    bad(`"a" "${"x".repeat(VDF_LIMITS.maxStringChars + 1)}"`);
    bad("a".repeat(VDF_LIMITS.maxStringChars + 1));
    bad("a b ".repeat(VDF_LIMITS.maxEntries + 1));
  });
  it("survives random hostile input without throwing anything else", () => {
    let seed = 12345;
    const rnd = (): number => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    const alphabet = ['"', "{", "}", "\\", "/", "[", "]", "$", "a", " ", "\n", "\u0000", "é"];
    for (let i = 0; i < 300; i++) {
      let s = "";
      for (let j = 0; j < 40; j++) s += alphabet[Math.floor(rnd() * alphabet.length)];
      try {
        parseVdf(s);
      } catch (e) {
        expect(e).toBeInstanceOf(ConnectorError);
      }
    }
  });
});
