import { randomBytes } from "node:crypto";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { createLocalServer, SessionStore, type LocalServer } from "@ludiary/api";
import type { KeyStore, TrayHost, TrayState } from "@ludiary/contracts";
import type { LastRestore } from "@ludiary/core";
import { createBackupStore, createSqliteInstanceLock } from "@ludiary/db";
import { translate } from "@ludiary/i18n";
import { composeCore, FatalError, migrateDatabase } from "./compose";
import { unionMediaHosts } from "./connectors";
import { APP_ID, EXIT, INSTALL_TOKEN_NAME, MAX_MASTER_KEY_ID, localeOf, masterKeyName, type RuntimeDeps } from "./deps";
import { restartSequence, spawnAfterRestartLauncher } from "./launcher";
import { startDatabase } from "./restore-startup";
import { createLogExporter } from "./log-export";
import { createFileLogger, readRuntimeInfo, writeRuntimeInfo, type Logger } from "./files";
import { candidatePorts } from "./ports";
import { createUpdatesFacade } from "./updates/facade";
import { createUpdateService, UpdateError, type UpdateService } from "./updates/service";
import { loadWebAssets } from "./web-assets";

const KEY_BYTES = 32;

/** Runs one startup step and maps any failure to its exit code. */
async function step<T>(exitCode: number, what: string, fn: () => T | Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof FatalError) throw e;
    throw new FatalError(exitCode, `${what}: ${(e as Error).message}`);
  }
}

/**
 * Master key (ADR 14, 46, 64). The first recognized entry `master-key/<n>` is used. An entry this version does not
 * recognize is never overwritten: it stays as its own compartment (secrets encrypted with it keep their key id and are
 * simply not readable here). Only when no slot holds a recognized key is a new one created, in the first free slot:
 * a free slot before a valid key (after a rotation) must not replace that key.
 */
export async function loadMasterKey(store: KeyStore, log: Logger): Promise<{ id: number; value: Buffer; origin: "created" | "loaded" }> {
  let firstFree: number | null = null;
  for (let id = 1; id <= MAX_MASTER_KEY_ID; id++) {
    const existing = await store.get(masterKeyName(id));
    if (existing === null) firstFree ??= id;
    else if (existing.length === KEY_BYTES) return { id, value: Buffer.from(existing), origin: "loaded" };
    else log("warn", `${masterKeyName(id)} has a format this version does not recognize (${existing.length} bytes); kept untouched`);
  }
  if (firstFree === null) throw new FatalError(EXIT.masterKeyUnrecognized, "no recognizable master key slot left");
  const value = randomBytes(KEY_BYTES);
  await store.set(masterKeyName(firstFree), value);
  return { id: firstFree, value, origin: "created" };
}

/** Installation token (ADR 23, 63). Losing it costs nothing, so an invalid one is simply regenerated. */
export async function loadInstallToken(store: KeyStore, log: Logger): Promise<Buffer> {
  const existing = await store.get(INSTALL_TOKEN_NAME);
  if (existing !== null && existing.length === KEY_BYTES) return Buffer.from(existing);
  if (existing !== null) log("warn", "install token had an unexpected size; regenerated");
  const value = randomBytes(KEY_BYTES);
  await store.set(INSTALL_TOKEN_NAME, value);
  return value;
}

async function listenOnAvailablePort(makeServer: () => LocalServer, saved: number | null, log: Logger): Promise<{ server: LocalServer; port: number }> {
  for (const candidate of candidatePorts(saved)) {
    const server = makeServer(); // a fresh instance per attempt: a failed listen leaves Fastify unusable
    try {
      const port = await server.listen(candidate);
      return { server, port };
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code;
      if (code !== "EADDRINUSE" && code !== "EACCES") throw e;
      log("warn", `port ${candidate} unavailable (${code})`);
      await server.close().catch(() => {});
    }
  }
  throw new FatalError(EXIT.noPort, "no port available");
}

