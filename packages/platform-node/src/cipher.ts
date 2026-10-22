// SecretCipher (ADR 46, 74): AES-256-GCM from node:crypto. Format `v1.<keyId>.<nonce>.<ciphertext+tag>` (base64url).
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import type { SecretCipher } from "@ludiary/contracts";

const NONCE_BYTES = 12;
const TAG_BYTES = 16;
const B64URL = /^[A-Za-z0-9_-]+$/;
const KEY_ID = /^(?:[1-9]|1[0-6])$/;

/** Throws unless the key has exactly 32 bytes. The key is copied: later changes to the caller's buffer do not affect it. */
export function createSecretCipher(key: { id: number; value: Uint8Array }): SecretCipher {
  if (!Number.isInteger(key.id) || key.id < 1 || key.id > 16) throw new Error("key id must be an integer between 1 and 16");
  if (key.value.length !== 32) throw new Error("the key must be 32 bytes");
  const k = Buffer.from(key.value);
  return {
    activeKeyId: key.id,
    encrypt(plaintext, aad) {
      const nonce = randomBytes(NONCE_BYTES);
      const c = createCipheriv("aes-256-gcm", k, nonce);
      c.setAAD(Buffer.from(aad, "utf8"));
      const body = Buffer.concat([c.update(plaintext, "utf8"), c.final(), c.getAuthTag()]);
      return `v1.${key.id}.${nonce.toString("base64url")}.${body.toString("base64url")}`;
    },
    decrypt(blob, aad) {
      const parts = blob.split(".");
      if (parts.length !== 4 || parts[0] !== "v1" || !KEY_ID.test(parts[1] ?? "")) return { ok: false, reason: "invalid" };
      const [, id, n, b] = parts as [string, string, string, string];
      if (!B64URL.test(n) || !B64URL.test(b)) return { ok: false, reason: "invalid" };
      const nonce = Buffer.from(n, "base64url");
      const body = Buffer.from(b, "base64url");
      if (nonce.length !== NONCE_BYTES || body.length < TAG_BYTES) return { ok: false, reason: "invalid" };
      if (Number(id) !== key.id) return { ok: false, reason: "other-key" };
      try {
        const d = createDecipheriv("aes-256-gcm", k, nonce);
        d.setAAD(Buffer.from(aad, "utf8"));
        d.setAuthTag(body.subarray(body.length - TAG_BYTES));
        const plain = Buffer.concat([d.update(body.subarray(0, body.length - TAG_BYTES)), d.final()]);
        return { ok: true, value: plain.toString("utf8") };
      } catch {
        return { ok: false, reason: "invalid" };
      }
    },
  };
}
