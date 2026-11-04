import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { verifyManifest } from "../src/updates/manifest";
import { parseLatestRelease } from "../src/updates/release";
import { compareVersions, isVersion } from "../src/updates/version";

interface Vector {
  name: string;
  manifest: string;
  signature: string;
  tag: string | null;
  current: string;
  badVersions: string[];
  target: string;
  assets: { name: string; size: number }[];
  expect: string;
}
const vectors = JSON.parse(readFileSync(new URL("./fixtures/update-vectors/vectors.json", import.meta.url), "utf8")) as { keys: Record<string, string>; cases: Vector[] };

describe("verifyManifest (shared vectors, ADR 90 point 18 M1)", () => {
  for (const c of vectors.cases) {
    it(c.name, () => {
      const r = verifyManifest({ manifest: Buffer.from(c.manifest), signature: c.signature, keys: vectors.keys, tagVersion: c.tag, current: c.current, badVersions: c.badVersions, target: c.target, assets: c.assets });
      expect(r.ok ? "ok" : r.reason).toBe(c.expect);
    });
  }
  it("fails closed with no embedded keys", () => {
    const c = vectors.cases[0]!;
    expect(verifyManifest({ manifest: Buffer.from(c.manifest), signature: c.signature, keys: {}, tagVersion: "0.3.0", current: "0.2.0", badVersions: [], target: c.target })).toEqual({ ok: false, reason: "key" });
  });
  it("does not resolve inherited property names as key ids", () => {
    const c = vectors.cases[0]!;
    const r = verifyManifest({ manifest: Buffer.from(c.manifest), signature: c.signature.replace("test-1", "constructor"), keys: vectors.keys, tagVersion: null, current: "0.2.0", badVersions: [], target: c.target });
    expect(r).toEqual({ ok: false, reason: "key" });
  });
});

describe("versions", () => {
  it("accepts only x.y.z and compares numerically", () => {
    expect(["1.2.3", "0.10.0"].every(isVersion)).toBe(true);
    for (const v of ["1.2", "v1.2.3", "1.2.3-beta", "1.2.3/../x", "1.2.3\n", "", "9".repeat(40) + ".0.0", 5]) expect(isVersion(v)).toBe(false);
    expect(compareVersions("0.10.0", "0.9.0")).toBeGreaterThan(0);
    expect(compareVersions("1.0.0", "1.0.0")).toBe(0);
  });
});

describe("parseLatestRelease", () => {
  const repo = "chamanRMA/Ludiary";
  const asset = (name: string, over: object = {}) => ({ name, size: 100, state: "uploaded", browser_download_url: `https://github.com/${repo}/releases/download/v0.3.0/${name}`, ...over });
  const release = (over: object = {}) => ({ draft: false, prerelease: false, tag_name: "v0.3.0", assets: [asset("ludiary-update.json"), asset("ludiary-update.json.sig"), asset("Ludiary-Setup-0.3.0.exe", { size: 28311552 })], ...over });

  it("accepts a proper release", () => {
    const r = parseLatestRelease(release(), repo);
    expect(r.ok && r.release.version).toBe("0.3.0");
    expect(r.ok && r.release.assets).toHaveLength(3);
  });
  it.each([
    ["draft", { draft: true }],
    ["pre-release", { prerelease: true }],
    ["invalid tag", { tag_name: "0.3.0" }],
    ["tag with suffix", { tag_name: "v0.3.0-rc1" }],
    ["manifest missing", { assets: [asset("ludiary-update.json.sig")] }],
    ["signature not uploaded", { assets: [asset("ludiary-update.json"), asset("ludiary-update.json.sig", { state: "open" })] }],
    ["manifest too big", { assets: [asset("ludiary-update.json", { size: 70_000 }), asset("ludiary-update.json.sig")] }],
    ["other repository", { assets: [asset("ludiary-update.json", { browser_download_url: "https://github.com/evil/Ludiary/releases/download/v0.3.0/ludiary-update.json" }), asset("ludiary-update.json.sig")] }],
    ["other tag in the URL", { assets: [asset("ludiary-update.json", { browser_download_url: `https://github.com/${repo}/releases/download/v0.9.0/ludiary-update.json` }), asset("ludiary-update.json.sig")] }],
  ])("rejects %s", (_n, over) => {
    expect(parseLatestRelease(release(over), repo).ok).toBe(false);
  });
  it("rejects anything that is not an object", () => {
    for (const v of [null, [], "x", 3]) expect(parseLatestRelease(v, repo).ok).toBe(false);
  });
});
