// ADR 90 points 3, 5, 6, 10 and 18 (M4, M5): the update service against a fake GitHub, with fake timers.
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SettingsRepository } from "@ludiary/core";
import { UpdateNetError, type GetOptions, type UpdateDownloader } from "@ludiary/platform-node";
import { tempDir } from "../../db/test/backup-fixtures";
import type { UpdateConfig } from "../src/deps";
import { SIGNATURE_CONTEXT } from "../src/updates/manifest";
import { createUpdateService, type UpdateMode, type UpdateService } from "../src/updates/service";
import { readState, updateFolder, writeState } from "../src/updates/state";

const REPO = "chamanRMA/Ludiary";
const API = `https://api.github.com/repos/${REPO}/releases/latest`;
const INSTALLER = Buffer.alloc(1024 * 1024 + 7, 7);

let dir = "";
let dataDir = "";
let root = "";
let requests: string[] = [];
let apiReply: () => { status: number; body?: unknown; headers?: Record<string, string> };
let netError: Error | null = null;
let downloadError: Error | null = null;
let freeBytes = 1e12;
let settingsMap: Map<string, unknown>;
let current = "0.2.0";

const { publicKey, privateKey } = generateKeyPairSync("ed25519");
const rawPublic = Buffer.from(publicKey.export({ format: "jwk" }).x!, "base64url").toString("base64");

function release(version: string, over: { signWith?: typeof privateKey; size?: number } = {}) {
  const name = `Ludiary-Setup-${version}.exe`;
  const manifest = Buffer.from(
    JSON.stringify({ schema: 1, product: "ludiary", channel: "stable", version, publishedAt: "2026-11-20T10:00:00Z", files: { "windows-x64": { name, size: INSTALLER.length, sha256: createHash("sha256").update(INSTALLER).digest("hex") } } }),
  );
  const sig = `ludiary-sig-v1 k1 ${sign(null, Buffer.concat([Buffer.from(SIGNATURE_CONTEXT), manifest]), over.signWith ?? privateKey).toString("base64")}\n`;
  const url = (n: string) => `https://github.com/${REPO}/releases/download/v${version}/${n}`;
  const body = {
    draft: false,
    prerelease: false,
    tag_name: `v${version}`,
    assets: [
      { name: "ludiary-update.json", size: manifest.length, state: "uploaded", browser_download_url: url("ludiary-update.json") },
      { name: "ludiary-update.json.sig", size: sig.length, state: "uploaded", browser_download_url: url("ludiary-update.json.sig") },
      { name, size: over.size ?? INSTALLER.length, state: "uploaded", browser_download_url: url(name) },
    ],
  };
  const files = new Map<string, Buffer>([[url("ludiary-update.json"), manifest], [url("ludiary-update.json.sig"), Buffer.from(sig)]]);
  return { body, files, url, name };
}
let files = new Map<string, Buffer>();

const net: UpdateDownloader = {
  async get(url: string, o: GetOptions) {
    requests.push(url);
    if (netError) throw netError;
    if (url === API) {
      const r = apiReply();
      return { status: r.status, headers: { get: (n: string) => r.headers?.[n.toLowerCase()] ?? null }, body: Buffer.from(JSON.stringify(r.body ?? {})) };
    }
    const f = files.get(url);
    if (!f) throw new Error(`unexpected GET ${url}`);
    expect(o.maxBytes).toBe(64 * 1024);
    return { status: 200, headers: { get: () => null }, body: f };
  },
  async download(url, o) {
    requests.push(url);
    if (downloadError) throw downloadError;
    writeFileSync(o.dest, INSTALLER);
    o.onProgress?.(INSTALLER.length);
  },
};

const settings: SettingsRepository = {
  get: async (k) => settingsMap.get(k),
  set: async (k, v) => void settingsMap.set(k, v),
  delete: async (k) => void settingsMap.delete(k),
};

