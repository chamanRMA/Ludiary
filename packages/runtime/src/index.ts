import type { RuntimeDeps } from "./deps";
import { runLauncher, runPurge, runStop } from "./launcher";
import { runSelfTest } from "./selftest";
import { runServer } from "./server-role";
import { runRollbackUpdate } from "./updates/apply";
import { isVersion } from "./updates/version";

export { APP_ID, type RuntimeDeps } from "./deps";
export type { SqliteAddon } from "@ludiary/db";
export { createFileLogger, redactHome } from "./files";
export type { UpdatePlatform, UpdateConfig } from "./deps";
export type { UpdateKeys } from "./updates/manifest";

/**
 * Same executable, several roles (ADR 45):
 *   (no flag)  shortcut: reuse or start the server, open the browser
 *   --server   background server with tray
 *   --stop     ask the live server to stop (installer)
 *   --after-restart   shortcut role after a restoration: waits for the old server to leave (ADR 89)
 *   --from-launcher   added by the stable launcher; only then may an update be applied (ADR 90, exit code 20)
 *   --trial    first start of a new version: no dialogs, proves its own server answers with this version
 *   --rollback-update [--rollback-code=N]   puts the database copy back after a failed update
 *   --no-open  start or confirm without opening the browser
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
  if (argv.includes("--rollback-update")) {
    const code = Number(/^--rollback-code=(\d{1,3})$/.exec(argv.find((a) => a.startsWith("--rollback-code=")) ?? "")?.[1] ?? 1);
    const val = (n: string) => argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3);
    const [from, to] = [val("rollback-from"), val("rollback-to")];
    return runRollbackUpdate(deps, code, isVersion(from) && isVersion(to) ? { from, to } : null);
  }
  return runLauncher(deps, {
    afterRestart: argv.includes("--after-restart"),
    fromLauncher: argv.includes("--from-launcher"),
    trial: argv.includes("--trial"),
    noOpen: argv.includes("--no-open"),
  });
}
export { loadWebAssets, MIME_TYPES } from "./web-assets";
export { createCoreFacade } from "./core-adapter";
