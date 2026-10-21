// Generates the placeholder icon (PNG for the tray, ICO for the exe/shortcut) without dependencies.
// Run once: node apps/desktop/scripts/make-icon.mjs. The output is committed (small binary files).
import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const SIZE = 256;

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

// Rounded square with a vertical gradient and a white "L".
const px = Buffer.alloc(SIZE * SIZE * 4);
const r = 48;
for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    const dx = Math.max(r - x, 0, x - (SIZE - 1 - r));
    const dy = Math.max(r - y, 0, y - (SIZE - 1 - r));
    const inside = dx * dx + dy * dy <= r * r;
    const o = (y * SIZE + x) * 4;
    if (!inside) continue;
    const t = y / SIZE;
    let [R, G, B] = [Math.round(88 - 40 * t), Math.round(80 - 30 * t), Math.round(220 - 60 * t)];
    const inL = (x >= 84 && x < 124 && y >= 56 && y < 200) || (x >= 84 && x < 184 && y >= 160 && y < 200);
    if (inL) [R, G, B] = [255, 255, 255];
    px[o] = R; px[o + 1] = G; px[o + 2] = B; px[o + 3] = 255;
  }
}
const raw = Buffer.alloc((SIZE * 4 + 1) * SIZE);
for (let y = 0; y < SIZE; y++) {
  raw[y * (SIZE * 4 + 1)] = 0;
  px.copy(raw, y * (SIZE * 4 + 1) + 1, y * SIZE * 4, (y + 1) * SIZE * 4);
}
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0); ihdr.writeUInt32BE(SIZE, 4); ihdr[8] = 8; ihdr[9] = 6;
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0)),
]);

// ICO container with a single PNG-compressed 256x256 image (supported since Windows Vista).
const header = Buffer.alloc(6); header.writeUInt16LE(1, 2); header.writeUInt16LE(1, 4);
const entry = Buffer.alloc(16);
entry[0] = 0; entry[1] = 0; // 0 means 256
entry.writeUInt16LE(1, 4); entry.writeUInt16LE(32, 6);
entry.writeUInt32LE(png.length, 8); entry.writeUInt32LE(22, 12);

writeFileSync(join(here, "../tray-helper/icon.png"), png);
writeFileSync(join(here, "../assets/ludiary.ico"), Buffer.concat([header, entry, png]));
console.log("icon written", png.length, "bytes");
