// CI check of ADR 60 and 70: fails if a production npm dependency has a license outside the GPL-3.0-compatible list.
// Go modules have no license metadata: build.mjs only refuses the ones without a license file.
// Usage: pnpm licenses list --json --prod -r > licenses.json && node apps/desktop/scripts/check-licenses.mjs licenses.json
import { readFileSync } from "node:fs";

const ALLOWED = /^(MIT|0BSD|BSD-[23]-Clause|ISC|Apache-2\.0|MPL-2\.0|LGPL-(2\.1|3\.0)(-only|-or-later|\+)?|GPL-3\.0(-only|-or-later|\+)?)$/;

const allowed = (license, name) => {
  const id = (s) => s === "PASS" || ALLOWED.test(s) || (s === "OFL-1.1" && name.startsWith("@fontsource")); // ADR 70
  const flat = (s) => s.trim().split(/\s+OR\s+/).some((alt) => alt.split(/\s+AND\s+/).every(id));
  let expr = license;
  // SPDX expressions: each innermost parenthesis is replaced by its result. "WITH" never matches, so it is refused.
  while (expr.includes("(")) {
    const next = expr.replace(/\(([^()]*)\)/, (_, inner) => (flat(inner) ? "PASS" : "FAIL"));
    if (next === expr) return false;
    expr = next;
  }
  return flat(expr);
};

const packages = Object.entries(JSON.parse(readFileSync(process.argv[2], "utf8"))).flatMap(([license, list]) => list.map((p) => ({ ...p, license: p.license ?? license })));
if (packages.length === 0) throw new Error("no packages to check: the license list is empty");
const rejected = packages.filter((p) => !allowed(p.license, p.name));
for (const p of rejected) console.error(`rejected: ${p.name}@${p.versions.join(", ")} [${p.license}]`);
if (rejected.length) process.exit(1);
console.log(`licenses ok (${packages.length} packages)`);
