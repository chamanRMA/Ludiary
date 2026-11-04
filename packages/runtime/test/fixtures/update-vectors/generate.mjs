// Regenerates vectors.json (ADR 90 point 18, M1): `node generate.mjs`. Test keys only, derived from fixed strings; they sign
// nothing real and the build refuses to embed them (B4). Vitest (runtime) and `go test` (launcher) read the same file.
import { createHash, createPrivateKey, sign } from "node:crypto";
import { writeFileSync } from "node:fs";

const keyFrom = (label) => {
  const seed = createHash("sha256").update(label).digest();
  const key = createPrivateKey({ key: Buffer.concat([Buffer.from("302e020100300506032b657004220420", "hex"), seed]), format: "der", type: "pkcs8" });
  return { key, pub: Buffer.from(key.export({ format: "jwk" }).x, "base64url").toString("base64") };
};
const k1 = keyFrom("ludiary update test vectors 1");
const k2 = keyFrom("ludiary update test vectors 2");
const CONTEXT = "ludiary-update-v1\n";
const sig = (text, k = k1, id = "test-1", ctx = CONTEXT) => `ludiary-sig-v1 ${id} ${sign(null, Buffer.from(ctx + text), k.key).toString("base64")}\n`;
const manifest = (over = {}, file = {}) =>
  JSON.stringify({
    schema: 1, product: "ludiary", channel: "stable", version: "0.3.0", publishedAt: "2026-11-20T10:00:00Z",
    files: { "windows-x64": { name: "Ludiary-Setup-0.3.0.exe", size: 28311552, sha256: "ab".repeat(32), ...file } }, ...over,
  });
const base = { tag: "0.3.0", current: "0.2.0", badVersions: [], target: "windows-x64", assets: [{ name: "Ludiary-Setup-0.3.0.exe", size: 28311552 }] };
const signed = (name, text, expect, over = {}) => ({ name, manifest: text, signature: sig(text), ...base, expect, ...over });
const ok = manifest();
const cases = [
  signed("valid", ok, "ok"),
  { ...signed("signature of another key", ok, "signature"), signature: sig(ok, k2) },
  { ...signed("one byte changed", ok.replace("0.3.0", "0.3.1"), "signature"), signature: sig(ok) },
  { ...signed("unknown keyId", ok, "key"), signature: sig(ok, k1, "other") },
  { ...signed("no context prefix", ok, "signature"), signature: sig(ok, k1, "test-1", "") },
  { ...signed("signature line malformed", ok, "signature"), signature: "ludiary-sig-v1 test-1 AAAA\n" },
  signed("schema 2", manifest({ schema: 2 }), "schema"),
  signed("other product", manifest({ product: "other" }), "format"),
  signed("other channel", manifest({ channel: "beta" }), "format"),
  signed("tag differs", ok, "version", { tag: "0.3.1" }),
  signed("same version as current", ok, "not-newer", { current: "0.3.0" }),
  signed("lower than current", ok, "not-newer", { current: "0.10.0" }),
  signed("listed as bad", ok, "bad-version", { badVersions: ["0.3.0"] }),
  signed("no target", ok, "target", { target: "linux-x64" }),
  signed("name incoherent", manifest({}, { name: "Ludiary-Setup-0.2.9.exe" }), "file"),
  signed("size too small", manifest({}, { size: 1000 }), "file", { assets: [{ name: "Ludiary-Setup-0.3.0.exe", size: 1000 }] }),
  signed("size too big", manifest({}, { size: 300 * 1024 * 1024 }), "file"),
  signed("hash not hex", manifest({}, { sha256: "XY".repeat(32) }), "file"),
  signed("asset size differs", ok, "asset", { assets: [{ name: "Ludiary-Setup-0.3.0.exe", size: 5 * 1024 * 1024 }], nodeOnly: true }),
  signed("key differing only in case", manifest({ Version: "0.9.9" }), "format"),
  signed("file key differing only in case", manifest({}, { Name: "Ludiary-Setup-0.9.9.exe" }), "format"),
  signed("version with path", manifest({ version: "0.3.0/../x" }), "format", { tag: null }),
];
writeFileSync(new URL("./vectors.json", import.meta.url), JSON.stringify({ keys: { "test-1": k1.pub }, context: CONTEXT, cases }, null, 2) + "\n");
