// ADR 90 point 11.2 and point 18 (B4): the release scripts produce what the product verifies, and the build refuses test keys.
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
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

// ---- ADR 90 point 21: semi-automatic publication
interface Plan {
  release: boolean;
  reason?: string;
  version?: string;
  pr?: number;
  notes?: string;
}
const planMod = (await import(pathToFileURL(join(scripts, "release-plan.mjs")).href)) as {
  planRelease(i: { pulls: unknown; tags: unknown; sha: string }): Plan;
  parseRefLines(text: string): { ref: string }[];
  requiredArgs(argv: string[], names: string[]): Record<string, string>;
  NOTES_LIMIT: number;
};
const SHA = "a".repeat(40);
const pull = (over: object = {}) => ({ number: 7, title: "Add things", body: "Some notes", merged_at: "2026-11-04T10:00:00Z", base: { ref: "main" }, merge_commit_sha: SHA, labels: [{ name: "release:patch" }], ...over });
const tag = (v: string) => ({ ref: `refs/tags/v${v}` });
const plan = (pulls: unknown[], tags: unknown[] = [tag("1.2.3")], sha = SHA) => planMod.planRelease({ pulls, tags, sha });

describe("planRelease", () => {
  it("makes no version without a merged pull request, without a release label, or with a different merge commit", () => {
    expect(plan([]).release).toBe(false);
    expect(plan([pull({ labels: [{ name: "bug" }] })])).toMatchObject({ release: false, reason: expect.stringContaining("no release:* label") });
    expect(plan([pull({ merge_commit_sha: "b".repeat(40) })]).release).toBe(false);
    expect(plan([pull({ merged_at: null })]).release).toBe(false);
    expect(plan([pull({ base: { ref: "dev" } })]).release).toBe(false);
    expect(plan(null as never).release).toBe(false);
  });

  it("fails with more than one release:* label", () => {
    expect(() => plan([pull({ labels: [{ name: "release:patch" }, { name: "release:minor" }] })])).toThrow(/more than one release/);
  });

  it("bumps patch, minor and major from the highest tag; non-semver tags are ignored; no tags is 0.0.0", () => {
    const tags = [tag("1.2.3"), tag("1.10.0"), { ref: "refs/tags/v2.0.0-rc1" }, { ref: "refs/tags/vNext" }, { ref: "refs/tags/v1.9.9" }, { ref: "refs/tags/x1.99.0" }];
    const v = (label: string, t: unknown[] = tags) => plan([pull({ labels: [{ name: label }] })], t).version;
    expect(v("release:patch")).toBe("1.10.1");
    expect(v("release:minor")).toBe("1.11.0");
    expect(v("release:major")).toBe("2.0.0");
    expect(v("release:patch", [])).toBe("0.0.1");
    expect(v("release:minor", [])).toBe("0.1.0");
    expect(v("release:major", [])).toBe("1.0.0");
  });

  it("notes: the description, the title when it is empty or null, and a footer with the PR and the short commit", () => {
    expect(plan([pull()]).notes).toBe(`Some notes\n\n---\nPR #7 · ${SHA.slice(0, 7)}\n`);
    expect(plan([pull({ body: null })]).notes).toContain("Add things");
    expect(plan([pull({ body: "  \n " })]).notes).toContain("Add things");
  });

  it("notes: a long body is cut by characters without splitting one, and says where the rest is", () => {
    const body = "😀".repeat(planMod.NOTES_LIMIT + 5); // surrogate pairs: a byte or UTF-16 cut would break them
    const notes = plan([pull({ body })]).notes!;
    const kept = notes.split("\n\n… (notas recortadas")[0]!;
    expect(Array.from(kept)).toHaveLength(planMod.NOTES_LIMIT);
    expect(kept).not.toMatch(/[\ud800-\udbff]$/);
    expect(notes).toContain("ver el PR #7");
    expect(notes).toMatch(/PR #7 · aaaaaaa\n$/);
  });

  it("a bad commit or PR number never reaches the output", () => {
    expect(() => plan([pull()], [], "not-a-sha")).toThrow();
    for (const number of [0, -1, 1.5, "7; echo x", null]) expect(() => plan([pull({ number })])).toThrow();
  });

  it("reads the tags one per line", () => {
    expect(planMod.parseRefLines("refs/tags/v1.0.0\nrefs/tags/v1.1.0\n")).toEqual([{ ref: "refs/tags/v1.0.0" }, { ref: "refs/tags/v1.1.0" }]);
    expect(planMod.parseRefLines("")).toEqual([]);
  });

  it("requires a value for every flag and never takes argv[0] for a missing one", () => {
    const names = ["--pulls", "--tags", "--sha", "--out"];
    const ok = ["node", "plan.mjs", "--pulls", "p", "--tags", "t", "--sha", SHA, "--out", "n"];
    expect(planMod.requiredArgs(ok, names)["--out"]).toBe("n");
    expect(() => planMod.requiredArgs(ok.slice(0, -2), names)).toThrow(/--out/);
    expect(() => planMod.requiredArgs([...ok.slice(0, -1), "--tags"], names)).toThrow(/--out/);
    expect(() => planMod.requiredArgs(["node", "plan.mjs", "--pulls", "--tags", "t", "--sha", SHA, "--out", "n"], names)).toThrow(/--pulls/);
  });

  it("the command line aborts without writing anywhere when a flag is missing, and keeps the PR text byte for byte", () => {
    writeFileSync(join(dir, "pulls.json"), JSON.stringify([pull({ body: "[x] [y]\n] [ z" })]));
    writeFileSync(join(dir, "tags.txt"), "refs/tags/v0.1.0\n");
    const base = ["--pulls", join(dir, "pulls.json"), "--tags", join(dir, "tags.txt"), "--sha", SHA];
    expect(fails("release-plan.mjs", base)).toContain("missing value for --out");
    expect(fails("release-plan.mjs", [...base, "--out"])).toContain("missing value for --out");
    run("release-plan.mjs", [...base, "--out", join(dir, "notes.md")]);
    expect(readFileSync(join(dir, "notes.md"), "utf8")).toContain("[x] [y]\n] [ z");
  });
});

const pubMod = (await import(pathToFileURL(join(scripts, "release-publish.mjs")).href)) as {
  checkDraft(view: unknown, version: string): void;
  checkDownloaded(dir: string, version: string): void;
  checkUploaders(assets: unknown): void;
};

describe("release-publish checks", () => {
  const V = "0.3.0";
  const view = (over: object = {}) => ({ isDraft: true, targetCommitish: SHA, assets: [{ name: `Ludiary-Setup-${V}.exe` }, { name: "ludiary-update.json" }, { name: "SHA256SUMS.txt" }], ...over });

  it("the draft must be a draft with exactly the three files of the CI, no .sig and a full commit", () => {
    expect(() => pubMod.checkDraft(view(), V)).not.toThrow();
    expect(() => pubMod.checkDraft(view({ isDraft: false }), V)).toThrow(/not a draft/);
    expect(() => pubMod.checkDraft(view({ assets: [...view().assets, { name: "ludiary-update.json.sig" }] }), V)).toThrow(/already has a .sig/);
    expect(() => pubMod.checkDraft(view({ assets: view().assets.slice(1) }), V)).toThrow(/exactly/);
    expect(() => pubMod.checkDraft(view({ targetCommitish: "main" }), V)).toThrow(/commit SHA/);
  });

  it("the three assets must come from github-actions[bot]", () => {
    const asset = (name: string, login = "github-actions[bot]") => ({ name, uploader: { login } });
    expect(() => pubMod.checkUploaders([asset("a"), asset("b"), asset("c")])).not.toThrow();
    expect(() => pubMod.checkUploaders([asset("a"), asset("b", "someone")])).toThrow(/b/);
    expect(() => pubMod.checkUploaders([{ name: "x" }])).toThrow();
    expect(() => pubMod.checkUploaders([])).toThrow();
    expect(() => pubMod.checkUploaders(null)).toThrow();
  });

  interface Over {
    manifest?: (m: any) => void;
    sums?: (s: string) => string;
    installer?: Buffer;
  }
  function files(over: Over = {}) {
    const installer = over.installer ?? Buffer.alloc(2048, 5);
    const name = `Ludiary-Setup-${V}.exe`;
    const sha = (b: Buffer | string) => createHash("sha256").update(b).digest("hex");
    const m = { schema: 1, product: "ludiary", channel: "stable", version: V, publishedAt: "x", files: { "windows-x64": { name, size: 2048, sha256: sha(Buffer.alloc(2048, 5)) } } };
    over.manifest?.(m);
    const manifest = JSON.stringify(m);
    writeFileSync(join(dir, name), installer);
    writeFileSync(join(dir, "ludiary-update.json"), manifest);
    writeFileSync(join(dir, "SHA256SUMS.txt"), (over.sums ?? ((s: string) => s))(`${sha(installer)}  ${name}\n${sha(manifest)}  ludiary-update.json\n`));
  }

  it("accepts what the CI built", () => {
    files();
    expect(() => pubMod.checkDownloaded(dir, V)).not.toThrow();
  });
  it.each<[string, Over, RegExp]>([
    ["another version", { manifest: (m) => (m.version = "0.3.1") }, /says version/],
    ["an extra key", { manifest: (m) => (m.extra = 1) }, /exactly schema/],
    ["a missing key", { manifest: (m) => delete m.publishedAt }, /exactly schema/],
    ["schema 2", { manifest: (m) => (m.schema = 2) }, /schema 1/],
    ["another product", { manifest: (m) => (m.product = "other") }, /schema 1/],
    ["the beta channel", { manifest: (m) => (m.channel = "beta") }, /schema 1/],
    ["another target", { manifest: (m) => (m.files["linux-x64"] = m.files["windows-x64"]) }, /windows-x64/],
    ["another name", { manifest: (m) => (m.files["windows-x64"].name = "Ludiary-Setup-0.2.0.exe") }, /names/],
    ["another size", { manifest: (m) => (m.files["windows-x64"].size = 2049) }, /size/],
    ["another hash", { manifest: (m) => (m.files["windows-x64"].sha256 = "0".repeat(64)) }, /SHA-256/],
    ["an installer that is not the one in the manifest", { installer: Buffer.alloc(2048, 6) }, /SHA-256/],
    ["SHA256SUMS with a wrong hash", { sums: (s) => s.replace(/^./, "f") }, /SHA256SUMS/],
    ["SHA256SUMS missing a file", { sums: (s) => s.split("\n")[0] + "\n" }, /SHA256SUMS/],
    ["SHA256SUMS that is not a list of hashes", { sums: () => "garbage\n" }, /SHA256SUMS/],
  ])("refuses %s", (_n, over, message) => {
    files(over);
    expect(() => pubMod.checkDownloaded(dir, V)).toThrow(message);
  });
});
