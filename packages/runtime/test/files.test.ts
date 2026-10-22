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

  it("hides a Steam API key and a SteamID64 inside a message (ADR 74)", () => {
    const key = "0123456789abcdef0123456789ABCDEF";
    const id = "76561190000000000";
    expect(redact(`GET failed key=${key} steamid=${id} for ${id}.`)).toBe("GET failed key=[redacted] steamid=[redacted] for [redacted].");
    // Longer or shorter runs are not the key shape: a 33-digit hex string and a 18-digit number stay.
    expect(redact(`${key}0`)).toBe(`${key}0`);
    expect(redact("176561190000000000")).toBe("176561190000000000");
    // URL-encoded OpenID claimed_id and key=... values are caught too.
    expect(redact(`claimed_id=https%3A%2F%2Fsteamcommunity.com%2Fopenid%2Fid%2F${id}`)).toBe(
      "claimed_id=https%3A%2F%2Fsteamcommunity.com%2Fopenid%2Fid%2F[redacted]",
    );
    expect(redact(`x&key=${key}&y`)).toBe("x&key=[redacted]&y");
  });

  it("hides a long opaque token but not ordinary text (ADR 77)", () => {
    const token = "A1b2C3d4-".repeat(8) + "Zz"; // 74 chars
    expect(redact(`refresh failed token=${token} again`)).toBe("refresh failed token=[redacted] again");
    expect(redact("a".repeat(64))).toBe("[redacted]");
    // 63 chars stays; so do the 40-hex hashes, 32-hex-free ids, paths and the usual log lines.
    expect(redact("a".repeat(63))).toBe("a".repeat(63));
    expect(redact("sha1 " + "a".repeat(40))).toBe("sha1 " + "a".repeat(40));
    const line = "Scan finished: 12 games in D:\Games\GOG Games\Cold Waters, connector gog, code store.unexpected-response";
    expect(redact(line)).toBe(line);
  });

  it("hides a token that starts or ends with a dash, also inside a query (ADR 77, audit M2)", () => {
    const t = "-" + "Ab1_".repeat(16) + "-"; // 66 chars
    expect(redact(`x ${t} y`)).toBe("x [redacted] y");
    expect(redact(`refresh_token=${t}&grant_type=refresh_token`)).toBe("refresh_token=[redacted]&grant_type=refresh_token");
  });

  it("is wired to this machine's home folder", () => {
    expect(redactHome(`at ${homedir()}\\a.js`)).not.toContain(homedir());
  });
});
