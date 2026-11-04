// release:manifest (ADR 90 point 11.2): ludiary-update.json and SHA256SUMS.txt next to the installer in dist/installer.
import { createHash } from "node:crypto";
import { readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { installerDir, version } from "./release-lib.mjs";

const v = version();
if (!/^\d+\.\d+\.\d+$/.test(v)) throw new Error(`LUDIARY_VERSION ${v} is not x.y.z`);
const name = `Ludiary-Setup-${v}.exe`;
const file = join(installerDir, name);
const bytes = readFileSync(file);
const sha256 = createHash("sha256").update(bytes).digest("hex");
const manifest = JSON.stringify({
  schema: 1,
  product: "ludiary",
  channel: "stable",
  version: v,
  publishedAt: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
  files: { "windows-x64": { name, size: statSync(file).size, sha256 } },
});
writeFileSync(join(installerDir, "ludiary-update.json"), manifest);
const sum = (f) => `${createHash("sha256").update(readFileSync(join(installerDir, f))).digest("hex")}  ${f}\n`;
writeFileSync(join(installerDir, "SHA256SUMS.txt"), sum(name) + sum("ludiary-update.json"));
console.log(`manifest for ${v}: ${name} ${sha256}`);
