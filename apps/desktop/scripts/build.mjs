// Builds the Windows distribution folder: apps/desktop/dist/app (layout of ADR 90)
//   Ludiary.exe                  stable launcher in Go (apps/desktop/launcher): runs the active version, applies updates
//   version.txt                  (not installed) read by build-installer.mjs
//   app-<version>/Ludiary.exe    Node single executable (SEA) with the esbuild bundle injected
//   app-<version>/native/*.node  native addons loaded with process.dlopen (ADR 41, 45)
//   app-<version>/bin/ludiary-tray.exe   Go helper: tray, dialogs, --registry, --pick-folder (CGO_ENABLED=0)
//   app-<version>/web/           compiled SPA (apps/web/dist) loaded into memory by the server (ADR 72)
//   app-<version>/licenses/      notices of everything shipped (ADR 34, 60)
//
// A published release (LUDIARY_RELEASE=1, ADR 90 point 11) needs LUDIARY_VERSION=X.Y.Z, no test hooks and the real public keys
// of apps/desktop/update-keys.json; otherwise it fails. Without keys a development build never applies an update.
//
// Usage: node apps/desktop/scripts/build.mjs   (needs Node 24, Go, pnpm install done)
import { build } from "esbuild";
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync, copyFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as ResEdit from "resedit";
import { inject } from "postject";
import { findLicense, findTestKey } from "./release-lib.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const desktop = resolve(here, "..");
const root = resolve(desktop, "../..");
const dist = join(desktop, "dist");
const buildDir = join(dist, "build");
const rootDir = join(dist, "app");
const version = process.env.LUDIARY_VERSION ?? JSON.parse(readFileSync(join(desktop, "package.json"), "utf8")).version + "-proto";
// The folder name must be a plain x.y.z for the stable launcher; a development build ("-proto") stays outside the updater.
const folderVersion = version.replace(/-proto$/, "");
const appDir = join(rootDir, `app-${folderVersion}`);
const release = process.env.LUDIARY_RELEASE === "1";
const COPYRIGHT = "Copyright (C) 2026 Ludiary contributors"; // GPL-3.0 section 5(d)
const SEA_FUSE = "NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2";
// LUDIARY_TEST_HOOKS=1 keeps the environment-variable test hooks (see src/main.ts). Never for a published build.
const testHooks = process.env.LUDIARY_TEST_HOOKS === "1";

// Update keys and repository (ADR 90 point 18, B4): one source for Node and Go.
const UPDATE_REPO = "chamanRMA/Ludiary";
function loadUpdateKeys() {
  // A test build may use a throwaway pair through LUDIARY_UPDATE_KEYS_FILE; release-build.mjs removes that variable.
  const file = !release && process.env.LUDIARY_UPDATE_KEYS_FILE ? process.env.LUDIARY_UPDATE_KEYS_FILE : join(desktop, "update-keys.json");
  const keys = JSON.parse(readFileSync(file, "utf8")).keys ?? {};
  for (const [id, key] of Object.entries(keys)) {
    if (!/^[A-Za-z0-9._-]{1,32}$/.test(id) || Buffer.from(key, "base64").length !== 32) throw new Error(`update key ${id} is not a raw 32-byte Ed25519 public key in base64`);
  }
  return keys;
}
const updateKeys = loadUpdateKeys();
if (release) {
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error("a release needs LUDIARY_VERSION=X.Y.Z");
  if (testHooks) throw new Error("a release cannot contain the test hooks (ADR 65)");
  if (Object.keys(updateKeys).length < 2) throw new Error("a release needs the two public keys (primary and reserve) in apps/desktop/update-keys.json (ADR 90 point 11.4)");
  if (findTestKey(updateKeys) !== null) throw new Error("the keys of the tests cannot go into a release (ADR 90 point 18, B4)");
}
// Same set for Node and Go: both are generated from this object, and the Go side is read back below.
const keysB64 = Buffer.from(JSON.stringify(updateKeys)).toString("base64");

