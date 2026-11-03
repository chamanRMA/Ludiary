import type {
  EmbeddedLogin,
  FolderPicker,
  KeyStore,
  LocalFiles,
  LocationResolver,
  PlatformInfo,
  ProcessLauncher,
  StoreConnector,
  TrayHost,
  UserDialogs,
} from "@ludiary/contracts";
import type { CoreDeps } from "@ludiary/core";
import type { SqliteAddon } from "@ludiary/db";
import { pickLocale, type Locale } from "@ludiary/i18n";

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
  /** The database was written by a newer version of Ludiary (ADR 72). */
  databaseTooNew: 14,
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

  /**
   * Folder with the compiled SPA (ADR 72 points 6 and 9): `web/` next to the executable, or the test hook of ADR 65.
   * Absent or missing on disk: the server still starts and `/` explains that a reinstall is needed.
   */
  webDir?: string;
  /** Test seam (ADR 73): replaces the real HttpClient factory, so tests never touch the network. */
  http?: CoreDeps["http"];
  /** Absent: this mode cannot auto-detect installations (ADR 22, 38); manual folders still work. */
  createLocationResolver?: (files: LocalFiles) => LocationResolver;
  /** Receives the union of the `uriSchemes` of the registered connectors. Absent: this mode cannot launch games. */
  createProcessLauncher?: (allowedSchemes: readonly string[]) => ProcessLauncher;
  /** Absent: this mode cannot open a native folder dialog. */
  folderPicker?: FolderPicker;
  /** ADR 80. Absent (Docker, Linux): the embedded-login step is rejected as unavailable. */
  embeddedLogin?: EmbeddedLogin;
  /** Connectors to register. Defaults to the static list of `connectors.ts` (ADR 38); only tests override it. */
  connectors?: readonly StoreConnector[];
  /** Price services to register. Defaults to the static list of `connectors.ts` (ADR 86); only tests override it. */
  priceServices?: CoreDeps["priceServices"];
  /** Releases what the platform keeps open (helper processes, e.g. a folder dialog) when the server shuts down. */
  dispose?: () => void;
}

/** LUDIARY_LANG overrides the system language (kept in release builds for support, ADR 65). */
export const localeOf = (deps: RuntimeDeps): Locale => pickLocale(deps.env["LUDIARY_LANG"] ?? deps.platform.systemLocale);
