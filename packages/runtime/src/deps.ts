import type {
  EmbeddedLogin,
  FilePicker,
  FolderPicker,
  KeyStore,
  LocalFiles,
  LocationResolver,
  PlatformInfo,
  ProcessLauncher,
  ProcessWatcher,
  StoreConnector,
  TrayHost,
  UserDialogs,
  UserFolders,
} from "@ludiary/contracts";
import type { CoreDeps } from "@ludiary/core";
import type { SqliteAddon } from "@ludiary/db";
import { pickLocale, type Locale } from "@ludiary/i18n";
import type { UpdateKeys } from "./updates/manifest";
import type { UpdateDownloader } from "@ludiary/platform-node";

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
  /** ADR 90: the inner launcher asks the stable launcher to run the installer of a downloaded update. */
  applyUpdate: 20,
} as const;

/** ADR 90 point 12. Optional port: without it the updater reports `unsupported` (e.g. Docker). */
export interface UpdatePlatform {
  /** Key of manifest.files, e.g. "windows-x64". */
  readonly target: string;
  /** Folder managed by the stable launcher; null when this build does not run from an app-<version> folder. */
  readonly installRoot: string | null;
  freeBytes(dir: string): Promise<number>;
  /** Starts `<installRoot>\Ludiary.exe --after-stop` detached; the caller then stops the server. */
  restartIntoLauncher(): Promise<void>;
}

/** Build-time constants plus the platform port of the updater (ADR 90). */
export interface UpdateConfig {
  platform: UpdatePlatform;
  /** Public keys embedded at build time. Empty: nothing is ever applied and the log says so (fails closed). */
  keys: UpdateKeys;
  /** "owner/name" of the GitHub repository, a build constant (point 3.2), never a setting. */
  repo: string;
  /** Only tests and the test variant (ADR 65, LUDIARY_UPDATE_FEED). */
  downloader?: UpdateDownloader;
  feed?: { releaseUrl: string; downloadBase: string };
}

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
  /** ADR 93. Absent: manual games cannot be added in this mode. */
  filePicker?: FilePicker;
  /** ADR 92. Absent: there is never a game running (Docker, tests). */
  processWatcher?: ProcessWatcher;
  /** ADR 89. Absent: activating the periodic backups asks for a folder. */
  userFolders?: UserFolders;
  /** ADR 80. Absent (Docker, Linux): the embedded-login step is rejected as unavailable. */
  embeddedLogin?: EmbeddedLogin;
  /** Connectors to register. Defaults to the static list of `connectors.ts` (ADR 38); only tests override it. */
  connectors?: readonly StoreConnector[];
  /** Price services to register. Defaults to the static list of `connectors.ts` (ADR 86); only tests override it. */
  priceServices?: CoreDeps["priceServices"];
  /** ADR 90. Absent: the updater is `unsupported` and never makes a request. */
  updates?: UpdateConfig;
  /** Releases what the platform keeps open (helper processes, e.g. a folder dialog) when the server shuts down. */
  dispose?: () => void;
}

/** LUDIARY_LANG overrides the system language (kept in release builds for support, ADR 65). */
export const localeOf = (deps: RuntimeDeps): Locale => pickLocale(deps.env["LUDIARY_LANG"] ?? deps.platform.systemLocale);
