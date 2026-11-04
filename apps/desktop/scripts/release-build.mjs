// release:build (ADR 90 point 11.2): the published build. No test hooks, version from apps/desktop/package.json (the tag is v<it>),
// the public keys and the repository embedded. build.mjs refuses test keys, fewer than two keys, or a version that is not x.y.z.
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { desktop, version } from "./release-lib.mjs";

const env = { ...process.env, LUDIARY_RELEASE: "1", LUDIARY_VERSION: version() };
delete env.LUDIARY_TEST_HOOKS;
delete env.LUDIARY_UPDATE_KEYS_FILE; // a published build always embeds the keys of the repository
for (const script of ["build.mjs", "build-installer.mjs"]) execFileSync(process.execPath, [join(desktop, "scripts", script)], { env, stdio: "inherit" });
