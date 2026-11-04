import { spawn } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { launcherProof, proofsEqual, serverProof, webHostName, type LauncherAction } from "@ludiary/api";
import { translate, type MessageKey } from "@ludiary/i18n";
import { APP_ID, EXIT, INSTALL_TOKEN_NAME, MAX_MASTER_KEY_ID, localeOf, masterKeyName, type RuntimeDeps } from "./deps";
import { createFileLogger, type Logger } from "./files";
import { findRunningServer } from "./health";
import { createSqliteInstanceLock } from "@ludiary/db";
import { maybeApplyUpdate } from "./updates/apply";
import { reconcileState } from "./updates/state";

/** How long the shortcut waits for a server it started (ADR 64: Defender may scan the exe for a while). */
export const START_TIMEOUT_MS = 60_000;
/** ADR 90 point 18, M4: the start of the trial period, with 60 s of margin. The stable launcher (Go) enforces the same figure. */
export const TRIAL_TIMEOUT_MS = START_TIMEOUT_MS * 2;
const STOP_TIMEOUT_MS = 15_000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const NONCE = /^[A-Za-z0-9_-]{43}$/;

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** True only for `http://ludiary.localhost:<port>/open?t=<base64url>` with nothing else in it (ADR 63, 66). */
export function isOwnOpenUrl(url: unknown, port: number): url is string {
  const host = escapeRegExp(webHostName(APP_ID));
  return typeof url === "string" && new RegExp(`^http://${host}:${port}/open\\?t=[A-Za-z0-9_-]{43}$`).test(url);
}

/** Re-read on every attempt: a server started a moment ago may have just created it. */
async function launcherKey(deps: RuntimeDeps): Promise<Uint8Array | null> {
  const raw = await deps.createKeyStore(APP_ID).get(INSTALL_TOKEN_NAME);
  return raw && raw.length === 32 ? raw : null;
}

