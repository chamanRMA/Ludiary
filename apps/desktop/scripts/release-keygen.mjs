// release:keygen (ADR 90 point 11.2): an Ed25519 pair; the private key leaves encrypted with a passphrase (PKCS#8, AES-256-CBC)
// and never goes into the repository. Prints only the PUBLIC key, ready for apps/desktop/update-keys.json.
//   node release-keygen.mjs --id <keyId> --out <file outside the repository>
import { generateKeyPairSync } from "node:crypto";
import { existsSync, writeFileSync } from "node:fs";
import { arg, askPassphrase, insideRepo } from "./release-lib.mjs";

const id = arg("--id");
const out = arg("--out");
if (!id || !/^[A-Za-z0-9._-]{1,32}$/.test(id) || !out) throw new Error("usage: release-keygen.mjs --id <keyId> --out <path outside the repository>");
if (insideRepo(out)) throw new Error("the private key must be stored outside the repository");
if (existsSync(out)) throw new Error(`${out} already exists; it is never overwritten`);
const pass = await askPassphrase("Passphrase for the new private key: ");
if (pass.length < 12) throw new Error("use a passphrase of at least 12 characters");
const { publicKey, privateKey } = generateKeyPairSync("ed25519");
writeFileSync(out, privateKey.export({ format: "pem", type: "pkcs8", cipher: "aes-256-cbc", passphrase: pass }), { mode: 0o600, flag: "wx" });
const raw = Buffer.from(publicKey.export({ format: "jwk" }).x, "base64url").toString("base64");
console.log(`private key written (encrypted) to ${out}\nadd this to "keys" in apps/desktop/update-keys.json:\n  ${JSON.stringify({ [id]: raw })}`);