// The Node runtime shipped inside Ludiary.exe is the node.exe running this script: pin it (ADR 39, 41).
// When bumping .node-version, also refresh licenses/node-LICENSE.txt from https://github.com/nodejs/node/blob/v<version>/LICENSE.
const expectedNode = `v${readFileSync(join(root, ".node-version"), "utf8").trim()}`;
if (process.version !== expectedNode) throw new Error(`build with Node ${expectedNode} (.node-version), not ${process.version}`);

// 0. The web, WITHOUT the simulator (ADR 72 point 7): VITE_LUDIARY_SIMULATOR must not be defined for a packaged build.
const webDir = join(root, "apps/web");
{
  const webEnv = { ...process.env };
  delete webEnv.VITE_LUDIARY_SIMULATOR;
  const pnpmJs = process.env.npm_execpath; // set when this script runs through pnpm
  if (pnpmJs && /pnpm/i.test(pnpmJs)) {
    execFileSync(process.execPath, [pnpmJs, "--filter", "@ludiary/web", "run", "build"], { cwd: root, env: webEnv, stdio: "inherit" });
  } else {
    // Same command without the pnpm wrapper (no shell is needed for a .cmd this way).
    const viteBin = join(dirname(createRequire(join(webDir, "package.json")).resolve("vite/package.json")), "bin/vite.js");
    execFileSync(process.execPath, [viteBin, "build"], { cwd: webDir, env: webEnv, stdio: "inherit" });
  }
  if (!existsSync(join(webDir, "dist/index.html"))) throw new Error("the web build did not produce apps/web/dist/index.html");
}

rmSync(dist, { recursive: true, force: true });
for (const d of [buildDir, rootDir, appDir, join(appDir, "native"), join(appDir, "bin"), join(appDir, "licenses"), join(appDir, "web")]) mkdirSync(d, { recursive: true });

// 1. Bundle (single CommonJS file, no dynamic requires of our own code: ADR 38).
const result = await build({
  absWorkingDir: root,
  entryPoints: [join(desktop, "src/main.ts")],
  outfile: join(buildDir, "ludiary.cjs"),
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node24",
  minify: false,
  sourcemap: false,
  metafile: true,
  logLevel: "warning",
  define: {
    __LUDIARY_VERSION__: JSON.stringify(version),
    __LUDIARY_TEST_HOOKS__: JSON.stringify(testHooks),
    __LUDIARY_UPDATE_KEYS__: JSON.stringify(updateKeys),
    __LUDIARY_UPDATE_REPO__: JSON.stringify(UPDATE_REPO),
  },
});
console.log(`bundle ok (test hooks ${testHooks ? "ON: not for distribution" : "off"})`);

// 2. SEA blob.
const seaConfig = join(buildDir, "sea-config.json");
writeFileSync(
  seaConfig,
  JSON.stringify({
    main: join(buildDir, "ludiary.cjs"),
    output: join(buildDir, "sea-prep.blob"),
    disableExperimentalSEAWarning: true,
    // Ignore NODE_OPTIONS: otherwise NODE_OPTIONS=--require=<file> injects code into the (signed) Ludiary.exe.
    execArgvExtension: "none",
  }),
);
execFileSync(process.execPath, ["--experimental-sea-config", seaConfig], { stdio: "inherit" });

// 3. Inject the blob into a copy of node.exe (postject/LIEF cannot re-process an exe edited by resedit).
const exePath = join(appDir, "Ludiary.exe");
copyFileSync(process.execPath, exePath);
await inject(exePath, "NODE_SEA_BLOB", readFileSync(join(buildDir, "sea-prep.blob")), { sentinelFuse: SEA_FUSE });
console.log("SEA injected:", exePath);

