import { homedir } from "node:os";
import { describe, expect, it } from "vitest";
import { makeRedactor, redactHome } from "../src/files";

describe("log redaction (ADR 35)", () => {
  const redact = makeRedactor("C:\\Users\\ana", "ana");

  it("removes the home folder whatever the case or slash", () => {
    expect(redact("at C:\\Users\\ana\\a.js")).toBe("at ~\\a.js");
    expect(redact("at C:\\USERS\\ANA\\b.js")).toBe("at ~\\b.js");
    expect(redact("at C:/Users/ana/c.js")).toBe("at ~/c.js");
  });

  it("does not treat a longer user folder as the same one", () => {
    expect(redact("C:\\Users\\anabel\\x")).toBe("C:\\Users\\anabel\\x");
  });

  it("removes the bare user name but not words that contain it", () => {
    expect(redact("D:\\Docs\\ana\\x and banana")).toBe("D:\\Docs\\<user>\\x and banana");
  });

  it("is wired to this machine's home folder", () => {
    expect(redactHome(`at ${homedir()}\\a.js`)).not.toContain(homedir());
  });
});
