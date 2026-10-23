import { randomUUID } from "node:crypto";
import type { LudiaryCoreFacade } from "@ludiary/api";
import type { StoreConnector } from "@ludiary/contracts";
import { ConnectorRegistrationError, createCore, type CoreLogger, type LudiaryCore } from "@ludiary/core";
import { createRepositories, DatabaseTooNewError, migrate } from "@ludiary/db";
import { translate, type ConnectorMessageKey, type MessageKey } from "@ludiary/i18n";
import { createHttpClient, createNodeLocalFiles, createSecretCipher, systemClock } from "@ludiary/platform-node";
import { createConnectors, unionUriSchemes } from "./connectors";
import { createCoreFacade } from "./core-adapter";
import { EXIT, localeOf, type RuntimeDeps } from "./deps";
import type { Logger } from "./files";

/** An error that already knows which exit code the launcher should report (ADR 64). */
export class FatalError extends Error {
  constructor(
    readonly exitCode: number,
    message: string,
  ) {
    super(message);
  }
}

type SqliteDatabase = Parameters<typeof migrate>[0];

/** Adapts the file logger to the core's structured logger. Fields are scalars chosen by the core: no paths, no names. */
export function coreLogger(log: Logger): CoreLogger {
  const line = (msg: string, fields?: Readonly<Record<string, string | number | boolean>>) =>
    fields && Object.keys(fields).length > 0
      ? `${msg} ${Object.entries(fields)
          .map(([k, v]) => `${k}=${String(v)}`)
          .join(" ")}`
      : msg;
  return {
    debug: () => {}, // the stand-in logger has no debug level (ADR 59)
    info: (m, f) => log("info", line(m, f)),
    warn: (m, f) => log("warn", line(m, f)),
    error: (m, f) => log("error", line(m, f)),
  };
}

/**
 * Applies migrations before anything reads the database (ADR 72 point 4). A database from a newer version is never
 * opened (exit 12, ADR 64); any other migration failure also exits with 12, after the pre-migration copy (ADR 57).
 */
export async function migrateDatabase(sqlite: SqliteDatabase, backupDir: string, log: Logger): Promise<void> {
  try {
    const result = await migrate(sqlite, { backupDir });
    if (result.applied.length > 0) log("info", `migrations applied: ${result.applied.join(", ")}${result.backupFile ? " (pre-migration copy made)" : ""}`);
  } catch (e) {
    if (e instanceof DatabaseTooNewError) {
      throw new FatalError(EXIT.databaseTooNew, `the database was written by a newer version (unknown migrations: ${e.unknownMigrations.join(", ")})`);
    }
    throw new FatalError(EXIT.database, `migration failed: ${(e as Error).message}`);
  }
}

export interface ComposedCore {
  core: LudiaryCore;
  facade: LudiaryCoreFacade;
  connectors: readonly StoreConnector[];
}

/**
 * Composition of the core (ADR 38, 72): connectors, repositories, node files and the platform ports the mode provides.
 * A connector refused at registration (wrong contract version, launch kinds the platform cannot run) stops the server
 * with a clear log line instead of leaving a half-working store.
 * `masterKey` is the key loadMasterKey chose (ADR 64): its slot id goes into every encrypted secret (ADR 46, 74).
 */
export async function composeCore(
  deps: RuntimeDeps,
  sqlite: SqliteDatabase,
  log: Logger,
  masterKey: { id: number; value: Uint8Array },
): Promise<ComposedCore> {
  const connectors = deps.connectors ?? createConnectors();
  const files = createNodeLocalFiles();
  const repos = createRepositories(sqlite);
  const locale = localeOf(deps);
  const locations = deps.createLocationResolver?.(files);
  const launcher = deps.createProcessLauncher?.(unionUriSchemes(connectors));
  try {
    await repos.identity.ensure(randomUUID, systemClock.now()); // before using any repository (ADR 47)
    const core = await createCore({
      connectors,
      library: repos.library,
      scanRoots: repos.scanRoots,
      syncState: repos.syncState,
      settings: repos.settings,
      identity: repos.identity,
      secrets: repos.secrets,
      connections: repos.connections,
      cipher: createSecretCipher(masterKey),
      files,
      ...(locations ? { locations } : {}),
      ...(launcher ? { launcher } : {}),
      ...(deps.folderPicker ? { folderPicker: deps.folderPicker } : {}),
      ...(deps.embeddedLogin ? { embeddedLogin: deps.embeddedLogin } : {}),
      http: deps.http ?? ((hosts, signal, log, opts) => createHttpClient({ hosts, signal, log, ...(opts?.maxBytes ? { maxBytes: opts.maxBytes } : {}) })),
      clock: systemClock,
      newId: randomUUID,
      log: coreLogger(log),
      t: (key) => translate(locale, key as MessageKey | ConnectorMessageKey),
      systemLocale: deps.platform.systemLocale,
    });
    return { core, facade: createCoreFacade(core), connectors };
  } catch (e) {
    if (e instanceof ConnectorRegistrationError) {
      throw new FatalError(EXIT.error, `connector '${e.connectorId}' refused at startup: ${e.problems.join("; ")}`);
    }
    throw e;
  }
}
