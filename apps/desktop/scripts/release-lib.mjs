// Shared by the release scripts (ADR 90 point 11). Nothing here prints a key.
import { createInterface } from "node:readline";
import { Writable } from "node:stream";
import { readFileSync } from "node:fs";
import { dirname, join, relative, resolve, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";

export const desktop = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const repoRoot = resolve(desktop, "../..");
// LUDIARY_INSTALLER_DIR exists for the tests of these scripts and for release:publish (which signs in a temporary folder); they run on
// the maintainer machine or the CI, never in the product.
export const installerDir = process.env.LUDIARY_INSTALLER_DIR ?? join(desktop, "dist/installer");
export const SIGNATURE_CONTEXT = "ludiary-update-v1\n";

/** True when `file` is inside the repository: a private key must never be there (CLAUDE.md invariant 5). */
export const insideRepo = (file) => {
  const rel = relative(repoRoot, resolve(file));
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
};

/** Asks for the passphrase without echo. LUDIARY_KEY_PASSPHRASE exists for unattended use (never log it). */
export async function askPassphrase(prompt) {
  if (process.env.LUDIARY_KEY_PASSPHRASE) return process.env.LUDIARY_KEY_PASSPHRASE;
  let muted = false;
  const out = new Writable({
    write(chunk, _e, cb) {
      if (!muted) process.stderr.write(chunk);
      cb();
    },
  });
  const rl = createInterface({ input: process.stdin, output: out, terminal: true });
  return new Promise((done) => {
    rl.question(prompt, (answer) => {
      muted = false;
      process.stderr.write("\n");
      rl.close();
      done(answer);
    });
    muted = true;
  });
}

/** Only the tests of these scripts pass this flag; without it the keys file of the repository is the only source. */
export const allowTestKeys = process.argv.includes("--allow-test-keys");

/** The id of the first key that belongs to the tests (id starting with "test" or a public key of the shared vectors), or null. */
export function findTestKey(keys) {
  const vectors = JSON.parse(readFileSync(join(repoRoot, "packages/runtime/test/fixtures/update-vectors/vectors.json"), "utf8")).keys;
  return Object.entries(keys).find(([id, k]) => id.startsWith("test") || Object.values(vectors).includes(k))?.[0] ?? null;
}

export function readPublicKeys() {
  const file = allowTestKeys && process.env.LUDIARY_UPDATE_KEYS_FILE ? process.env.LUDIARY_UPDATE_KEYS_FILE : join(desktop, "update-keys.json");
  const keys = JSON.parse(readFileSync(file, "utf8")).keys ?? {};
  const bad = allowTestKeys ? null : findTestKey(keys);
  if (bad) throw new Error(`key ${bad} belongs to the tests; it cannot be used to sign a release`);
  return keys;
}
/** The version comes from the tag (ADR 90 point 21), never from package.json, which stays at 0.0.0 as the mark of development builds. */
export const version = () => {
  const v = process.env.LUDIARY_VERSION;
  if (!v) throw new Error("set LUDIARY_VERSION=X.Y.Z (the CI sets it from the tag of the pull request)");
  return v;
};

export const arg = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : fallback;
};
