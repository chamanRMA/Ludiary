// release:publish <X.Y.Z> <private key file> [--id k1] (ADR 90 point 21.6): the maintainer step after the CI made the draft.
// Checks that the draft is what the CI built, signs it with release-sign.mjs, uploads the .sig and publishes. gh and git run with
// fixed arguments and no shell. It never prints the key or the passphrase and leaves nothing in the repository.
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { arg, desktop, insideRepo, repoRoot, tagFor } from "./release-lib.mjs";

const VERSION = /^\d+\.\d+\.\d+$/;
const KEYS = "apps/desktop/update-keys.json";
const sha256 = (file) => createHash("sha256").update(readFileSync(file)).digest("hex");

/** The draft must hold exactly the three files of the CI and no signature yet. `view` is `gh release view --json ...`. */
export function checkDraft(view, version) {
  if (view?.isDraft !== true) throw new Error(`${tagFor(version)} is not a draft: it is published already and cannot be changed`);
  const names = (view.assets ?? []).map((a) => a?.name).sort();
  const expected = [`Ludiary-Setup-${version}.exe`, "SHA256SUMS.txt", "ludiary-update.json"].sort();
  if (names.some((n) => n === "ludiary-update.json.sig")) throw new Error("the draft already has a .sig");
  if (names.length !== expected.length || names.some((n, i) => n !== expected[i])) throw new Error(`the draft must have exactly ${expected.join(", ")}; it has ${names.join(", ") || "nothing"}`);
  if (!/^[0-9a-f]{40}$/.test(view.targetCommitish ?? "")) throw new Error("the draft does not point at a full commit SHA");
}

/** The three assets must have been uploaded by the workflow itself (point 21.6); `assets` is `gh api repos/.../releases/<id>/assets`. */
export function checkUploaders(assets) {
  const bad = (Array.isArray(assets) ? assets : []).filter((a) => a?.uploader?.login !== "github-actions[bot]").map((a) => a?.name);
  if (!Array.isArray(assets) || assets.length === 0 || bad.length > 0) throw new Error(`these assets were not uploaded by github-actions[bot]: ${bad.join(", ") || "(none listed)"}`);
}

/** What was downloaded must say what it should: version, name, size and hash of the installer, and SHA256SUMS. Throws on the first mismatch. */
export function checkDownloaded(dir, version) {
  const name = `Ludiary-Setup-${version}.exe`;
  const manifest = JSON.parse(readFileSync(join(dir, "ludiary-update.json"), "utf8"));
  const keys = Object.keys(manifest ?? {}).sort().join();
  if (keys !== "channel,files,product,publishedAt,schema,version") throw new Error("the manifest does not have exactly schema, product, channel, version, publishedAt and files");
  if (manifest.schema !== 1 || manifest.product !== "ludiary" || manifest.channel !== "stable") throw new Error("the manifest is not schema 1, product ludiary, channel stable");
  if (Object.keys(manifest.files ?? {}).join() !== "windows-x64") throw new Error("the manifest must list exactly windows-x64");
  if (manifest.version !== version) throw new Error(`the manifest says version ${manifest.version}, not ${version}`);
  const file = manifest.files?.["windows-x64"];
  if (file?.name !== name) throw new Error(`the manifest names ${file?.name}, not ${name}`);
  const installer = join(dir, name);
  if (file.size !== statSync(installer).size) throw new Error("the size in the manifest is not the size of the installer");
  const hash = sha256(installer);
  if (file.sha256 !== hash) throw new Error("the SHA-256 in the manifest is not the one of the installer");
  const sums = new Map(readFileSync(join(dir, "SHA256SUMS.txt"), "utf8").split(/\r?\n/).filter(Boolean).map((l) => {
    const m = /^([0-9a-f]{64}) [ *](.+)$/.exec(l);
    if (!m) throw new Error("SHA256SUMS.txt has a line that is not `<sha256>  <name>`");
    return [m[2], m[1]];
  }));
  if (sums.size !== 2 || sums.get(name) !== hash || sums.get("ludiary-update.json") !== sha256(join(dir, "ludiary-update.json"))) {
    throw new Error("SHA256SUMS.txt does not match the downloaded files");
  }
}

const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { cwd: repoRoot, encoding: "utf8", ...opts });

async function main() {
  const [version, keyFile] = process.argv.slice(2);
  const id = arg("--id", "k1");
  if (!version || !VERSION.test(version) || !keyFile) throw new Error("usage: release:publish <X.Y.Z> <private key file> [--id k1]");
  const tag = tagFor(version);

  const view = JSON.parse(run("gh", ["release", "view", tag, "--json", "isDraft,targetCommitish,assets,url,databaseId"]));
  checkDraft(view, version);
  if (!Number.isSafeInteger(view.databaseId)) throw new Error("gh did not return the release id");
  checkUploaders(JSON.parse(run("gh", ["api", `repos/chamanRMA/Ludiary/releases/${view.databaseId}/assets`])));
  console.log(`Draft ${view.url}\nBuilt from commit ${view.targetCommitish}\nWorkflow runs: https://github.com/chamanRMA/Ludiary/actions (review the run of that commit before going on)`);

  // The keys that release:sign verifies with must be the ones inside the installer the CI built.
  run("git", ["fetch", "--quiet", "origin"]);
  const inDraft = execFileSync("git", ["show", `${view.targetCommitish}:${KEYS}`], { cwd: repoRoot });
  if (!inDraft.equals(readFileSync(join(desktop, "update-keys.json")))) throw new Error(`${KEYS} in your copy differs from the one in the draft commit: check out that commit first`);

  const tmp = mkdtempSync(join(tmpdir(), "ludiary-release-"));
  try {
    if (insideRepo(tmp)) throw new Error("the temporary folder is inside the repository");
    run("gh", ["release", "download", tag, "--dir", tmp]);
    checkDownloaded(tmp, version);
    const signed = spawnSync(process.execPath, [join(desktop, "scripts/release-sign.mjs"), keyFile, "--id", id], { env: { ...process.env, LUDIARY_INSTALLER_DIR: tmp }, stdio: "inherit" });
    if (signed.status !== 0) throw new Error("signing failed; nothing was uploaded");
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const answer = await rl.question(`Upload the signature and publish ${tag} now? Immutable releases cannot be changed afterwards. Type "yes": `);
    rl.close();
    if (answer.trim() !== "yes") {
      console.log("Nothing was uploaded or published.");
      return;
    }
    run("gh", ["release", "upload", tag, join(tmp, "ludiary-update.json.sig")]);
    run("gh", ["release", "edit", tag, "--draft=false", "--latest"]);
    console.log(`Published ${tag}. You can check the attestation with: gh release verify ${tag}`);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}
