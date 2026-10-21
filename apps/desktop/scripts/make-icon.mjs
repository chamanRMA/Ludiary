// Generates the app icons from assets/logo.svg: assets/ludiary.ico (exe, shortcut, installer) and
// tray-helper/icon.png (tray). Run after changing the logo: node apps/desktop/scripts/make-icon.mjs
// The output is committed; @resvg/resvg-js is a dev dependency only and never ships with the app.
//   node scripts/make-icon.mjs --preview <file.png>   also writes a sheet with every size, for review.
import { Resvg } from "@resvg/resvg-js";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const desktop = join(here, "..");

/** Dark rounded square so the cream logo stays visible on light taskbars and Explorer (light theme). */
const BACKGROUND = "#1E2633";
/** Every size Windows asks an .ico for (100 % to 200 % DPI, Explorer views, Start menu). */
const ICO_SIZES = [16, 20, 24, 32, 40, 48, 64, 96, 128, 256];
/** Windows scales the tray PNG to the small-icon size (16 px at 100 %, 32 px at 200 %): 32 px downsizes cleanly. */
const TRAY_SIZE = 32;

const logo = readFileSync(join(desktop, "assets/logo.svg"), "utf8");
const viewBox = logo.match(/viewBox="([\d.\s-]+)"/)?.[1].trim().split(/\s+/).map(Number);
const path = logo.match(/<path[\s\S]*?\/>/)?.[0];
if (!viewBox || viewBox.length !== 4 || !path) throw new Error("assets/logo.svg: expected a viewBox and one <path>");
const [, , vw, vh] = viewBox;

function iconSvg(size) {
  // Small sizes lose detail: give the logo more of the square there.
  const fill = size <= 24 ? 0.94 : size <= 48 ? 0.86 : 0.8;
  const radius = size * (size <= 24 ? 0.18 : 0.22);
  const scale = (size * fill) / Math.max(vw, vh);
  const dx = (size - vw * scale) / 2;
  const dy = (size - vh * scale) / 2;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">` +
    `<rect width="${size}" height="${size}" rx="${radius}" fill="${BACKGROUND}"/>` +
    `<g transform="translate(${dx} ${dy}) scale(${scale})">${path}</g></svg>`
  );
}

const render = (size) => Buffer.from(new Resvg(iconSvg(size), { fitTo: { mode: "width", value: size } }).render().asPng());

// ICO container with one PNG-compressed image per size (supported since Windows Vista).
const images = ICO_SIZES.map((size) => ({ size, png: render(size) }));
const header = Buffer.alloc(6);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(images.length, 4);
let offset = 6 + 16 * images.length;
const entries = images.map(({ size, png }) => {
  const e = Buffer.alloc(16);
  e[0] = size === 256 ? 0 : size; // 0 means 256
  e[1] = size === 256 ? 0 : size;
  e.writeUInt16LE(1, 4); // planes
  e.writeUInt16LE(32, 6); // bits per pixel
  e.writeUInt32LE(png.length, 8);
  e.writeUInt32LE(offset, 12);
  offset += png.length;
  return e;
});
const ico = Buffer.concat([header, ...entries, ...images.map((i) => i.png)]);
writeFileSync(join(desktop, "assets/ludiary.ico"), ico);
writeFileSync(join(desktop, "tray-helper/icon.png"), render(TRAY_SIZE));
console.log(`ludiary.ico: ${images.length} sizes, ${ico.length} bytes; tray icon.png: ${TRAY_SIZE} px`);

const previewAt = process.argv.indexOf("--preview");
if (previewAt >= 0) {
  // Each size at its real pixel size, on a light and on a dark strip, like a taskbar in either theme.
  const gap = 16;
  const width = ICO_SIZES.reduce((w, s) => w + s + gap, gap);
  const height = 2 * (256 + 2 * gap);
  let x = gap;
  const tiles = ICO_SIZES.map((s) => {
    const tile = (y) => `<image x="${x}" y="${y + (256 - s)}" width="${s}" height="${s}" href="data:image/png;base64,${render(s).toString("base64")}"/>`;
    const out = tile(gap) + tile(256 + 3 * gap);
    x += s + gap;
    return out;
  }).join("");
  const sheet =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">` +
    `<rect width="${width}" height="${height / 2}" fill="#F3F3F3"/><rect y="${height / 2}" width="${width}" height="${height / 2}" fill="#202020"/>${tiles}</svg>`;
  writeFileSync(process.argv[previewAt + 1], Buffer.from(new Resvg(sheet).render().asPng()));
  console.log("preview written to", process.argv[previewAt + 1]);
}
