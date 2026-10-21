// Entry point of Ludiary.exe (composition for Windows). Bundled by esbuild into one CommonJS file,
// then injected into a Node single executable (SEA). See scripts/build.mjs.
import { createHash } from "node:crypto";
import { appendFileSync } from "node:fs";
import { isSea } from "node:sea";
import { join } from "node:path";
import type { UserDialogs } from "@ludiary/contracts";
import {
  CredentialManagerKeyStore,
  HelperProcessDialogs,
  HelperProcessTrayHost,
  createWindowsPlatformInfo,
  type KeyringBinding,
} from "@ludiary/platform-windows";
import { APP_ID, createFileLogger, main, type RuntimeDeps, type SqliteAddon } from "@ludiary/runtime";

declare const __LUDIARY_VERSION__: string;
/** False in release builds: esbuild then drops the test-hook branches and they do not exist in the binary (ADR 65). */
declare const __LUDIARY_TEST_HOOKS__: boolean;

/**
 * Test hooks let tests redirect native addons, the tray helper, the data folder, the browser and the dialogs.
 * In a signed release they would let anyone who controls the environment run code as Ludiary.exe, so they are removed.
 */
const TEST_HOOK_VARS = ["LUDIARY_NATIVE_DIR", "LUDIARY_TRAY_HELPER", "LUDIARY_DATA_DIR", "LUDIARY_OPEN_URL_FILE", "LUDIARY_DIALOG_FILE"];
/** Node variables that change how a release behaves (TLS checks off, preloaded code); never inherited (ADR 65). */
const UNSAFE_NODE_VARS = ["NODE_OPTIONS", "NODE_TLS_REJECT_UNAUTHORIZED"];

if (!__LUDIARY_TEST_HOOKS__) for (const name of UNSAFE_NODE_VARS) delete process.env[name];

function runtimeEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  if (!__LUDIARY_TEST_HOOKS__) for (const name of TEST_HOOK_VARS) delete env[name];
  return env;
}

/** Native addons cannot live inside a SEA: load them from native/ next to the executable (ADR 41, 45). */
function loadAddon(file: string): object {
  const holder: { exports: object } = { exports: {} };
  process.dlopen(holder, file);
  return holder.exports;
}

/** Test builds with their own data folder get their own credentials, so --purge can never delete the real ones. */
function credentialService(service: string, env: NodeJS.ProcessEnv): string {
  const dataDir = __LUDIARY_TEST_HOOKS__ ? env["LUDIARY_DATA_DIR"] : undefined;
  if (!dataDir || service !== APP_ID) return service;
  return `${APP_ID}-test-${createHash("sha256").update(dataDir).digest("hex").slice(0, 8)}`;
}

function compose(): RuntimeDeps {
  const env = runtimeEnv();
  const platform = createWindowsPlatformInfo({ appId: APP_ID, execPath: process.execPath, env });
  const nativeDir = env["LUDIARY_NATIVE_DIR"] || join(platform.installDir, "native");
  const trayHelper = env["LUDIARY_TRAY_HELPER"] || join(platform.installDir, "bin", "ludiary-tray.exe");

  let keyring: KeyringBinding | undefined;
  const createKeyStore = (service: string) => {
    keyring ??= loadAddon(join(nativeDir, "keyring.win32-x64-msvc.node")) as KeyringBinding;
    return new CredentialManagerKeyStore(keyring, credentialService(service, env));
  };

  const dialogFile = env["LUDIARY_DIALOG_FILE"];
  const dialogs: UserDialogs = dialogFile
    ? { showError: async (title, body) => appendFileSync(dialogFile, JSON.stringify({ title, body }) + "\n") }
    : new HelperProcessDialogs(trayHelper);

  let sqlite: SqliteAddon | undefined;
  const deps: RuntimeDeps = {
    version: __LUDIARY_VERSION__,
    platform,
    env,
    createKeyStore,
    createTray: () => new HelperProcessTrayHost(trayHelper),
    dialogs,
    // Loaded lazily through a getter so that roles that never touch SQLite do not pay for it.
    get sqliteAddon() {
      sqlite ??= loadAddon(join(nativeDir, "better_sqlite3.node"));
      return sqlite;
    },
    selfCommand: isSea()
      ? { command: process.execPath, args: [] }
      : { command: process.execPath, args: [process.argv[1] ?? ""] },
  };
  return deps;
}

function crashLog(error: unknown): void {
  try {
    // Works even if compose() failed; the shared logger caps the size and removes the user's home folder.
    const env = runtimeEnv();
    const dataDir = env["LUDIARY_DATA_DIR"] || join(env["LOCALAPPDATA"] ?? ".", APP_ID);
    createFileLogger(dataDir, "crash")("error", error instanceof Error ? (error.stack ?? error.message) : String(error));
  } catch {
    /* nothing else we can do without a console */
  }
}

process.on("uncaughtException", (e) => {
  crashLog(e);
  process.exit(1);
});

// In a SEA the user arguments start at argv[1]; when run as a plain script they start at argv[2].
const args = process.argv.slice(isSea() ? 1 : 2);
main(args, compose()).then(
  (code) => process.exit(code),
  (e: unknown) => {
    crashLog(e);
    process.exit(1);
  },
);
