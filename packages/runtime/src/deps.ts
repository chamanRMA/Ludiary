import type { KeyStore, PlatformInfo, TrayHost, UserDialogs } from "@ludiary/contracts";
import { pickLocale, type Locale } from "@ludiary/i18n";
import type { SqliteAddon } from "./database";

/** Technical identifier (ADR 44): data folder, credential service, cookie and health response derive from it. */
export const APP_ID = "Ludiary";
/** Credential account of the master key with id n (ADR 46, 64): `master-key/<n>`. */
export const masterKeyName = (id: number) => `master-key/${id}`;
/** Highest key id tried. Unrecognized entries are kept as their own compartment (ADR 64), never overwritten. */
export const MAX_MASTER_KEY_ID = 16;
export const INSTALL_TOKEN_NAME = "install-token";

/** Exit codes of the server role (ADR 64); the launcher turns them into a message for the user. */
export const EXIT = {
  ok: 0,
  error: 1,
  alreadyRunning: 3,
  masterKeyUnrecognized: 10,
  keyStore: 11,
  database: 12,
  noPort: 13,
} as const;

/** Everything OS-specific or build-specific enters the runtime through this object (ADR 38). */
export interface RuntimeDeps {
  version: string;
  platform: PlatformInfo;
  env: NodeJS.ProcessEnv;
  /** Creates a KeyStore bound to a credential "service" name. */
  createKeyStore: (service: string) => KeyStore;
  /** Absent when the platform has no tray (e.g. headless tests): the server then runs without it. */
  createTray?: () => TrayHost;
  /** Absent in headless runs: fatal errors are then only logged. */
  dialogs?: UserDialogs;
  sqliteAddon?: SqliteAddon;
  /** How to start a second copy of ourselves in server mode. */
  selfCommand: { command: string; args: string[] };
}

/** LUDIARY_LANG overrides the system language (kept in release builds for support, ADR 65). */
export const localeOf = (deps: RuntimeDeps): Locale => pickLocale(deps.env["LUDIARY_LANG"] ?? deps.platform.systemLocale);