/** The background role: database, secrets, local HTTP server and tray. Resolves with the exit code (see EXIT). */
export async function runServer(deps: RuntimeDeps): Promise<number> {
  const { platform } = deps;
  mkdirSync(platform.dataDir, { recursive: true });
  const log = createFileLogger(platform.dataDir, "server");

  let release: (() => void) | null;
  try {
    // ADR 62: first of all, so two servers never touch the same database or create two master keys.
    release = await createSqliteInstanceLock(join(platform.dataDir, "instance.lock"), deps.sqliteAddon).acquire();
  } catch (e) {
    log("error", `instance lock: ${(e as Error).message}`);
    return EXIT.database;
  }
  if (!release) {
    log("info", "another server holds the instance lock; exiting");
    return EXIT.alreadyRunning;
  }
  rmSync(join(platform.dataDir, "server.lock"), { force: true }); // file lock of the first prototype, no longer used

  let shutdown: () => Promise<void> = async () => {};
  let closeDb: () => void = () => {};
  let waitForScans: () => Promise<void> = async () => {};
  try {
    const keyStore = deps.createKeyStore(APP_ID);
    const masterKey = await step(EXIT.keyStore, "credential store", () => loadMasterKey(keyStore, log));
    const installToken = await step(EXIT.keyStore, "credential store", () => loadInstallToken(keyStore, log));
    log("info", `master key ${masterKeyName(masterKey.id)} ${masterKey.origin}`);

    // ADR 89 point 6.3: pending restoration -> database -> migrations -> adjustment -> composeCore (rolled back as a whole).
    let lastRestore: LastRestore | null = null;
    const started = await step(EXIT.database, "database", () =>
      startDatabase({
        dataDir: platform.dataDir,
        addon: deps.sqliteAddon,
        log,
        now: Date.now,
        migrate: (d, skipBackup) => migrateDatabase(d, join(platform.dataDir, "backups"), log, skipBackup), // FatalError(12) on failure or newer database
        compose: (d) => {
          const backups = createBackupStore({ db: d, dataDir: platform.dataDir, internalDir: join(platform.dataDir, "backups"), addon: deps.sqliteAddon });
          return composeCore(deps, d, log, masterKey, { backups, lastRestore: () => lastRestore });
        },
      }),
    );
    const { db, composed } = started;
    lastRestore = started.lastRestore;
    const dbStatus = {
      sqliteVersion: (db.prepare("SELECT sqlite_version() AS v").get() as { v: string }).v,
      journalMode: String(db.pragma("journal_mode", { simple: true })),
    };
    log("info", `sqlite ${dbStatus.sqliteVersion} journal=${dbStatus.journalMode}`);
    let dbOpen = true;
    closeDb = () => {
      if (dbOpen) db.close();
      dbOpen = false;
    };
    const { core, facade, connectors, services, settings } = composed;
    waitForScans = () => core.whenIdle();
    const mediaHosts = unionMediaHosts(connectors, services);
    const webAssets = loadWebAssets(deps.webDir, log); // once, at startup (ADR 72 point 6)

    const locale = localeOf(deps);
    let exitResolve: (code: number) => void = () => {};
    const exited = new Promise<number>((resolve) => (exitResolve = resolve));
    let tray: TrayHost | null = null;
    let trayItems: () => TrayState = () => ({ tooltip: "", items: [] });
    let updateEntry: { id: string; label: string } | null = null;
    // ADR 90: the updater only exists when the build provides its port; without it the API answers `update.unsupported`.
    let updates: UpdateService | undefined;
    if (deps.updates) {
      const cfg = deps.updates;
      updates = createUpdateService({
        version: deps.version,
        dataDir: platform.dataDir,
        config: cfg,
        settings,
        log,
        isGameRunning: () => core.isGameRunning(),
        onChange: () => void refreshUpdateEntry(),
        restart: async () => {
          await cfg.platform.restartIntoLauncher();
          await shutdown();
        },
      });
    }
    /** Entry of the tray menu for a ready or available update (point 10). */
    async function refreshUpdateEntry(): Promise<void> {
      if (!updates) return;
      try {
        const s = await updates.status();
        updateEntry =
          s.state === "ready" && s.latest
            ? { id: "update-restart", label: translate(locale, "tray.updateReady", { version: s.latest }) }
            : s.state === "available" && s.mode === "notify" && !s.snoozed
              ? { id: "update-available", label: translate(locale, "tray.updateAvailable") }
              : null;
        tray?.update(trayItems());
      } catch (e) {
        log("warn", `tray update entry failed: ${(e as Error).name}`);
      }
    }
    let backupTimer: NodeJS.Timeout | undefined;
    let stopping = false;

    const exportLogFile = createLogExporter({
      dataDir: platform.dataDir,
      version: deps.version,
      locale,
      stores: () => core.storeStatus(),
      ...(updates ? { updates: () => updates!.status() } : {}),
    });

    const makeServer = () =>
      createLocalServer({
        appId: APP_ID,
        version: deps.version,
        launcherKey: installToken,
        // One store per attempt: a link minted while an attempt was half-listening dies with that attempt (ADR 66).
        sessions: new SessionStore(),
        t: (key) => translate(locale, key),
        getStatus: () => ({
          locale,
          db: dbStatus,
          masterKey: { id: masterKey.id, origin: masterKey.origin },
          tray: tray !== null,
        }),
        onShutdownRequested: () => void shutdown(),
        // ADR 89 point 6.2: the launcher goes first and is independent of us; only then does this server shut down.
        onRestartRequested: () => restartSequence(() => spawnAfterRestartLauncher(deps, log), () => void shutdown()),
        core: facade,
        ...(updates ? { updates: createUpdatesFacade(updates) } : {}),
        exportLogs: async () => {
          const out = await exportLogFile();
          log("info", `logs exported (${Buffer.byteLength(out.body)} bytes)`);
          return out;
        },
        webAssets,
        mediaHosts,
        // Name and stack frames only: the message of an unknown exception may quote store data (ADR 87 point 13).
        onInternalError: (err) => log("error", `internal error in a route: ${internalErrorSummary(err)}`),
      });

    const saved = readRuntimeInfo(platform.dataDir)?.port ?? null;
    const { server, port } = await listenOnAvailablePort(makeServer, saved, log);
    if (saved !== null && saved !== port) log("info", `saved port ${saved} was busy; now using ${port}`);
    writeRuntimeInfo(platform.dataDir, { version: deps.version, port, pid: process.pid });
    if (server.ipv6) log("info", `listening on 127.0.0.1 and [::1]:${port}`);
    else log("warn", `listening on 127.0.0.1:${port} only: this machine has no IPv6 loopback`);

    shutdown = async () => {
      if (stopping) return;
      stopping = true;
      log("info", "shutting down");
      // Safety net: a stuck step must never leave a zombie server. The OS releases the instance lock on exit.
      setTimeout(() => process.exit(EXIT.ok), 5_000).unref();
      clearInterval(backupTimer);
      updates?.stop();
      await tray?.stop().catch(() => {});
      core.shutdown(); // closes any open login window before the server waits for its pending request (ADR 80)
      await server.close().catch(() => {});
      // A scan in flight must not find the database closed; the 5 s safety net above bounds the wait.
      await Promise.race([waitForScans(), new Promise((r) => setTimeout(r, 3_000))]).catch(() => {});
      closeDb();
      deps.dispose?.(); // kills helper processes that outlive the server, e.g. an open folder dialog
      writeRuntimeInfo(platform.dataDir, { version: deps.version, port, pid: null });
      release?.();
      release = null;
      exitResolve(EXIT.ok);
    };

    if (deps.createTray) {
      const trayState = (): TrayState => ({
        tooltip: translate(locale, "tray.tooltip"),
        items: [
          { id: "status", label: translate(locale, "tray.status", { port }), enabled: false },
          ...(updateEntry ? [{ id: updateEntry.id, label: updateEntry.label }] : []),
          { id: "open", label: translate(locale, "tray.open") },
          // Plan B of ADR 66 for a browser that does not resolve ludiary.localhost.
          { id: "open-alt", label: translate(locale, "tray.openAlt") },
          { id: "quit", label: translate(locale, "tray.quit") },
        ],
      });
      trayItems = trayState;
      const host = deps.createTray();
      host.onClick((id) => {
        if (id === "quit") void shutdown();
        else if (id === "update-restart") {
          void updates?.restart().catch((e: Error) => {
            log("warn", `update restart refused: ${e.message}`);
            // ADR 92: with a game open the web explains why; the tray has no way to say it.
            if (e instanceof UpdateError && e.code === "update.game-running") {
              platform.openUrl(server.createOpenUrl("name")).catch((err: Error) => log("error", `open failed: ${err.message}`));
            }
          });
        }
        else if (id === "open" || id === "@default" || id === "open-alt" || id === "update-available") {
          const url = server.createOpenUrl(id === "open-alt" ? "ip" : "name");
          platform.openUrl(url).catch((e: Error) => log("error", `open failed: ${e.message}`));
        }
      });
      host.onLost((reason) => log("error", `tray lost: ${reason}`));
      try {
        await host.start(trayState());
        tray = host;
        log("info", "tray ready");
      } catch (e) {
        // The server keeps working without the tray; the user can still open it from the shortcut.
        log("error", `tray failed: ${(e as Error).message}`);
      }
    }

    await updates?.start().catch((e: Error) => log("error", `updater did not start (${e.name})`)); // never stops the server
    void refreshUpdateEntry();

    // ADR 89 point 5: the core has no timers. Once at the end of startup and then every hour.
    void core.backupTick();
    backupTimer = setInterval(() => void core.backupTick(), 3_600_000);
    backupTimer.unref();

    process.once("SIGINT", () => void shutdown());
    process.once("SIGTERM", () => void shutdown());
    return await exited;
  } catch (e) {
    log("error", `fatal: ${(e as Error).stack ?? String(e)}`);
    await shutdown();
    closeDb();
    deps.dispose?.();
    release?.();
    return e instanceof FatalError ? e.exitCode : EXIT.error;
  }
}


/** `Name` plus the `at ...` stack lines; never the message. */
export function internalErrorSummary(err: unknown): string {
  const e = err as { name?: unknown; stack?: unknown };
  // The header `Name: message` can span several lines and even contain "at ..." lines: cut it off first.
  const header = err instanceof Error ? String(err) : "";
  const full = typeof e?.stack === "string" ? e.stack : "";
  const stack = full.startsWith(header) ? full.slice(header.length) : full;
  const frames = stack.split("\n").filter((l) => l.trimStart().startsWith("at "));
  return [typeof e?.name === "string" ? e.name : "unknown", ...frames].join("\n");
}
