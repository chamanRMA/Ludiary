// release:plan (ADR 90 point 21): decides, from the merged pull request of a push to main, whether a release draft is made and with
// which version. Only node:* modules. The body of the pull request is untrusted text: it is read from a JSON file written by `gh`
// and written to notes.md; it never goes through a shell, $GITHUB_OUTPUT or $GITHUB_ENV.
//   node release-plan.mjs --pulls pulls.json --tags tags.json --sha <commit> --out notes.md
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { tagFor } from "./release-lib.mjs";

const VERSION = /^\d+\.\d+\.\d+$/;
const TAG = /^refs\/tags\/v?(\d+\.\d+\.\d+)$/; // both forms count for the base (ADR 90 point 22)
const SHA = /^[0-9a-f]{40}$/;
const LABELS = { "release:patch": "patch", "release:minor": "minor", "release:major": "major" };
export const NOTES_LIMIT = 30_000;

const cmp = (a, b) => {
  const x = a.split(".").map(Number);
  const y = b.split(".").map(Number);
  return x[0] - y[0] || x[1] - y[1] || x[2] - y[2];
};

/**
 * @param {{ pulls: unknown, tags: unknown, sha: string }} input  responses of commits/{sha}/pulls and git/matching-refs/tags/
 * @returns {{ release: false, reason: string } | { release: true, version: string, tag: string, pr: number, notes: string }}
 * Throws when the pull request has more than one release:* label (the run must fail, nothing else runs).
 */
export function planRelease({ pulls, tags, sha }) {
  if (typeof sha !== "string" || !SHA.test(sha)) throw new Error("the commit is not a full SHA");
  const merged = (Array.isArray(pulls) ? pulls : []).filter((p) => p && p.merged_at && p.base?.ref === "main" && p.merge_commit_sha === sha);
  if (merged.length !== 1) return { release: false, reason: "no merged pull request for this commit (direct push), so there is no version" };
  const pr = merged[0];
  if (!Number.isSafeInteger(pr.number) || pr.number < 1) throw new Error("the pull request number is not valid");

  const wanted = (Array.isArray(pr.labels) ? pr.labels : []).map((l) => l?.name).filter((n) => Object.hasOwn(LABELS, n));
  if (new Set(wanted).size > 1) throw new Error(`pull request #${pr.number} has more than one release:* label (${[...new Set(wanted)].join(", ")}): keep one and re-run all jobs`);
  if (wanted.length === 0) return { release: false, reason: "no release:* label, so there is no version" };

  let base = "0.0.0";
  for (const t of Array.isArray(tags) ? tags : []) {
    const m = typeof t?.ref === "string" ? TAG.exec(t.ref) : null;
    if (m && cmp(m[1], base) > 0) base = m[1];
  }
  const [maj, min, pat] = base.split(".").map(Number);
  const bump = LABELS[wanted[0]];
  const version = bump === "major" ? `${maj + 1}.0.0` : bump === "minor" ? `${maj}.${min + 1}.0` : `${maj}.${min}.${pat + 1}`;
  if (!VERSION.test(version)) throw new Error("the computed version is not valid");

  // Notes: the PR description (or its title when empty), capped by characters and never in the middle of one, plus a footer.
  const title = typeof pr.title === "string" ? pr.title : `PR #${pr.number}`;
  const raw = typeof pr.body === "string" && pr.body.trim() !== "" ? pr.body : title;
  const chars = Array.from(raw);
  const body = chars.length > NOTES_LIMIT ? `${chars.slice(0, NOTES_LIMIT).join("")}\n\n… (notas recortadas, ver el PR #${pr.number})` : raw;
  return { release: true, version, tag: tagFor(version), pr: pr.number, notes: `${body}\n\n---\nPR #${pr.number} · ${sha.slice(0, 7)}\n` };
}

/** The tags file has one `refs/tags/...` per line (`gh api --paginate --jq '.[].ref'`); no JSON is rebuilt from pages. */
export function parseRefLines(text) {
  return text.split(/\r?\n/).filter((l) => l !== "").map((ref) => ({ ref }));
}

/** Every flag must be present with a value that is not another flag: a missing --out must never turn into argv[0]. */
export function requiredArgs(argv, names) {
  const out = {};
  for (const n of names) {
    const i = argv.indexOf(n);
    const v = i >= 0 ? argv[i + 1] : undefined;
    if (v === undefined || v === "" || v.startsWith("--")) throw new Error(`missing value for ${n}`);
    out[n] = v;
  }
  return out;
}

function main() {
  const a = requiredArgs(process.argv, ["--pulls", "--tags", "--sha", "--out"]);
  // pulls.json is one response (an array of objects): parsed as it is, so the text of the PR is never altered.
  const pulls = JSON.parse(readFileSync(a["--pulls"], "utf8"));
  const tags = parseRefLines(readFileSync(a["--tags"], "utf8"));
  const plan = planRelease({ pulls, tags, sha: a["--sha"] });
  const out = process.env.GITHUB_OUTPUT;
  const lines = plan.release ? [`release=true`, `version=${plan.version}`, `tag=${plan.tag}`, `pr=${plan.pr}`] : [`release=false`];
  if (out) appendFileSync(out, lines.join("\n") + "\n");
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, plan.release ? `Draft ${plan.tag} for PR #${plan.pr}\n` : `${plan.reason}\n`);
  if (plan.release) writeFileSync(a["--out"], plan.notes);
  console.log(plan.release ? `release ${plan.tag} for PR #${plan.pr}` : plan.reason);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