// 4. Patch icon, version info and GUI subsystem (no console window) AFTER injection.
function patchExe(path, strings) {
  const exe = ResEdit.NtExecutable.from(readFileSync(path), { ignoreCert: true }); // drops Node's signature (invalid after edits anyway)
  const res = ResEdit.NtExecutableResource.from(exe);
  const groups = res.entries.filter((e) => e.type === 14);
  const iconFile = ResEdit.Data.IconFile.from(readFileSync(join(desktop, "assets/ludiary.ico")));
  const group = groups[0];
  ResEdit.Resource.IconGroupEntry.replaceIconsForResource(
    res.entries,
    group ? group.id : 1,
    group ? group.lang : 1033,
    iconFile.icons.map((i) => i.data),
  );
  const vi = ResEdit.Resource.VersionInfo.fromEntries(res.entries)[0] ?? ResEdit.Resource.VersionInfo.createEmpty(); // Go binaries carry none
  const [major = 0, minor = 0, patch = 0] = version.split(/[.-]/).map((n) => Number(n) || 0);
  vi.setFileVersion(major, minor, patch, 0, 1033);
  vi.setProductVersion(major, minor, patch, 0, 1033);
  vi.setStringValues(
    { lang: 1033, codepage: 1200 },
    strings,
  );
  vi.outputToResourceEntries(res.entries);
  res.outputResource(exe);
  exe.newHeader.optionalHeader.subsystem = 2; // IMAGE_SUBSYSTEM_WINDOWS_GUI
  writeFileSync(path, Buffer.from(exe.generate()));
}
patchExe(exePath, {
  FileDescription: "Ludiary",
  ProductName: "Ludiary",
  InternalName: "Ludiary",
  OriginalFilename: "Ludiary.exe",
  LegalCopyright: `${COPYRIGHT}. GPL-3.0-only (Node.js runtime: see licenses/)`,
  CompanyName: "",
});

console.log("exe patched");

// 5. Native addons next to the executable.
const requireFromPlatform = createRequire(join(root, "packages/platform-windows/package.json"));
const keyringDir = dirname(requireFromPlatform.resolve("@napi-rs/keyring/package.json"));
const keyringWin = dirname(createRequire(join(keyringDir, "package.json")).resolve("@napi-rs/keyring-win32-x64-msvc/package.json"));
const sqliteDir = dirname(createRequire(join(root, "packages/db/package.json")).resolve("better-sqlite3/package.json"));
copyFileSync(join(sqliteDir, "prebuilds/win32-x64.node"), join(appDir, "native/better_sqlite3.node"));
const keyringNode = readdirSync(keyringWin).find((f) => f.endsWith(".node"));
copyFileSync(join(keyringWin, keyringNode), join(appDir, "native/keyring.win32-x64-msvc.node"));

// 5b. The compiled web next to the executable (not inside the SEA: ADR 72 point 9).
cpSync(join(webDir, "dist"), join(appDir, "web"), { recursive: true });

// 6. Go tray helper, no CGO.
const goEnv = { ...process.env, CGO_ENABLED: "0", GOOS: "windows", GOARCH: "amd64" };
const trayDir = join(desktop, "tray-helper");
execFileSync("go", ["build", "-trimpath", "-ldflags", "-H=windowsgui -s -w", "-o", join(appDir, "bin/ludiary-tray.exe"), "."], { cwd: trayDir, env: goEnv, stdio: "inherit" });