let service: UpdateService;
let restarted = 0;
function make(over: { version?: string; installRoot?: string | null; keys?: Record<string, string> } = {}): UpdateService {
  const config: UpdateConfig = {
    platform: { target: "windows-x64", installRoot: over.installRoot === undefined ? root : over.installRoot, freeBytes: async () => freeBytes, restartIntoLauncher: async () => void restarted++ },
    keys: over.keys ?? { k1: rawPublic },
    repo: REPO,
    downloader: net,
  };
  service = createUpdateService({ version: over.version ?? current, dataDir, config, settings, log: () => {}, restart: async () => void restarted++ });
  return service;
}
const choose = (mode: UpdateMode | null, seen = true) => {
  if (mode) settingsMap.set("updates.mode", mode);
  if (seen) settingsMap.set("updates.noticeSeen", true);
};
const publish = (version: string, over?: Parameters<typeof release>[1]) => {
  const r = release(version, over);
  files = r.files;
  apiReply = () => ({ status: 200, body: r.body, headers: { etag: `"e-${version}"` } });
  return r;
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-04T10:00:00Z"));
  dir = tempDir();
  dataDir = join(dir, "data");
  root = join(dir, "Programs");
  mkdirSync(dataDir, { recursive: true });
  mkdirSync(root, { recursive: true });
  requests = [];
  netError = null;
  downloadError = null;
  freeBytes = 1e12;
  settingsMap = new Map();
  current = "0.2.0";
  restarted = 0;
  apiReply = () => ({ status: 404 });
});
afterEach(() => {
  service?.stop();
  vi.useRealTimers();
  rmSync(dir, { recursive: true, force: true });
});

describe("a build that cannot update", () => {
  it.each([
    ["a development version", { version: "0.0.0-proto" }],
    ["no install root", { installRoot: null }],
    ["no embedded keys", { keys: {} }],
  ])("%s is unsupported, asks nothing and refuses writes with update.unsupported", async (_n, over) => {
    choose("auto");
    const svc = make(over);
    await svc.start();
    await vi.advanceTimersByTimeAsync(3 * 24 * 3_600_000);
    expect(requests).toEqual([]);
    expect((await svc.status()).state).toBe("unsupported");
    await expect(svc.checkNow()).rejects.toMatchObject({ code: "update.unsupported", status: 409 });
    await expect(svc.setMode("auto")).rejects.toMatchObject({ code: "update.unsupported" });
  });
});

describe("no request before the user chooses (ADR 90 point 18, M5)", () => {
  it("with no mode chosen: nothing in three days; Check now makes exactly one request", async () => {
    const svc = make();
    await svc.start();
    await vi.advanceTimersByTimeAsync(3 * 24 * 3_600_000);
    expect(requests).toEqual([]);
    expect((await svc.status()).mode).toBeNull();
    await svc.checkNow();
    expect(requests).toEqual([API]);
  });

  it("mode off: nothing automatic, Check now still works", async () => {
    choose("off");
    const svc = make();
    await svc.start();
    await vi.advanceTimersByTimeAsync(2 * 24 * 3_600_000);
    expect(requests).toEqual([]);
    await svc.checkNow();
    expect(requests).toHaveLength(1);
  });

  it("a mode with neither the wizard completed nor the card seen still asks nothing", async () => {
    choose("auto", false);
    const svc = make();
    await svc.start();
    await vi.advanceTimersByTimeAsync(2 * 24 * 3_600_000);
    expect(requests).toEqual([]);
  });

  it("the wizard being completed is as good as the card", async () => {
    choose("notify", false);
    settingsMap.set("onboarding.completedAt", 1);
    const svc = make();
    await svc.start();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(requests).toEqual([API]);
  });
});

