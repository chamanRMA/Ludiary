import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createUpdateDownloader, UpdateNetError, type NetResponse } from "../src/update-downloader";

const dirs: string[] = [];
afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })));
const tmp = () => {
  const d = mkdtempSync(join(tmpdir(), "ludiary-dl-"));
  dirs.push(d);
  return d;
};

const reply = (status: number, body: Buffer | string = "", headers: Record<string, string> = {}): NetResponse => ({
  status,
  headers: { get: (n) => headers[n.toLowerCase()] ?? null },
  body: new ReadableStream({
    start(c) {
      if (body.length) c.enqueue(new Uint8Array(Buffer.from(body)));
      c.close();
    },
  }),
});
const script = (...steps: NetResponse[]) => {
  const seen: { url: string; headers: Record<string, string> }[] = [];
  const fetch = async (url: string, init: { headers: Record<string, string> }) => {
    seen.push({ url, headers: init.headers });
    const next = steps.shift();
    if (!next) throw new Error("unexpected request");
    return next;
  };
  return { seen, dl: createUpdateDownloader({ fetch }) };
};
const sha = (b: Buffer) => createHash("sha256").update(b).digest("hex");
const GH = "https://github.com/chamanRMA/Ludiary/releases/download/v1.0.0/x";
const CDN = "https://release-assets.githubusercontent.com/abc?sig=1";
const opts = (dest: string, content: Buffer, over: object = {}) => ({ dest, size: content.length, sha256: sha(content), timeoutMs: 5000, ...over });
const code = async (p: Promise<unknown>) => ((await p.catch((e) => e)) as UpdateNetError).code;

describe("createUpdateDownloader.get", () => {
  it("returns the body and sends only allowed headers", async () => {
    const { dl, seen } = script(reply(200, "{}"));
    const r = await dl.get("https://api.github.com/repos/a/b/releases/latest", {
      maxBytes: 100,
      timeoutMs: 1000,
      followRedirects: false,
      headers: { Accept: "x", Authorization: "Bearer t", Cookie: "a=b", "If-None-Match": "e" },
    });
    expect(r.body.toString()).toBe("{}");
    expect(
      Object.keys(seen[0]!.headers)
        .map((h) => h.toLowerCase())
        .sort(),
    ).toEqual(["accept", "if-none-match"]);
  });
  it("does not follow a redirect of the API call", async () => {
    const { dl } = script(reply(302, "", { location: CDN }));
    expect((await dl.get("https://api.github.com/x", { maxBytes: 10, timeoutMs: 1000, followRedirects: false })).status).toBe(302);
  });
  it.each([["http://github.com/x"], ["https://github.com:8443/x"], ["https://evil.example/x"], ["https://user:pw@github.com/x"], ["https://release-assets.githubusercontent.com/x"]])(
    "rejects the first URL %s",
    async (url) => {
      const { dl, seen } = script(reply(200));
      expect(await code(dl.get(url, { maxBytes: 10, timeoutMs: 1000, followRedirects: true }))).toBe("bad-url");
      expect(seen).toHaveLength(0);
    },
  );
  it("rejects a body over the limit, declared or not", async () => {
    const o = { maxBytes: 10, timeoutMs: 1000, followRedirects: true };
    expect(await code(script(reply(200, "x".repeat(50), { "content-length": "50" })).dl.get(GH, o))).toBe("too-large");
    expect(await code(script(reply(200, "x".repeat(50))).dl.get(GH, o))).toBe("too-large");
  });
});

describe("createUpdateDownloader.download", () => {
  const content = Buffer.from("installer-bytes".repeat(10));
  it("follows GitHub -> CDN, checks and renames", async () => {
    const dir = tmp();
    const { dl, seen } = script(reply(302, "", { location: CDN }), reply(200, content, { "content-length": String(content.length) }));
    const progress: number[] = [];
    await dl.download(GH, opts(join(dir, "setup.exe"), content, { onProgress: (n: number) => progress.push(n) }));
    expect(readFileSync(join(dir, "setup.exe"))).toEqual(content);
    expect(readdirSync(dir)).toEqual(["setup.exe"]);
    expect(seen.map((s) => new URL(s.url).host)).toEqual(["github.com", "release-assets.githubusercontent.com"]);
    expect(progress.at(-1)).toBe(content.length);
  });
  it("rejects a redirect to a host outside the list, at any hop", async () => {
    const evil = reply(302, "", { location: "https://evil.example/a" });
    expect(await code(script(evil).dl.download(GH, opts(join(tmp(), "a"), content)))).toBe("redirect");
    const second = [reply(302, "", { location: CDN }), reply(302, "", { location: "https://evil.example/a" })];
    expect(await code(script(...second).dl.download(GH, opts(join(tmp(), "a"), content)))).toBe("redirect");
  });
  it("rejects a third redirect", async () => {
    const hop = () => reply(302, "", { location: CDN });
    expect(await code(script(hop(), hop(), hop(), reply(200, content)).dl.download(GH, opts(join(tmp(), "a"), content)))).toBe("redirect");
  });
  it("rejects a redirect to http", async () => {
    expect(await code(script(reply(302, "", { location: "http://release-assets.githubusercontent.com/a" })).dl.download(GH, opts(join(tmp(), "a"), content)))).toBe("bad-url");
  });
  it("rejects another content-length, extra bytes and another hash, leaving no .part", async () => {
    const cases: [NetResponse, string][] = [
      [reply(200, content, { "content-length": String(content.length + 1) }), "size-mismatch"],
      [reply(200, Buffer.concat([content, Buffer.from("x")])), "too-large"],
      [reply(200, content.subarray(1)), "size-mismatch"],
      [reply(200, Buffer.from("y".repeat(content.length))), "hash-mismatch"],
      [reply(404), "status"],
    ];
    for (const [r, expected] of cases) {
      const dir = tmp();
      expect(await code(script(r).dl.download(GH, opts(join(dir, "a.exe"), content)))).toBe(expected);
      expect(existsSync(join(dir, "a.exe"))).toBe(false);
      expect(readdirSync(dir)).toEqual([]);
    }
  });
  it("sends no Authorization", async () => {
    const { dl, seen } = script(reply(200, content));
    await dl.download(GH, opts(join(tmp(), "a"), content, { headers: { Authorization: "x", Cookie: "y", "User-Agent": "Ludiary/1.0.0" } }));
    expect(seen[0]!.headers).toEqual({ "User-Agent": "Ludiary/1.0.0" });
  });
});