// 6b. The stable launcher (ADR 90): Go, standard library only, with the public keys inside. The test variant adds the data-folder hook.
const launcherDir = join(desktop, "launcher");
const launcherMessages = JSON.parse(readFileSync(join(launcherDir, "messages.json"), "utf8"));
{
  // Invariant 6 (ADR 90 point 18, B5): the build fails if a message is missing in a language.
  const all = new Set(Object.values(launcherMessages).flatMap((m) => Object.keys(m)));
  const missing = Object.entries(launcherMessages).flatMap(([lang, m]) => [...all].filter((k) => !m[k]).map((k) => `${lang}.${k}`));
  if (missing.length || Object.keys(launcherMessages).length < 2) throw new Error(`launcher/messages.json is missing: ${missing.join(", ")}`);
}
const launcherExe = join(rootDir, "Ludiary.exe");
execFileSync(
  "go",
  ["build", "-trimpath", ...(testHooks ? ["-tags", "ludiarytest"] : []), "-ldflags", `-H=windowsgui -s -w -X main.keysB64=${keysB64}`, "-o", launcherExe, "."],
  { cwd: launcherDir, env: goEnv, stdio: "inherit" },
);
patchExe(launcherExe, { FileDescription: "Ludiary", ProductName: "Ludiary", InternalName: "Ludiary", OriginalFilename: "Ludiary.exe", LegalCopyright: `${COPYRIGHT}. GPL-3.0-only`, CompanyName: "" });
// Both lists come from the same JSON; this proves the Go binary got the same set (the string is baked in as text).
if (!readFileSync(launcherExe).includes(Buffer.from(keysB64))) throw new Error("the launcher does not carry the update keys");
console.log(`launcher ok (${Object.keys(updateKeys).length} update keys)`);

