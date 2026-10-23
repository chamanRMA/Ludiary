import { describe, expect, it } from "vitest";
import { gameFolder } from "../src/paths";

describe("gameFolder (ADR 79, strict local path)", () => {
  it("normalises '/' and the trailing slash", () => {
    expect(gameFolder("D:/Ubisoft Games/Fake Game/")).toBe("D:\\Ubisoft Games\\Fake Game");
    expect(gameFolder("D:\\Ubisoft Games\\Ñandú")).toBe("D:\\Ubisoft Games\\Ñandú");
  });
  it.each([
    "\\\\server\\share\\x",
    "\\\\?\\D:\\x",
    "\\\\.\\D:\\x",
    "Ubisoft Games\\x",
    "D:",
    "D:x",
    "D:\\",
    "D:/",
    'D:\\a"b',
    "D:\\a|b",
    "D:\\a<b",
    "D:\\a?b",
    "D:\\a*b",
    "D:\\a:b",
    "D:\\x\\file.txt:stream",
    "D:\\CON",
    "D:\\x\\nul.txt",
    "D:\\x\\COM1",
    "D:\\x\\LPT9",
    "D:\\x\\trailing.",
    "D:\\x\\trailing ",
    "D:\\x\\..\\y",
    "D:\\x\\a\u0001b",
    "D:\\x\\\\y",
    "",
  ])("rejects %j", (p) => {
    expect(gameFolder(p)).toBeNull();
  });
  it("rejects non strings", () => {
    expect(gameFolder(undefined)).toBeNull();
    expect(gameFolder(5)).toBeNull();
  });
});
