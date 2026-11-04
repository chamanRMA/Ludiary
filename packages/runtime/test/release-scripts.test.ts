// ADR 90 point 11.2 and point 18 (B4): the release scripts produce what the product verifies, and the build refuses test keys.
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { verifyManifest } from "../src/updates/manifest";

const scripts = join(import.meta.dirname, "../../../apps/desktop/scripts");
let dir = "";
const run = (script: string, args: string[], env: Record<string, string> = {}) =>
  execFileSync(process.execPath, [join(scripts, script), ...args], {
    env: { ...process.env, LUDIARY_INSTALLER_DIR: join(dir, "out"), LUDIARY_UPDATE_KEYS_FILE: join(dir, "keys.json"), LUDIARY_VERSION: "0.3.0", LUDIARY_KEY_PASSPHRASE: "a passphrase for the test only", ...env },
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
const fails = (script: string, args: string[], env?: Record<string, string>) => {
  try {
    run(script, args, env);
    return "";
  } catch (e) {
    return String((e as { stderr?: unknown }).stderr);
  }
};

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "ludiary-rel-"));
  mkdirSync(join(dir, "out"));
  writeFileSync(join(dir, "out", "Ludiary-Setup-0.3.0.exe"), Buffer.alloc(1024 * 1024 + 9, 3));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("release scripts", () => {
  it("keygen, manifest and sign produce a manifest that the product accepts, and never print the private key", () => {
    const made = run("release-keygen.mjs", ["--id", "k1", "--out", join(dir, "k1.pem")]);
    const pub = JSON.parse(/\{.*\}/.exec(made)![0]) as Record<string, string>;
    const privateText = readFileSync(join(dir, "k1.pem"), "utf8");
    expect(privateText).toContain("ENCRYPTED PRIVATE KEY");
    expect(made).not.toContain(privateText.split("\n")[1]!);
    writeFileSync(join(dir, "keys.json"), JSON.stringify({ keys: pub }));
    run("release-manifest.mjs", []);
    const signed = run("release-sign.mjs", [join(dir, "k1.pem"), "--id", "k1", "--allow-test-keys"]);
    expect(signed).toContain("verified");
    const manifest = readFileSync(join(dir, "out", "ludiary-update.json"));
    const signature = readFileSync(join(dir, "out", "ludiary-update.json.sig"), "utf8");
    expect(verifyManifest({ manifest, signature, keys: pub, tagVersion: "0.3.0", current: "0.2.0", badVersions: [], target: "windows-x64" })).toMatchObject({ ok: true });
    expect(readFileSync(join(dir, "out", "SHA256SUMS.txt"), "utf8")).toContain("Ludiary-Setup-0.3.0.exe");
  });

  it("refuses a private key location inside the repository, an existing file and a short passphrase", () => {
    expect(fails("release-keygen.mjs", ["--id", "k1", "--out", join(scripts, "k1.pem")])).toContain("outside the repository");
    run("release-keygen.mjs", ["--id", "k1", "--out", join(dir, "k1.pem")]);
    expect(fails("release-keygen.mjs", ["--id", "k1", "--out", join(dir, "k1.pem")])).toContain("already exists");
    expect(fails("release-keygen.mjs", ["--id", "k2", "--out", join(dir, "k2.pem")], { LUDIARY_KEY_PASSPHRASE: "short" })).toContain("passphrase");
  });

  it("sign refuses the wrong key (it would not verify with the embedded one) and writes nothing", () => {
    const a = JSON.parse(/\{.*\}/.exec(run("release-keygen.mjs", ["--id", "k1", "--out", join(dir, "a.pem")]))![0]) as Record<string, string>;
    run("release-keygen.mjs", ["--id", "k1", "--out", join(dir, "b.pem")]);
    writeFileSync(join(dir, "keys.json"), JSON.stringify({ keys: a }));
    run("release-manifest.mjs", []);
    expect(fails("release-sign.mjs", [join(dir, "b.pem"), "--id", "k1", "--allow-test-keys"])).toContain("does not verify");
    expect(() => readFileSync(join(dir, "out", "ludiary-update.json.sig"))).toThrow();
    expect(fails("release-sign.mjs", [join(dir, "a.pem"), "--id", "unknown", "--allow-test-keys"])).toContain("not in apps/desktop/update-keys.json");
  });

  it("the keys file of the environment is ignored without the test flag, and a release never reads it", () => {
    const a = JSON.parse(/\{.*\}/.exec(run("release-keygen.mjs", ["--id", "k1", "--out", join(dir, "a.pem")]))![0]) as Record<string, string>;
    writeFileSync(join(dir, "keys.json"), JSON.stringify({ keys: a }));
    run("release-manifest.mjs", []);
    expect(fails("release-sign.mjs", [join(dir, "a.pem"), "--id", "k1"])).toContain("not in apps/desktop/update-keys.json");
    writeFileSync(join(dir, "keys.json"), JSON.stringify({ keys: { k1: Buffer.alloc(32, 1).toString("base64"), k2: Buffer.alloc(32, 2).toString("base64") } }));
    expect(fails("build.mjs", [], { LUDIARY_RELEASE: "1", LUDIARY_VERSION: "0.3.0" })).toContain("two public keys"); // the repository file is empty
  });

  it("signing refuses the keys of the tests unless the test flag is given", async () => {
    const vectors = JSON.parse(readFileSync(join(import.meta.dirname, "fixtures/update-vectors/vectors.json"), "utf8")).keys as Record<string, string>;
    const lib = (await import(pathToFileURL(join(scripts, "release-lib.mjs")).href)) as { findTestKey(k: Record<string, string>): string | null };
    const real = (n: number) => Buffer.alloc(32, n).toString("base64");
    expect(lib.findTestKey({ k1: real(1), k2: vectors["test-1"]! })).toBe("k2");
    expect(lib.findTestKey({ "test-2": real(2) })).toBe("test-2");
    expect(lib.findTestKey({ k1: real(1), k2: real(2) })).toBeNull();
  });

  it("the publication build fails with fewer than two keys or a bad version", () => {
    const build = (version: string) => fails("build.mjs", [], { LUDIARY_RELEASE: "1", LUDIARY_VERSION: version });
    expect(build("0.3.0")).toContain("two public keys");
    expect(build("0.3.0-rc1")).toContain("X.Y.Z");
  });
});