// 7. Notices: every bundled npm package, native addon, Go module and the Node runtime.
const lines = ["Ludiary third-party notices (generated by apps/desktop/scripts/build.mjs)", ""];
const seen = new Set();
const missingLicenses = [];
const licenseText = (dir, name) => {
  const file = findLicense(dir, name);
  if (!file) missingLicenses.push(name);
  return file ? readFileSync(file, "utf8").trim() : "";
};
const addPackage = (dir, label) => {
  const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
  const key = `${pkg.name}@${pkg.version}`;
  if (seen.has(key)) return;
  seen.add(key);
  lines.push("=".repeat(70), `${label}${key}  [${typeof pkg.license === "string" ? pkg.license : JSON.stringify(pkg.license)}]`, "", licenseText(dir, pkg.name), "");
};
for (const input of Object.keys(result.metafile.inputs)) {
  const m = input.replaceAll("\\", "/").match(/^(.*node_modules\/(?:@[^/]+\/)?[^/]+)\//);
  if (m) addPackage(resolve(root, m[1]), "npm: ");
}
// Production dependencies of the web that end up in its bundle (ADR 72, 70): the closure of `dependencies`, which can
// only over-report, plus the OFL-1.1 font packages with their LICENSE.
{
  const findPackage = (name, fromDir) => {
    for (let dir = realpathSync(fromDir); ; dir = dirname(dir)) {
      const candidate = join(dir, "node_modules", name);
      if (existsSync(join(candidate, "package.json"))) return realpathSync(candidate);
      if (dirname(dir) === dir) throw new Error(`cannot find ${name} from ${fromDir}`);
    }
  };
  const visited = new Set();
  const walk = (dir) => {
    const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
    for (const dep of Object.keys(pkg.dependencies ?? {})) {
      if (dep.startsWith("@ludiary/")) continue; // our own code: api-contract and i18n are types and catalogs
      const depDir = findPackage(dep, dir);
      if (visited.has(depDir)) continue;
      visited.add(depDir);
      addPackage(depDir, "web: ");
      walk(depDir);
    }
  };
  walk(webDir);
}
addPackage(sqliteDir, "native: ");
addPackage(keyringDir, "native: ");
addPackage(keyringWin, "native: ");
const goMods = execFileSync("go", ["list", "-deps", "-f", "{{with .Module}}{{.Path}} {{.Version}} {{.Dir}}{{end}}"], { cwd: trayDir, env: goEnv, encoding: "utf8" })
  .split("\n").map((l) => l.trim()).filter(Boolean);
const goSeen = new Set();
// Modules replaced by a copy under tray-helper/third_party.
const patched = (dir) => (dir.startsWith(trayDir) ? ` (patched copy, see ${relative(root, dir).replaceAll("\\", "/")}/PATCHED.md)` : "");
for (const l of goMods) {
  const [path, ver, ...rest] = l.split(" ");
  const dir = rest.join(" ");
  if (goSeen.has(path) || !dir || path === "github.com/ludiary/tray-helper") continue;
  goSeen.add(path);
  lines.push("=".repeat(70), `go: ${path}@${ver}${patched(dir)}`, "", licenseText(dir, path), "");
}
// Licenses that live in a subpackage of a module (e.g. go-webview2/webviewloader is ISC, the module is MIT) or notices
// shipped next to the code (NOTICE*): collect them too, from the packages that are actually linked.
const pkgDirs = execFileSync("go", ["list", "-deps", "-f", "{{.ImportPath}} {{.Dir}}	{{with .Module}}{{.Path}} {{.Dir}}{{end}}"], { cwd: trayDir, env: goEnv, encoding: "utf8" })
  .split("\n").map((l) => l.trim()).filter(Boolean);
const subSeen = new Set();
for (const l of pkgDirs) {
  const [pkgPart, modPart = ""] = l.split("	");
  const modDir = modPart.slice(modPart.indexOf(" ") + 1);
  const pkgDir = pkgPart.slice(pkgPart.indexOf(" ") + 1);
  if (!modDir) continue; // standard library: no module
  if (!pkgDir || pkgDir === modDir || !pkgDir.startsWith(modDir) || modPart.startsWith("github.com/ludiary/tray-helper")) continue;
  for (const f of readdirSync(pkgDir).filter((n) => /^(licen[sc]e|copying|notice)/i.test(n))) {
    const full = join(pkgDir, f);
    if (subSeen.has(full)) continue;
    subSeen.add(full);
    lines.push("=".repeat(70), `go: ${pkgPart.split(" ")[0]} (${f})${patched(modDir)}`, "", readFileSync(full, "utf8").trim(), "");
  }
}
// The Go standard library is linked into ludiary-tray.exe but has no module, so `go list` above skips it.
const goRoot = execFileSync("go", ["env", "GOROOT"], { env: goEnv, encoding: "utf8" }).trim();
const goVersion = execFileSync("go", ["env", "GOVERSION"], { env: goEnv, encoding: "utf8" }).trim();
lines.push("=".repeat(70), `go: standard library ${goVersion} (linked into bin/ludiary-tray.exe and Ludiary.exe, the stable launcher)`, "", readFileSync(join(goRoot, "LICENSE"), "utf8").trim(), "");
// The Windows MSI of Node does not ship its LICENSE, so the text for the pinned version (.node-version) is kept in the repo.
const nodeLicense = join(desktop, "licenses/node-LICENSE.txt");
if (!existsSync(nodeLicense)) throw new Error(`${nodeLicense} is missing: the notices would be incomplete`);
lines.push("=".repeat(70), `Node.js runtime ${process.version} (embedded in Ludiary.exe)`, "", readFileSync(nodeLicense, "utf8").trim(), "");
if (missingLicenses.length) throw new Error(`no license text for: ${missingLicenses.join(", ")}. Keep it in apps/desktop/licenses/<name>-LICENSE.txt`);
writeFileSync(join(appDir, "licenses/THIRD-PARTY-NOTICES.txt"), lines.join("\n"));
// GPL-3.0 requires the license text to travel with the binary (ADR 34).
copyFileSync(join(root, "LICENSE"), join(appDir, "licenses/LICENSE.txt"));
// Settings > About links to these exact texts: everything in web/ is served from memory (ADR 72 point 6).
cpSync(join(appDir, "licenses"), join(appDir, "web/licenses"), { recursive: true });
writeFileSync(join(appDir, "version.txt"), version);
writeFileSync(join(rootDir, "version.txt"), version); // for build-installer.mjs; the installer does not copy it
console.log("build done:", rootDir);