async function postJson(port: number, path: string, body: unknown): Promise<unknown> {
  const res = await fetch(`http://127.0.0.1:${port}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body ?? {}),
    signal: AbortSignal.timeout(5000),
  });
  return res.ok ? res.json() : null;
}

/**
 * ADR 63: mutual HMAC proof. The token never travels; whoever answers must prove it is our server for this port and
 * nonce. Returns the result, or null for "not our server" (any failure looks the same).
 */
export async function callServer(port: number, key: Uint8Array, action: LauncherAction): Promise<string | null> {
  try {
    const challenge = (await postJson(port, "/api/launcher/challenge", {})) as { nonce?: unknown } | null;
    const nonce = challenge?.nonce;
    if (typeof nonce !== "string" || !NONCE.test(nonce)) return null;
    const answer = (await postJson(port, `/api/launcher/${action}`, { nonce, proof: launcherProof(key, action, port, nonce) })) as {
      result?: unknown;
      proof?: unknown;
    } | null;
    if (typeof answer?.result !== "string") return null;
    return proofsEqual(answer.proof, serverProof(key, action, port, nonce, answer.result)) ? answer.result : null;
  } catch {
    return null;
  }
}

/** Asks whatever runtime.json points to for a one-use link; null unless it proves to be our server. */
async function requestOpenUrl(deps: RuntimeDeps, log: Logger): Promise<string | null> {
  const server = await findRunningServer(deps.platform.dataDir, APP_ID);
  if (!server) return null;
  const key = await launcherKey(deps);
  if (!key) return null;
  const url = await callServer(server.port, key, "open-link");
  if (url === null) log("warn", `the program on port ${server.port} did not prove to be our server`);
  else if (!isOwnOpenUrl(url, server.port)) {
    log("error", "our server returned an unexpected URL; not opening it");
    return null;
  }
  return url;
}

const FATAL_MESSAGES: Partial<Record<number, MessageKey>> = {
  [EXIT.masterKeyUnrecognized]: "fatal.masterKeyUnrecognized",
  [EXIT.keyStore]: "fatal.keyStore",
  [EXIT.database]: "fatal.database",
  [EXIT.databaseTooNew]: "fatal.databaseTooNew",
  [EXIT.noPort]: "fatal.noPort",
};

async function showFatal(deps: RuntimeDeps, key: MessageKey, log: Logger): Promise<void> {
  const locale = localeOf(deps);
  const logs = join(deps.platform.dataDir, "logs");
  await deps.dialogs
    ?.showError(translate(locale, "fatal.title"), translate(locale, key, { logs }))
    .catch((e: Error) => log("error", `dialog failed: ${e.message}`));
}

/** Starts the server in the background and waits for it, unless it exits with an error first (ADR 64). */
async function startServer(deps: RuntimeDeps, log: Logger): Promise<{ url: string } | { failed: MessageKey; exitCode: number }> {
  const child = spawn(deps.selfCommand.command, [...deps.selfCommand.args, "--server"], {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
    env: deps.env,
  });
  let exitCode: number | null = null;
  child.once("exit", (code) => (exitCode = code ?? EXIT.error));
  child.once("error", (e) => {
    log("error", `could not start the server: ${e.message}`);
    exitCode = EXIT.error;
  });
  try {
    const deadline = Date.now() + START_TIMEOUT_MS;
    while (Date.now() < deadline) {
      // Exit code 3: another instance won the lock and is starting; keep waiting for it.
      if (exitCode !== null && exitCode !== EXIT.alreadyRunning) {
        log("error", `server exited with code ${exitCode}`);
        return { failed: FATAL_MESSAGES[exitCode] ?? "fatal.unexpected", exitCode };
      }
      const url = await requestOpenUrl(deps, log);
      if (url) return { url };
      await sleep(250);
    }
    log("error", "server did not become ready in time");
    return { failed: "fatal.timeout", exitCode: EXIT.error };
  } finally {
    child.unref(); // the server keeps running after the shortcut exits
  }
}

/** ADR 89 point 6.2. Starts the launcher of the new process, independent of us, before the server shuts down. */
export function spawnAfterRestartLauncher(deps: RuntimeDeps, log: Logger): void {
  try {
    const child = spawn(deps.selfCommand.command, [...deps.selfCommand.args, "--after-restart"], { detached: true, stdio: "ignore", windowsHide: true, env: deps.env });
    child.once("error", (e) => log("error", `could not start the launcher: ${e.message}`));
    child.unref();
  } catch (e) {
    log("error", `could not start the launcher: ${(e as Error).message}`);
  }
}

/** ADR 89 point 6.2: the launcher goes first, so the new process never depends on the server that is closing. */
export function restartSequence(spawnLauncher: () => void, shutdown: () => void): void {
  spawnLauncher();
  shutdown();
}

/** ADR 89 point 6.2. After a restoration the old server may still answer: wait until it released the instance lock. */
export async function waitForLockRelease(isHeld: () => Promise<boolean>, timeoutMs: number, pollMs = 200): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (await isHeld()) {
    if (Date.now() >= deadline) return false;
    await sleep(pollMs);
  }
  return true;
}

export const AFTER_RESTART_WAIT_MS = 20_000;

export interface LauncherOptions {
  afterRestart?: boolean;
  /** Added by the stable launcher (ADR 90 point 18, B6): only then may this process ask to apply an update (exit 20). */
  fromLauncher?: boolean;
  /** First start of a new version (point 7.5, A3): no error dialogs, and it only succeeds if it started its own server. */
  trial?: boolean;
  /** Installation by hand (M8): confirm the folder, but do not open the browser. */
  noOpen?: boolean;
}

/**
 * Shortcut role (ADR 26): reuse the live server or start one in the background, then open the browser
 * with a one-use link. Exit code 0 on success.
 */
export async function runLauncher(deps: RuntimeDeps, opts: LauncherOptions = {}): Promise<number> {
  const { platform } = deps;
  mkdirSync(platform.dataDir, { recursive: true });
  const log = createFileLogger(platform.dataDir, "launcher");
  /** A trial returns the code instead of showing a dialog: the stable launcher decides what to do (point 7.5). */
  const fatal = async (key: MessageKey) => {
    if (!opts.trial) await showFatal(deps, key, log);
  };
  try {
    if (deps.updates?.platform.installRoot) reconcileState(platform.dataDir, deps.updates.platform.installRoot, deps.version, log);
    if (opts.afterRestart) {
      const lock = createSqliteInstanceLock(join(platform.dataDir, "instance.lock"), deps.sqliteAddon);
      if (!(await waitForLockRelease(() => lock.isHeld(), AFTER_RESTART_WAIT_MS))) {
        log("error", "the previous server did not release the instance lock in time");
        await fatal("fatal.timeout");
        return EXIT.error;
      }
    }
    let url = await requestOpenUrl(deps, log);
    if (url && opts.trial) {
      log("error", "trial: a server was already answering; this start proves nothing");
      return EXIT.error;
    }
    if (url) log("info", "server already running");
    else {
      // No server of ours is running: the only moment an update may be applied (point 7.2).
      if (opts.fromLauncher && !opts.trial && (await maybeApplyUpdate(deps, log))) return EXIT.applyUpdate;
      log("info", "no server of ours is answering; starting one in the background");
      const started = await startServer(deps, log);
      if ("failed" in started) {
        await fatal(started.failed);
        return opts.trial ? started.exitCode : EXIT.error;
      }
      url = started.url;
    }
    if (opts.trial && !(await serverIsThisVersion(deps, log))) return EXIT.error;

    // Test hook (removed from release builds, ADR 65): write the URL instead of launching a browser.
    const sink = deps.env["LUDIARY_OPEN_URL_FILE"];
    if (opts.noOpen) log("info", "browser not opened (--no-open)");
    else if (sink) writeFileSync(sink, url);
    else await platform.openUrl(url);
    if (!opts.noOpen) log("info", "browser opened");
    return EXIT.ok;
  } catch (e) {
    log("error", `fatal: ${(e as Error).stack ?? String(e)}`);
    await fatal("fatal.unexpected");
    return EXIT.error;
  }
}

/** ADR 90 point 18, A3: the server that answers must prove it is ours and must report this very version. */
async function serverIsThisVersion(deps: RuntimeDeps, log: Logger): Promise<boolean> {
  const server = await findRunningServer(deps.platform.dataDir, APP_ID);
  const key = await launcherKey(deps);
  const version = server && key ? await callServer(server.port, key, "version") : null;
  if (version !== deps.version) log("error", "trial: the server did not report this version");
  return version === deps.version;
}

/** Asks a live server to stop (used by the installer before upgrading or uninstalling). 0 = no server left. */
export async function runStop(deps: RuntimeDeps): Promise<number> {
  // Never opened on this machine: nothing to stop, and do not leave a new data folder behind.
  if (!existsSync(deps.platform.dataDir)) return EXIT.ok;
  const lock = createSqliteInstanceLock(join(deps.platform.dataDir, "instance.lock"), deps.sqliteAddon);
  const deadline = Date.now() + STOP_TIMEOUT_MS;
  let lastAsk = 0;
  while (Date.now() < deadline) {
    if (!(await lock.isHeld())) return EXIT.ok;
    // Ask again every second: another local user flooding nonces could evict a single attempt's nonce (ADR 63).
    if (Date.now() - lastAsk >= 1000) {
      lastAsk = Date.now();
      const server = await findRunningServer(deps.platform.dataDir, APP_ID);
      const key = await launcherKey(deps);
      if (server && key) await callServer(server.port, key, "shutdown");
    }
    await sleep(200);
  }
  return EXIT.error;
}

/** Removes every master key slot and the installation token from the credential store (ADR 14: recoverable). */
export async function runPurge(deps: RuntimeDeps): Promise<number> {
  const store = deps.createKeyStore(APP_ID);
  for (let id = 1; id <= MAX_MASTER_KEY_ID; id++) await store.delete(masterKeyName(id));
  await store.delete(INSTALL_TOKEN_NAME);
  return EXIT.ok;
}
