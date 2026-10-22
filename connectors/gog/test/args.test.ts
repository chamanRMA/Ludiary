import { describe, expect, it } from "vitest";
import { splitWindowsArgs } from "../src/args";

// libuv quote_cmd_arg, reimplemented: the inverse of the CRT rules (ADR 76).
function quote(arg: string): string {
  if (arg === "") return '""';
  if (!/[	 "]/.test(arg)) return arg;
  let out = '"';
  let n = 0;
  for (const ch of arg) {
    if (ch === "\\") n++;
    else if (ch === '"') {
      out += "\\".repeat(n * 2 + 1) + '"';
      n = 0;
    } else {
      out += "\\".repeat(n) + ch;
      n = 0;
    }
  }
  return out + "\\".repeat(n * 2) + '"';
}

const TABLE: [string, string[]][] = [
  ["", []],
  ["   \t ", []],
  ["a b  c", ["a", "b", "c"]],
  ["a\tb", ["a", "b"]],
  ['"a b" c', ["a b", "c"]],
  ['a"b c"d', ["ab cd"]],
  ['""', [""]],
  ['a "" b', ["a", "", "b"]],
  ['"a ""b"" c"', ['a "b" c']], // UCRT: "" inside quotes is a literal quote and quoting goes on
  ['"say ""hi"""', ['say "hi"']],
  ['\\"a', ['"a']], // 1 backslash + quote: literal quote
  ['\\\\"a b"', ["\\a b"]], // 2 backslashes + quote: one backslash, opens quote
  ['\\\\\\"a', ['\\"a']], // 3 backslashes + quote
  ["a\\b c\\\\d", ["a\\b", "c\\\\d"]], // loose backslashes are literal
  ['"C:\\dir\\" x', ['C:\\dir" x']],
  ['"C:\\dir\\\\" x', ["C:\\dir\\", "x"]],
  ["x\\", ["x\\"]],
  ['-path="D:\\A B\\y" -v', ["-path=D:\\A B\\y", "-v"]],
];

describe("splitWindowsArgs (ADR 76)", () => {
  it.each(TABLE)("%j", (input, expected) => {
    expect(splitWindowsArgs(input)).toEqual(expected);
  });
  it("round-trips with libuv quoting", () => {
    for (const [, args] of TABLE) {
      if (args.length === 0) continue;
      expect(splitWindowsArgs(args.map(quote).join(" "))).toEqual(args);
    }
    const extra = ['a"b', "a\\", 'a\\"b', "\\\\", "x y\\", ""];
    expect(splitWindowsArgs(extra.map(quote).join(" "))).toEqual(extra);
  });
});
