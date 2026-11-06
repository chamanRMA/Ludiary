// ADR 60 and 70: the license check of the CI, and the license lookup that makes the build fail.
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const scripts = join(import.meta.dirname, "../../../apps/desktop/scripts");
let dir = "";
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "ludiary-licenses-"));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const check = (list: unknown) => {
  const file = join(dir, "licenses.json");
  writeFileSync(file, JSON.stringify(list));
  return spawnSync(process.execPath, [join(scripts, "check-licenses.mjs"), file], { encoding: "utf8" });
};
const one = (license: string, name = "some-package") => check({ [license]: [{ name, versions: ["1.0.0"], license }] });

describe("check-licenses", () => {
  it.each(["MIT", "BSD-3-Clause", "ISC", "Apache-2.0", "MPL-2.0", "LGPL-3.0-only", "GPL-3.0-or-later", "(MIT OR CC0-1.0)", "(MIT OR Apache-2.0) AND ISC"])("accepts %s", (license) => {
    expect(one(license).status).toBe(0);
  });

  it.each(["GPL-2.0-only", "AGPL-3.0-only", "BSD-4-Clause", "CC-BY-4.0", "Unknown", "MIT AND CC-BY-4.0", "(MIT OR Apache-2.0) AND Zlib", "GPL-2.0-only WITH Classpath-exception-2.0", "(MIT"])("rejects %s", (license) => {
    const result = one(license);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("some-package");
  });

  it("accepts OFL-1.1 only in @fontsource packages", () => {
    expect(one("OFL-1.1", "@fontsource-variable/inter").status).toBe(0);
    expect(one("OFL-1.1", "not-a-font").status).toBe(1);
  });

  it("fails on an empty list", () => {
    expect(check({}).status).not.toBe(0);
  });
});

describe("findLicense", () => {
  const lib = import(pathToFileURL(join(scripts, "release-lib.mjs")).href) as Promise<{ findLicense(dir: string, name: string, keptDir?: string): string | null }>;

  it("prefers the file of the package, then the kept text, and gives null without either", async () => {
    const { findLicense } = await lib;
    const pkg = join(dir, "pkg");
    const kept = join(dir, "kept");
    mkdirSync(pkg);
    mkdirSync(kept);
    expect(findLicense(pkg, "pkg", kept)).toBeNull();
    writeFileSync(join(kept, "pkg-LICENSE.txt"), "kept");
    expect(findLicense(pkg, "pkg", kept)).toBe(join(kept, "pkg-LICENSE.txt"));
    writeFileSync(join(pkg, "LICENSE.md"), "own");
    expect(findLicense(pkg, "pkg", kept)).toBe(join(pkg, "LICENSE.md"));
  });

  it("finds the texts kept for the packages that ship none", async () => {
    const { findLicense } = await lib;
    expect(findLicense(dir, "drizzle-orm")).toContain("drizzle-orm-LICENSE.txt");
    expect(findLicense(dir, "abstract-logging")).toContain("abstract-logging-LICENSE.txt");
  });
});
