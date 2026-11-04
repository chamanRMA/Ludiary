// release:sign <key file> [--id <keyId>] (ADR 90 point 11.2): signs ludiary-update.json and, at once, verifies the result with the
// public keys that the build embeds, so nothing is published that no installation can verify. Never prints the key.
import { createPrivateKey, createPublicKey, sign, verify } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { SIGNATURE_CONTEXT, arg, askPassphrase, insideRepo, installerDir, readPublicKeys } from "./release-lib.mjs";

const keyFile = process.argv[2];
const id = arg("--id", "k1");
if (!keyFile || keyFile.startsWith("--")) throw new Error("usage: release-sign.mjs <private key file> [--id <keyId>]");
if (insideRepo(keyFile)) throw new Error("the private key must not live inside the repository");
const manifest = readFileSync(join(installerDir, "ludiary-update.json"));
const key = createPrivateKey({ key: readFileSync(keyFile), format: "pem", passphrase: await askPassphrase("Passphrase of the private key: ") });
const signed = Buffer.concat([Buffer.from(SIGNATURE_CONTEXT), manifest]);
const signature = sign(null, signed, key);

const raw = readPublicKeys()[id];
if (!raw) throw new Error(`keyId ${id} is not in apps/desktop/update-keys.json: no installation would trust this signature`);
const pub = createPublicKey({ key: { kty: "OKP", crv: "Ed25519", x: Buffer.from(raw, "base64").toString("base64url") }, format: "jwk" });
if (!verify(null, signed, pub, signature)) throw new Error("the signature does not verify with the embedded public key (wrong private key?); nothing was written");
writeFileSync(join(installerDir, "ludiary-update.json.sig"), `ludiary-sig-v1 ${id} ${signature.toString("base64")}\n`);
console.log(`signed with ${id}; verified against the embedded public key`);
