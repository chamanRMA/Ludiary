// The update service of the running server (ADR 90 points 3, 5, 6 and 10): checks GitHub Releases, downloads and verifies in
// the background, and keeps the user's mode. It never installs: the inner launcher decides on a cold start (apply.ts).
import { accessSync, constants, mkdirSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { SettingsRepository } from "@ludiary/core";
import { UpdateNetError, createUpdateDownloader, type UpdateDownloader } from "@ludiary/platform-node";
import type { UpdateConfig } from "../deps";
import type { Logger } from "../files";
import { verifyManifest } from "./manifest";
import { MANIFEST_ASSET, MAX_SMALL_ASSET_BYTES, SIGNATURE_ASSET, parseLatestRelease, type LatestRelease, type ReleaseAsset } from "./release";
import { reconcileState, readVersionsFile, updateFolder, updatesDir, writeState, readState } from "./state";
import { compareVersions, isVersion } from "./version";

export type UpdateMode = "auto" | "notify" | "off";
export const UPDATE_MODES: readonly UpdateMode[] = ["auto", "notify", "off"];
/**
 * ADR 90 point 20 (closes 15.1 and 15.2 (a); revises M5): the default is `notify` and there is no gate. Only the mode decides
 * whether the automatic cycle runs; `off` makes no request on its own.
 */
export const DEFAULT_UPDATE_MODE: UpdateMode = "notify";

const K_MODE = "updates.mode";
const K_CACHE = "updates.cache";

export const FIRST_CHECK_MS = 60_000;
export const CHECK_EVERY_MS = 24 * 3_600_000;
export const MIN_MANUAL_GAP_MS = 60_000;
export const SNOOZE_MS = 24 * 3_600_000;
const MIN_BLOCKED_MS = 3_600_000;
const SPACE_MARGIN_BYTES = 300 * 1024 * 1024;
const MAX_FAILURES = 3;
const API_BODY_BYTES = 1024 * 1024;

export type UpdateViewState = "unsupported" | "idle" | "checking" | "up-to-date" | "available" | "downloading" | "ready" | "failed" | "rolled-back";

export interface UpdateStatus {
  mode: UpdateMode;
  current: string;
  latest?: string;
  state: UpdateViewState;
  progress?: number;
  lastCheckAt?: number;
  /** Code of the last failure: `check-failed`, `hash-mismatch`, `no-space`, ... Never a URL or a path. */
  error?: string;
  /** "Later" was pressed for this version less than 24 h ago (in memory only, point 20). */
  snoozed?: true;
  /** The latest version already failed to start on this PC (M4). */
  latestFailedBefore?: boolean;
  /** Shown once (point 10). */
  updated?: string;
  rolledBack?: { from: string; to: string; code: string };
  downgraded?: boolean;
}

/** An error the API turns into `{ code, key }` (key: `core.errors.<key>`). */
export class UpdateError extends Error {
  readonly key: string;
  constructor(
    readonly code: string,
    readonly status: number,
  ) {
    super(code);
    this.key = `core.errors.${code}`;
  }
}

interface Cache {
  etag?: string;
  checkedAt?: number;
  /** The version whose signed manifest passed verifyManifest; only then is it announced (point 20). */
  verifiedVersion?: string;
  /** Rate limit: no automatic request before this. */
  blockedUntil?: number;
  release?: LatestRelease;
}

export interface UpdateServiceOptions {
  version: string;
  dataDir: string;
  config: UpdateConfig;
  settings: SettingsRepository;
  log: Logger;
  /** Called after the status changed (tray, SSE-free web polls it). */
  onChange?: () => void;
  /** Called to restart into the stable launcher: starts it, then stops the server. Absent: restart is unavailable. */
  restart?: () => Promise<void>;
  /** ADR 92. True if a game is open: `restart` then answers `update.game-running` and the update stays `ready`. */
  isGameRunning?: () => Promise<boolean>;
  now?: () => number;
}

export interface UpdateService {
  readonly supported: boolean;
  status(): Promise<UpdateStatus>;
  start(): Promise<void>;
  stop(): void;
  setMode(mode: UpdateMode): Promise<void>;
  /** "Later": hides the notice of the latest version for 24 h, in memory. */
  later(): Promise<void>;
  acknowledge(): Promise<void>;
  checkNow(): Promise<void>;
  download(opts?: { retryBad?: boolean }): Promise<void>;
  restart(): Promise<void>;
}

const isCache = (v: unknown): v is Cache => typeof v === "object" && v !== null;

export function createUpdateService(o: UpdateServiceOptions): UpdateService {
  const { config, settings, log, dataDir } = o;
  const now = o.now ?? Date.now;
  const root = config.platform.installRoot;
  // Point 3.1: only a build that runs from app-<version>, with a release version and real keys, may ask GitHub anything.
  const supported = isVersion(o.version) && root !== null && Object.keys(config.keys).length > 0 && config.repo !== "";
  const net: UpdateDownloader =
    config.downloader ?? createUpdateDownloader(config.feed ? { extraOrigins: [new URL(config.feed.releaseUrl).origin] } : {});
  const releaseUrl = config.feed?.releaseUrl ?? `https://api.github.com/repos/${config.repo}/releases/latest`;
  const downloadBase = config.feed?.downloadBase;

  let timer: NodeJS.Timeout | undefined;
  let stopped = false;
  let checking = false;
  let downloading: { version: string; received: number; total: number } | null = null;
  let lastError: string | undefined;
  let lastManualAt = 0;
  let restarting = false;
  let checkAbort = new AbortController();
  let abort = new AbortController();
  const failures = new Map<string, number>();

  const changed = () => o.onChange?.();
  /** The "updated" banner survives every rewrite of state.json that a download makes (point 20). */
  const kept = (): { updated?: string } => {
    const u = readState(dataDir).updated;
    return u ? { updated: u } : {};
  };
  const inTrial = () => {
    const v = root === null ? null : readVersionsFile(root);
    return v !== null && (v.trial || v.rollingBack !== null);
  };
  async function getMode(): Promise<UpdateMode> {
    const m = await settings.get(K_MODE);
    return typeof m === "string" && (UPDATE_MODES as readonly string[]).includes(m) ? (m as UpdateMode) : DEFAULT_UPDATE_MODE;
  }
  async function readCache(): Promise<Cache> {
    const c = await settings.get(K_CACHE);
    if (!isCache(c)) return {};
    const rel = c.release;
    // Stored data is re-validated like anything else: the URLs must still be the ones of this repository and tag.
    const checked = rel && parseLatestRelease({ draft: false, prerelease: false, tag_name: typeof rel.tag === "string" ? rel.tag : `v${String(rel.version)}`, // a cache written by 0.1.0 has no tag, and its tags had the v (ADR 90 point 22)
      assets: (rel.assets ?? []).map((a) => ({ name: a.name, size: a.size, state: "uploaded", browser_download_url: a.url })) }, config.repo, downloadBase);
    return { ...(typeof c.etag === "string" ? { etag: c.etag } : {}), ...(typeof c.checkedAt === "number" ? { checkedAt: c.checkedAt } : {}), ...(typeof c.blockedUntil === "number" ? { blockedUntil: c.blockedUntil } : {}), ...(checked?.ok ? { release: checked.release } : {}), ...(checked?.ok && isVersion(c.verifiedVersion) && c.verifiedVersion === checked.release.version ? { verifiedVersion: c.verifiedVersion } : {}) };
  }
  const writeCache = (c: Cache) => settings.set(K_CACHE, c);
  /** Point 20: only the mode decides (`notify` by default); `off` makes no automatic request at all. */
  async function mayCheckAutomatically(): Promise<boolean> {
    const mode = await getMode();
    return mode === "auto" || mode === "notify";
  }
  const newer = (c: Cache) => (c.release && compareVersions(c.release.version, o.version) > 0 ? c.release : undefined);
  /** A newer version whose signed manifest was verified: the only one that is announced. */
  const announced = (c: Cache) => {
    const r = newer(c);
    return r && c.verifiedVersion === r.version ? r : undefined;
  };
  let snooze: { version: string; until: number } | null = null;

  function arm(delay: number): void {
    clearTimeout(timer);
    if (stopped || !supported) return;
    timer = setTimeout(() => {
      void (async () => {
        try {
          if (await mayCheckAutomatically()) await check(false);
        } catch (e) {
          log("error", `update check crashed: ${(e as Error).name}`);
        }
        arm(CHECK_EVERY_MS);
      })();
    }, delay);
    timer.unref();
  }

  async function check(manual: boolean): Promise<void> {
    if (checking) return;
    checkAbort = new AbortController();
    const signal = checkAbort.signal;
    let cache = await readCache();
    if (!manual && cache.blockedUntil !== undefined && cache.blockedUntil > now()) return;
    checking = true;
    changed();
    try {
      const res = await net.get(releaseUrl, {
        headers: {
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2026-03-10",
          "User-Agent": `Ludiary/${o.version}`,
          ...(cache.etag ? { "If-None-Match": cache.etag } : {}),
        },
        maxBytes: API_BODY_BYTES,
        timeoutMs: 15_000,
        followRedirects: false,
        signal,
      });
      const header = (n: string) => res.headers.get(n);
      if (res.status === 304) {
        cache = { ...cache, checkedAt: now() };
      } else if (res.status === 200) {
        let parsed: ReturnType<typeof parseLatestRelease> = { ok: false };
        try {
          parsed = parseLatestRelease(JSON.parse(res.body.toString("utf8")), config.repo, downloadBase);
        } catch {
          // not JSON
        }
        if (!parsed.ok) throw new UpdateError("update.check-failed", 502);
        const etag = header("etag");
        cache = { ...(etag ? { etag } : {}), checkedAt: now(), release: parsed.release, ...(cache.verifiedVersion === parsed.release.version ? { verifiedVersion: parsed.release.version } : {}) };
      } else if (res.status === 404) {
        cache = { checkedAt: now() };
      } else if ((res.status === 403 || res.status === 429) && (header("x-ratelimit-remaining") === "0" || header("retry-after") !== null)) {
        const reset = Number(header("x-ratelimit-reset")) * 1000;
        const after = Number(header("retry-after")) * 1000;
        const until = Math.max(Number.isFinite(reset) ? reset : 0, Number.isFinite(after) ? now() + after : 0, now() + MIN_BLOCKED_MS);
        await writeCache({ ...cache, blockedUntil: until });
        log("info", "update check: rate limited; waiting");
        return; // silent
      } else {
        throw new UpdateError("update.check-failed", 502);
      }
      lastError = undefined;
      await writeCache(cache);
      // Point 20: a newer version is announced only after its signed manifest verifies (two 64 KiB downloads, outside the API quota).
      const fresh = newer(cache);
      // The mode may have changed to `off` while the request was in flight: then nothing more is asked.
      if (!manual && (await getMode()) === "off") return;
      if (fresh && cache.verifiedVersion !== fresh.version) {
        try {
          await fetchAndVerify(fresh, [], signal);
          cache = { ...cache, verifiedVersion: fresh.version };
          await writeCache(cache);
        } catch (e) {
          if (e instanceof UpdateError && e.code !== "update.check-failed") lastError = e.code.replace(/^update\./, "");
          else throw e;
        }
      }
      log("info", `update check: ${announced(cache) ? `version ${announced(cache)!.version} available` : "up to date"}`);
    } catch (e) {
      if (signal.aborted) return; // switched off on purpose: not a failure
      lastError = "check-failed";
      log("warn", `update check failed (${e instanceof UpdateNetError ? e.code : e instanceof UpdateError ? e.code : "error"})`);
      if (manual) throw e instanceof UpdateError ? e : new UpdateError("update.check-failed", 502);
      return;
    } finally {
      checking = false;
      changed();
    }
    if ((await getMode()) === "auto" && announced(cache)) void download({ auto: true }).catch(() => undefined);
  }

  function writable(dir: string): boolean {
    try {
      accessSync(dir, constants.W_OK);
      return true;
    } catch {
      return false;
    }
  }

  function writeAtomic(path: string, data: Buffer): void {
    writeFileSync(`${path}.tmp`, data);
    renameSync(`${path}.tmp`, path);
  }

  /** Downloads the manifest and its signature and verifies them. Network failures are UpdateNetError; a rejection is an UpdateError. */
  async function fetchAndVerify(release: LatestRelease, badVersions: readonly string[], signal: AbortSignal) {
    const small = async (asset: ReleaseAsset | undefined) => {
      if (!asset) throw new UpdateError("update.manifest-invalid", 502);
      const res = await net.get(asset.url, { maxBytes: MAX_SMALL_ASSET_BYTES, timeoutMs: 15_000, followRedirects: true, signal, headers: { "User-Agent": `Ludiary/${o.version}` } });
      if (res.status !== 200) throw new UpdateNetError("status", res.status); // a failed download, not an invalid manifest
      return res.body;
    };
    const manifest = await small(release.assets.find((a) => a.name === MANIFEST_ASSET));
    const signature = await small(release.assets.find((a) => a.name === SIGNATURE_ASSET));
    const checked = verifyManifest({
      manifest,
      signature: signature.toString("utf8"),
      keys: config.keys,
      tagVersion: release.version,
      current: o.version,
      badVersions,
      target: config.platform.target,
      assets: release.assets,
    });
    if (!checked.ok) {
      log("error", `update manifest rejected (${checked.reason})`);
      throw new UpdateError(checked.reason === "schema" ? "update.manual-required" : "update.manifest-invalid", 502);
    }
    return { manifest, signature, checked };
  }

  async function download(opts: { retryBad?: boolean; auto?: boolean } = {}): Promise<void> {
    if (!supported || root === null) throw new UpdateError("update.unsupported", 409);
    const cache = await readCache();
    // Only a version announced (signature verified by the check) is downloaded; the manifest is verified again below.
    const release = announced(cache);
    if (!release) throw new UpdateError("update.nothing-new", 409);
    if (downloading) return;
    // While a new version is on trial (or being rolled back) state.json belongs to that process (point 18, A1).
    if (inTrial()) {
      if (opts.auto) return;
      throw new UpdateError("update.not-ready", 409);
    }
    const persisted = readState(dataDir);
    if (persisted.state === "ready" && persisted.version === release.version) return;
    const versions = readVersionsFile(root);
    const isBad = versions?.badVersions.includes(release.version) === true;
    if (isBad && !opts.retryBad) {
      if (opts.auto) return;
      throw new UpdateError("update.bad-version", 409);
    }
    if (opts.auto && (failures.get(release.version) ?? 0) >= MAX_FAILURES) return;
    if (!writable(root)) {
      lastError = "not-writable";
      changed();
      throw new UpdateError("update.not-writable", 409);
    }
    abort = new AbortController();
    downloading = { version: release.version, received: 0, total: 0 };
    changed();
    const folder = updateFolder(dataDir, release.version);
    try {
      cleanOtherFolders(release.version);
      mkdirSync(folder, { recursive: true });
      // Verified again here (the notice already verified it): the installer is only fetched against a manifest checked now.
      const { manifest, signature, checked } = await fetchAndVerify(release, (versions?.badVersions ?? []).filter((b) => !(opts.retryBad && b === release.version)), abort.signal);
      if ((await config.platform.freeBytes(root)) < checked.file.size + SPACE_MARGIN_BYTES) throw new UpdateError("update.no-space", 507);
      const asset = release.assets.find((a) => a.name === checked.file.name);
      if (!asset) throw new UpdateError("update.manifest-invalid", 502);
      downloading.total = checked.file.size;
      writeAtomic(join(folder, "ludiary-update.json"), manifest);
      writeAtomic(join(folder, "ludiary-update.json.sig"), signature);
      writeState(dataDir, { state: "downloading", version: release.version, ...kept() });
      await net.download(asset.url, {
        dest: join(folder, checked.file.name),
        size: checked.file.size,
        sha256: checked.file.sha256,
        timeoutMs: 30 * 60_000,
        signal: abort.signal,
        headers: { "User-Agent": `Ludiary/${o.version}` },
        onProgress: (n) => {
          if (downloading) downloading.received = n;
        },
      });
      writeState(dataDir, { state: "ready", version: release.version, ...(opts.retryBad && isBad ? { retryBad: release.version } : {}), ...kept() });
      lastError = undefined;
      failures.delete(release.version);
      log("info", `update ${release.version} downloaded and verified`);
    } catch (e) {
      rmSync(folder, { recursive: true, force: true });
      failures.set(release.version, (failures.get(release.version) ?? 0) + 1);
      const code = e instanceof UpdateError ? e.code.replace(/^update\./, "") : e instanceof UpdateNetError ? (e.code === "hash-mismatch" ? "hash-mismatch" : "download-failed") : "download-failed";
      lastError = code;
      writeState(dataDir, { state: "failed", version: release.version, code, ...kept() });
      log("error", `update ${release.version} not downloaded (${code})`);
      if (!abort.signal.aborted) throw e instanceof UpdateError ? e : new UpdateError(code === "hash-mismatch" ? "update.hash-mismatch" : "update.download-failed", 502);
    } finally {
      downloading = null;
      changed();
    }
  }

  /** Point 6: the folders of other versions and any `.part` left by a stopped download go. */
  function cleanOtherFolders(keep: string | null): void {
    try {
      for (const name of readdirSync(updatesDir(dataDir), { withFileTypes: true })) {
        if (name.isDirectory() && isVersion(name.name) && name.name !== keep) rmSync(join(updatesDir(dataDir), name.name), { recursive: true, force: true });
        else if (name.isDirectory() && name.name === keep) for (const f of readdirSync(join(updatesDir(dataDir), name.name))) if (f.endsWith(".part")) rmSync(join(updatesDir(dataDir), name.name, f), { force: true });
      }
    } catch {
      // no updates folder yet
    }
  }

  return {
    supported,

    async status() {
      const mode = await getMode();
      if (!supported || root === null) return { mode, current: o.version, state: "unsupported" };
      const cache = await readCache();
      const st = readState(dataDir);
      const latest = announced(cache);
      const versions = readVersionsFile(root);
      let state: UpdateViewState = "idle";
      if (downloading) state = "downloading";
      else if (checking) state = "checking";
      else if (st.state === "ready" && st.version && compareVersions(st.version, o.version) > 0) state = "ready";
      else if (st.state === "rolled-back") state = "rolled-back";
      else if (lastError || st.state === "failed") state = "failed";
      else if (latest) state = "available";
      else if (cache.checkedAt !== undefined) state = "up-to-date";
      const error = lastError ?? (st.state === "failed" ? st.code : undefined);
      return {
        mode,
        current: o.version,
        state,
        ...(state === "ready" && st.version ? { latest: st.version } : latest ? { latest: latest.version } : {}),
        ...(downloading && downloading.total > 0 ? { progress: Math.floor((downloading.received / downloading.total) * 100) } : {}),
        ...(cache.checkedAt !== undefined ? { lastCheckAt: cache.checkedAt } : {}),
        ...(error ? { error } : {}),
        ...(latest && versions?.badVersions.includes(latest.version) ? { latestFailedBefore: true } : {}),
        ...(st.updated ? { updated: st.updated } : {}),
        ...(st.state === "rolled-back" && st.from && st.to ? { rolledBack: { from: st.from, to: st.to, code: st.code ?? "1" } } : {}),
        ...(st.downgraded ? { downgraded: true } : {}),
        ...(snooze && now() < snooze.until && (state === "ready" ? st.version : latest?.version) === snooze.version ? { snoozed: true as const } : {}),
      };
    },

    async start() {
      if (!supported || root === null) {
        // Without keys the updater never applies anything; say so once, with the reason, in the log (fails closed).
        log("info", `updater unsupported (${isVersion(o.version) ? (root === null ? "not running from an app folder" : Object.keys(config.keys).length === 0 ? "no public keys embedded" : "no repository") : "development version"})`);
        return;
      }
      reconcileState(dataDir, root, o.version, log);
      const st0 = readState(dataDir);
      cleanOtherFolders(st0.state === "applying" || st0.state === "rolled-back" ? (st0.to ?? null) : (st0.version ?? null)); // an update in flight keeps its folder; so does a rolled-back one (its install.log, ADR 92)
      if (await mayCheckAutomatically()) arm(FIRST_CHECK_MS);
    },

    stop() {
      stopped = true;
      clearTimeout(timer);
      abort.abort(); // the .part is deleted by the downloader; whatever remains is swept at the next start
    },

    async setMode(mode) {
      if (!supported) throw new UpdateError("update.unsupported", 409);
      const before = await getMode();
      await settings.set(K_MODE, mode);
      changed();
      if (mode === "off") {
        clearTimeout(timer);
        checkAbort.abort(); // a check in flight stops asking
      }
      else if (before === "off") arm(5_000);
      if (mode === "auto" && announced(await readCache())) void download({ auto: true }).catch(() => undefined);
    },

    async later() {
      if (!supported) throw new UpdateError("update.unsupported", 409);
      const st = readState(dataDir);
      const version = st.state === "ready" && st.version ? st.version : announced(await readCache())?.version;
      if (!version) throw new UpdateError("update.nothing-new", 409);
      snooze = { version, until: now() + SNOOZE_MS };
      changed();
    },

    async acknowledge() {
      if (inTrial()) return;
      const st = readState(dataDir);
      if (st.updated || st.downgraded || st.state === "rolled-back" || st.state === "failed") {
        // Drops only the notices (`updated`, `downgraded`) and the failure; `retryBad` and the version stay (a ready update keeps working).
        writeState(dataDir, { state: st.state === "ready" || st.state === "downloading" ? st.state : "idle", ...(st.version ? { version: st.version } : {}), ...(st.retryBad ? { retryBad: st.retryBad } : {}) });
        lastError = undefined;
        changed();
      }
    },

    async checkNow() {
      if (!supported) throw new UpdateError("update.unsupported", 409);
      if (now() - lastManualAt < MIN_MANUAL_GAP_MS) throw new UpdateError("update.too-soon", 429);
      lastManualAt = now();
      failures.clear();
      await check(true);
    },

    download: (opts) => download(opts),

    async restart() {
      if (!supported) throw new UpdateError("update.unsupported", 409);
      const st = readState(dataDir);
      if (st.state !== "ready" || !st.version || compareVersions(st.version, o.version) <= 0) throw new UpdateError("update.not-ready", 409);
      if (!o.restart) throw new UpdateError("update.unsupported", 409);
      if (restarting) return; // a second click while the first is on its way: same 202, one restart
      // ADR 92 point 6: a failing check counts as no game (fail open); the update is postponed, not lost.
      if (await o.isGameRunning?.().catch(() => false)) throw new UpdateError("update.game-running", 409);
      // The check is slow: re-validate what it let pass (a concurrent call may have started the restart, or the state changed).
      if (restarting) return;
      const again = readState(dataDir);
      if (again.state !== "ready" || !again.version || compareVersions(again.version, o.version) <= 0) throw new UpdateError("update.not-ready", 409);
      restarting = true;
      const go = o.restart;
      // A moment after the 202 has been sent, so the reply is not cut by the shutdown.
      setTimeout(
        () =>
          void go().catch((e: Error) => {
            restarting = false; // it did not leave: the user may try again
            log("error", `update restart failed: ${e.message}`);
          }),
        300,
      ).unref();
    },
  };
}
