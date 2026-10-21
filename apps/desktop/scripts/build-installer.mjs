// Compiles the Inno Setup installer from apps/desktop/dist/app (run build.mjs first).
// Finds ISCC.exe via ISCC_PATH, PATH or the usual install folders (per-user winget install included).
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const desktop = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceDir = join(desktop, "dist/app");
const outputDir = join(desktop, "dist/installer");
if (!existsSync(join(sourceDir, "Ludiary.exe"))) throw new Error("dist/app is missing: run `pnpm build:desktop` first");

const candidates = [
  process.env.ISCC_PATH,
  join(process.env.LOCALAPPDATA ?? "", "Programs/Inno Setup 6/ISCC.exe"),
  join(process.env["ProgramFiles(x86)"] ?? "", "Inno Setup 6/ISCC.exe"),
  join(process.env.ProgramFiles ?? "", "Inno Setup 6/ISCC.exe"),
].filter(Boolean);
const iscc = candidates.find((p) => existsSync(p)) ?? "ISCC.exe";

// Invariant 6 / ADR 45: every installer text must exist in every language of messages.iss.
{
  const keys = {};
  for (const line of readFileSync(join(desktop, "installer/messages.iss"), "utf8").split(/\r?\n/)) {
    const m = line.match(/^(\w+)\.(\w+)=/);
    if (m) (keys[m[1]] ??= new Set()).add(m[2]);
  }
  const langs = Object.keys(keys);
  const all = new Set(langs.flatMap((l) => [...keys[l]]));
  const missing = langs.flatMap((l) => [...all].filter((k) => !keys[l].has(k)).map((k) => `${l}.${k}`));
  if (langs.length < 2 || missing.length) throw new Error(`installer/messages.iss is missing: ${missing.join(", ") || "a language"}`);
}

const version = readFileSync(join(sourceDir, "version.txt"), "utf8").trim();
mkdirSync(outputDir, { recursive: true });
execFileSync(iscc, [`/DAppVersion=${version}`, `/DSourceDir=${sourceDir}`, `/DOutputDir=${outputDir}`, join(desktop, "installer/ludiary.iss")], {
  stdio: "inherit",
});
console.log("installer in", outputDir);
