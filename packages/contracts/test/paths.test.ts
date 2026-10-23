import { describe, expect, it } from "vitest";
import { isStrictLocalPath } from "../src";

describe("isStrictLocalPath: one rule for the launcher, Epic and Ubisoft", () => {
  it("accepts a plain local path with spaces and non-ASCII letters", () => {
    expect(isStrictLocalPath("D:\\Juegos Ñ\\Game\\game.exe")).toBe(true);
  });
  it.each([
    "\\\\server\\share\\x", // UNC
    "\\\\?\\C:\\x",
    "C:/Games/x", // forward slash
    "C:\\Games\\..\\x",
    "C:\\Games\\leeme.txt:carga.exe", // alternate data stream
    "C:\\Games\\CON",
    "C:\\Games\\CON .txt", // the case the Epic copy had drifted on
    "C:\\Games\\com¹.exe",
    "C:\\Games\\x.",
    "C:\\Games\\x ",
    "C:\\Games\\a\u0007b",
    'C:\\Games\\"x"',
    42,
  ])("rejects %j", (p) => {
    expect(isStrictLocalPath(p)).toBe(false);
  });
});
