import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createSecretCipher } from "../src";

const key = () => ({ id: 1, value: randomBytes(32) });
const AAD = "user-1|store:steam|apiKey";

describe("createSecretCipher (ADR 46, 74)", () => {
  it("round-trips and uses a fresh nonce each time", () => {
    const c = createSecretCipher(key());
    const a = c.encrypt("0123456789abcdef", AAD);
    const b = c.encrypt("0123456789abcdef", AAD);
    expect(a).not.toBe(b);
    expect(a).toMatch(/^v1\.1\.[\w-]{16}\.[\w-]+$/);
    expect(a).not.toContain("0123456789abcdef");
    expect(c.decrypt(a, AAD)).toEqual({ ok: true, value: "0123456789abcdef" });
    expect(c.decrypt(c.encrypt("", AAD), AAD)).toEqual({ ok: true, value: "" });
    expect(c.activeKeyId).toBe(1);
  });

  it("a different user, scope or name in the AAD is invalid", () => {
    const c = createSecretCipher(key());
    const blob = c.encrypt("x", AAD);
    for (const aad of ["user-2|store:steam|apiKey", "user-1|store:gog|apiKey", "user-1|store:steam|steamId"]) {
      expect(c.decrypt(blob, aad)).toEqual({ ok: false, reason: "invalid" });
    }
  });

  it("a changed byte of the ciphertext or of the tag is invalid", () => {
    const c = createSecretCipher(key());
    const [v, id, n, b] = c.encrypt("secret-value", AAD).split(".") as [string, string, string, string];
    const body = Buffer.from(b, "base64url");
    for (const i of [0, body.length - 1]) {
      const t = Buffer.from(body);
      t[i] = (t[i] ?? 0) ^ 1;
      expect(c.decrypt([v, id, n, t.toString("base64url")].join("."), AAD)).toEqual({ ok: false, reason: "invalid" });
    }
  });

  it("another key in the same slot is invalid; another slot is other-key", () => {
    const blob = createSecretCipher(key()).encrypt("x", AAD);
    expect(createSecretCipher(key()).decrypt(blob, AAD)).toEqual({ ok: false, reason: "invalid" });
    expect(createSecretCipher({ ...key(), id: 2 }).decrypt(blob, AAD)).toEqual({ ok: false, reason: "other-key" });
  });

  it("broken formats are invalid", () => {
    const c = createSecretCipher(key());
    const good = c.encrypt("x", AAD);
    const [, , n, b] = good.split(".") as [string, string, string, string];
    const short = Buffer.alloc(15).toString("base64url");
    for (const bad of ["", "v1", "v2.1.a.b", `v1.0.${n}.${b}`, `v1.17.${n}.${b}`, `v1.x.${n}.${b}`, `v1.1.${n}`, `v1.1.${n}.${b}.z`, `v1.1.${Buffer.alloc(11).toString("base64url")}.${b}`, `v1.1.${n}.${short}`, `v1.1.${n}.${b}=`, `v1.1.${n}.!!`]) {
      expect(c.decrypt(bad, AAD), bad).toEqual({ ok: false, reason: "invalid" });
    }
  });

  it("refuses a key that is not 32 bytes", () => {
    for (const n of [0, 16, 31, 33, 64]) expect(() => createSecretCipher({ id: 1, value: randomBytes(n) })).toThrow();
    expect(() => createSecretCipher({ id: 0, value: randomBytes(32) })).toThrow();
  });
});