describe("checking (point 3)", () => {
  it("auto: first check after 60 s, then downloads in the background and ends `ready`", async () => {
    choose("auto");
    publish("0.3.0");
    const svc = make();
    await svc.start();
    await vi.advanceTimersByTimeAsync(59_000);
    expect(requests).toEqual([]);
    await vi.advanceTimersByTimeAsync(2_000);
    const st = await svc.status();
    expect(st).toMatchObject({ state: "ready", latest: "0.3.0", mode: "auto" });
    expect(readState(dataDir)).toMatchObject({ state: "ready", version: "0.3.0" });
    expect(readdirSync(updateFolder(dataDir, "0.3.0")).sort()).toEqual(["Ludiary-Setup-0.3.0.exe", "ludiary-update.json", "ludiary-update.json.sig"]);
  });

  it("repeats every 24 hours and sends the saved ETag; a 304 changes nothing", async () => {
    choose("notify");
    publish("0.3.0");
    const svc = make();
    await svc.start();
    await vi.advanceTimersByTimeAsync(61_000);
    expect(requests).toEqual([API]);
    const sent: (string | undefined)[] = [];
    const first = net.get;
    net.get = async (u, o) => (sent.push(o.headers?.["If-None-Match"]), first(u, o));
    apiReply = () => ({ status: 304 });
    await vi.advanceTimersByTimeAsync(24 * 3_600_000);
    expect(sent).toEqual(['"e-0.3.0"']);
    expect((await svc.status()).state).toBe("available");
    net.get = first;
  });

  it("sends only the fixed headers and no token (point 3.2)", async () => {
    choose("notify");
    publish("0.3.0");
    let headers: Record<string, string> | undefined;
    const first = net.get;
    net.get = async (u, o) => ((headers ??= o.headers), first(u, o));
    await make().checkNow();
    net.get = first;
    expect(headers).toEqual({ Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2026-03-10", "User-Agent": "Ludiary/0.2.0" });
  });

  it("404 (nothing published) and an older or equal version are `up-to-date`", async () => {
    const svc = make();
    await svc.checkNow();
    expect((await svc.status()).state).toBe("up-to-date");
    publish("0.2.0");
    await vi.advanceTimersByTimeAsync(61_000);
    await svc.checkNow();
    expect((await svc.status()).state).toBe("up-to-date");
  });

  it("rate limit: silent, and nothing automatic until x-ratelimit-reset (at least one hour)", async () => {
    choose("auto");
    const reset = Math.floor(Date.now() / 1000) + 3 * 3600;
    apiReply = () => ({ status: 403, headers: { "x-ratelimit-remaining": "0", "x-ratelimit-reset": String(reset) } });
    const svc = make();
    await svc.start();
    await vi.advanceTimersByTimeAsync(61_000);
    expect(requests).toHaveLength(1);
    expect((await svc.status()).error).toBeUndefined();
    await vi.advanceTimersByTimeAsync(24 * 3_600_000);
    expect(requests).toHaveLength(2); // the 24 h cycle came after the reset
    apiReply = () => ({ status: 429, headers: { "retry-after": "10" } });
    await vi.advanceTimersByTimeAsync(24 * 3_600_000);
    expect(requests).toHaveLength(3);
    apiReply = () => ({ status: 404 });
    await vi.advanceTimersByTimeAsync(3_600_000 - 1000); // blocked for at least an hour even with retry-after 10
    expect(requests).toHaveLength(3);
  });

  it("an error is `failed` with its code and is retried at the next cycle", async () => {
    choose("notify");
    netError = new UpdateNetError("network");
    const svc = make();
    await svc.start();
    await vi.advanceTimersByTimeAsync(61_000);
    expect(await svc.status()).toMatchObject({ state: "failed", error: "check-failed" });
    netError = null;
    publish("0.3.0");
    await vi.advanceTimersByTimeAsync(24 * 3_600_000);
    expect((await svc.status()).state).toBe("available");
  });

  it("an invalid release (draft, bad tag) is a failed check", async () => {
    apiReply = () => ({ status: 200, body: { draft: true, prerelease: false, tag_name: "v0.3.0", assets: [] } });
    await expect(make().checkNow()).rejects.toMatchObject({ code: "update.check-failed" });
  });

  it("Check now: at most one per minute", async () => {
    const svc = make();
    await svc.checkNow();
    await expect(svc.checkNow()).rejects.toMatchObject({ code: "update.too-soon", status: 429 });
    await vi.advanceTimersByTimeAsync(61_000);
    await svc.checkNow();
    expect(requests).toHaveLength(2);
  });

  it("choosing a mode for the first time starts checking within seconds", async () => {
    publish("0.3.0");
    const svc = make();
    await svc.start();
    settingsMap.set("updates.noticeSeen", true);
    await svc.setMode("notify");
    await vi.advanceTimersByTimeAsync(6_000);
    expect(requests).toEqual([API]);
  });
});

describe("downloading (point 6)", () => {
  it("notify: available until the user presses download", async () => {
    choose("notify");
    publish("0.3.0");
    const svc = make();
    await svc.start();
    await vi.advanceTimersByTimeAsync(61_000);
    expect((await svc.status()).state).toBe("available");
    expect(existsSync(updateFolder(dataDir, "0.3.0"))).toBe(false);
    await svc.download();
    expect((await svc.status()).state).toBe("ready");
  });

  it("a manifest signed with another key is rejected: nothing is downloaded or kept", async () => {
    choose("auto");
    publish("0.3.0", { signWith: generateKeyPairSync("ed25519").privateKey });
    const svc = make();
    await svc.start();
    await vi.advanceTimersByTimeAsync(61_000);
    expect(await svc.status()).toMatchObject({ state: "failed", error: "manifest-invalid" });
    expect(requests.some((u) => u.endsWith(".exe"))).toBe(false);
    expect(existsSync(updateFolder(dataDir, "0.3.0"))).toBe(false);
  });

  it("an installer whose size differs from the manifest in the release listing is rejected", async () => {
    publish("0.3.0", { size: 5 * 1024 * 1024 });
    const svc = make();
    await svc.checkNow();
    await expect(svc.download()).rejects.toMatchObject({ code: "update.manifest-invalid" });
  });

  it("needs size + 300 MB free", async () => {
    publish("0.3.0");
    freeBytes = INSTALLER.length + 299 * 1024 * 1024;
    const svc = make();
    await svc.checkNow();
    await expect(svc.download()).rejects.toMatchObject({ code: "update.no-space" });
    expect(existsSync(updateFolder(dataDir, "0.3.0"))).toBe(false);
    expect((await svc.status()).error).toBe("no-space");
  });

  it("a hash mismatch deletes the folder; after 3 failures the automatic download stops", async () => {
    choose("auto");
    publish("0.3.0");
    downloadError = new UpdateNetError("hash-mismatch");
    const svc = make();
    await svc.start();
    await vi.advanceTimersByTimeAsync(61_000);
    expect(await svc.status()).toMatchObject({ error: "hash-mismatch" });
    expect(existsSync(updateFolder(dataDir, "0.3.0"))).toBe(false);
    await vi.advanceTimersByTimeAsync(2 * 24 * 3_600_000 + 10_000);
    const installerGets = () => requests.filter((u) => u.endsWith(".exe")).length;
    expect(installerGets()).toBe(3);
    await vi.advanceTimersByTimeAsync(3 * 24 * 3_600_000);
    expect(installerGets()).toBe(3);
    downloadError = null;
    await svc.checkNow(); // "Buscar ahora" clears the count
    await vi.advanceTimersByTimeAsync(0);
    expect((await svc.status()).state).toBe("ready");
  });

  it("a version in badVersions is not downloaded by itself; downloading it needs retryBad (M4)", async () => {
    choose("auto");
    publish("0.3.0");
    writeFileSync(join(root, "versions.json"), JSON.stringify({ active: "0.2.0", previous: null, trial: false, trials: 0, badVersions: ["0.3.0"] }));
    const svc = make();
    await svc.start();
    await vi.advanceTimersByTimeAsync(61_000);
    expect(await svc.status()).toMatchObject({ state: "available", latestFailedBefore: true });
    await expect(svc.download()).rejects.toMatchObject({ code: "update.bad-version" });
    await svc.download({ retryBad: true });
    expect(readState(dataDir)).toMatchObject({ state: "ready", version: "0.3.0", retryBad: "0.3.0" });
  });

  it("an unwritable installation folder is update.not-writable", async () => {
    publish("0.3.0");
    const svc = make({ installRoot: join(dir, "does-not-exist") });
    await svc.checkNow();
    await expect(svc.download()).rejects.toMatchObject({ code: "update.not-writable" });
  });

  it("starting sweeps the folders of other versions and leftover .part files", async () => {
    mkdirSync(updateFolder(dataDir, "0.1.0"), { recursive: true });
    mkdirSync(updateFolder(dataDir, "0.3.0"), { recursive: true });
    writeFileSync(join(updateFolder(dataDir, "0.3.0"), "x.exe.part"), "x");
    writeState(dataDir, { state: "downloading", version: "0.3.0" });
    choose("off");
    await make().start();
    expect(existsSync(updateFolder(dataDir, "0.1.0"))).toBe(false);
    expect(existsSync(join(updateFolder(dataDir, "0.3.0"), "x.exe.part"))).toBe(false);
  });
});

describe("what must not happen (audit)", () => {
  const versionsFile = (v: object) => writeFileSync(join(root, "versions.json"), JSON.stringify({ active: "0.2.0", previous: "0.1.0", trial: false, trials: 0, badVersions: [], ...v }));

  it("during the trial period, nothing downloads and state.json is not touched; a rollback in progress is the same", async () => {
    publish("0.3.0");
    const svc = make();
    await svc.checkNow();
    for (const v of [{ trial: true }, { rollingBack: { from: "0.1.0", to: "0.2.0" } }]) {
      versionsFile(v);
      writeState(dataDir, { state: "applying", from: "0.1.0", to: "0.2.0" });
      await expect(svc.download()).rejects.toMatchObject({ code: "update.not-ready" });
      await svc.acknowledge();
      expect(readState(dataDir)).toEqual({ state: "applying", from: "0.1.0", to: "0.2.0" });
      expect(requests.some((u) => u.endsWith(".exe"))).toBe(false);
    }
  });

  it("an asset that answers something other than 200 is a failed download, not an invalid manifest", async () => {
    const r = publish("0.3.0");
    files.set(r.url("ludiary-update.json"), Buffer.from("x"));
    const first = net.get;
    net.get = async (u, o) => (u.endsWith("ludiary-update.json") ? { status: 404, headers: { get: () => null }, body: Buffer.from("") } : first(u, o));
    const svc = make();
    await svc.checkNow();
    await expect(svc.download()).rejects.toMatchObject({ code: "update.download-failed" });
    net.get = first;
  });

  it("the folder of an update being applied survives the sweep at start", async () => {
    mkdirSync(updateFolder(dataDir, "0.3.0"), { recursive: true });
    mkdirSync(updateFolder(dataDir, "0.1.0"), { recursive: true });
    writeState(dataDir, { state: "applying", from: "0.2.0", to: "0.3.0" });
    versionsFile({ active: "0.2.0", previous: null, applying: { to: "0.3.0", attempts: 1 } });
    choose("off");
    await make().start();
    expect(existsSync(updateFolder(dataDir, "0.3.0"))).toBe(true);
    expect(existsSync(updateFolder(dataDir, "0.1.0"))).toBe(false);
  });
});

describe("restart and notices", () => {
  it("restart needs a ready update and runs a moment after answering", async () => {
    publish("0.3.0");
    const svc = make();
    await expect(svc.restart()).rejects.toMatchObject({ code: "update.not-ready" });
    await svc.checkNow();
    await svc.download();
    await svc.restart();
    expect(restarted).toBe(0);
    await vi.advanceTimersByTimeAsync(400);
    expect(restarted).toBe(1);
  });

  it("the notices of the last update are shown until acknowledged", async () => {
    writeState(dataDir, { state: "idle", updated: "0.2.0" });
    const svc = make();
    expect((await svc.status()).updated).toBe("0.2.0");
    await svc.acknowledge();
    expect((await svc.status()).updated).toBeUndefined();
  });

  it("a rollback is reported with its versions", async () => {
    writeState(dataDir, { state: "rolled-back", from: "0.2.0", to: "0.3.0", code: "1" });
    expect(await make().status()).toMatchObject({ state: "rolled-back", rolledBack: { from: "0.2.0", to: "0.3.0", code: "1" } });
  });
});
