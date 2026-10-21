import type { RuntimeDeps } from "./deps";
import { runLauncher, runPurge, runStop } from "./launcher";
import { runSelfTest } from "./selftest";
import { runServer } from "./server-role";

export { APP_ID, type RuntimeDeps } from "./deps";
export type { SqliteAddon } from "@ludiary/db";
export { createFileLogger, redactHome } from "./files";

/**
 * Same executable, several roles (ADR 45):
 *   (no flag)  shortcut: reuse or start the server, open the browser
 *   --server   background server with tray
 *   --stop     ask the live server to stop (installer)
 *   --purge    delete the secrets this app keeps in the credential store (uninstaller, when the user asks)
 *   --selftest --out <file>   packaging smoke test
 */
export async function main(argv: readonly string[], deps: RuntimeDeps): Promise<number> {
  if (argv.includes("--server")) return runServer(deps);
  if (argv.includes("--stop")) return runStop(deps);
  if (argv.includes("--purge")) return runPurge(deps);
  if (argv.includes("--selftest")) {
    const i = argv.indexOf("--out");
    const out = i >= 0 ? argv[i + 1] : undefined;
    if (!out) return 2;
    return runSelfTest(deps, out);
  }
  return runLauncher(deps);
}
export { loadWebAssets, MIME_TYPES } from "./web-assets";
export { createCoreFacade } from "./core-adapter";
