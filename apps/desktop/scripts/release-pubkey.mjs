// release:pubkey <key file> (ADR 90 point 11.2): prints the PUBLIC key of an encrypted private key and which id of
// apps/desktop/update-keys.json it matches, to find a mix-up before signing. Never prints the private key.
import { createPrivateKey, createPublicKey } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { askPassphrase, desktop } from "./release-lib.mjs";

const keyFile = process.argv[2];
if (!keyFile || keyFile.startsWith("--")) throw new Error("usage: release-pubkey.mjs <private key file>");
const key = createPrivateKey({ key: readFileSync(keyFile), format: "pem", passphrase: await askPassphrase("Passphrase of the private key: ") });
const raw = Buffer.from(createPublicKey(key).export({ format: "jwk" }).x, "base64url").toString("base64");
const keys = JSON.parse(readFileSync(join(desktop, "update-keys.json"), "utf8")).keys ?? {};
const match = Object.entries(keys).find(([, k]) => k === raw)?.[0];
console.log(`public key: ${raw}\n${match ? `matches "${match}" in update-keys.json` : "matches NO key in update-keys.json"}`);
