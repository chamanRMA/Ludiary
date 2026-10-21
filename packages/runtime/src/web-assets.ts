import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { WebAssets } from "@ludiary/api";
import type { Logger } from "./files";

/** Closed table of types by extension (ADR 72 point 6). Anything else in web/ is not served. */
export const MIME_TYPES: Readonly<Record<string, string>> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
};

/** Safety caps: the whole SPA, fonts included, is a few MB (ADR 72). */
export const MAX_WEB_FILES = 2_000;
export const MAX_WEB_BYTES = 64 * 1024 * 1024;
const MAX_DEPTH = 8;

const extensionOf = (name: string): string => {
  const dot = name.lastIndexOf(".");
  return dot < 0 ? "" : name.slice(dot).toLowerCase();
};

/**
 * Reads the `web/` folder once, at startup, into memory (ADR 72 point 6): URL path -> body, type and cache policy.
 * Only regular files are read (links are skipped); only files in the map are ever served, so no request can reach the
 * disk. A missing or empty folder gives an empty map: the server still starts and `/` explains the reinstall.
 */
export function loadWebAssets(dir: string | undefined, log: Logger): WebAssets {
  const assets = new Map<string, { body: Buffer; type: string; immutable: boolean }>();
  if (!dir) {
    log("error", "web folder not configured; the interface will not be served");
    return assets;
  }
  let totalBytes = 0;
  const walk = (folder: string, urlPrefix: string, depth: number): void => {
    for (const entry of readdirSync(folder, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) continue;
      const url = `${urlPrefix}/${entry.name}`;
      if (entry.isDirectory()) {
        if (depth < MAX_DEPTH) walk(join(folder, entry.name), url, depth + 1);
        continue;
      }
      if (!entry.isFile()) continue;
      const type = MIME_TYPES[extensionOf(entry.name)];
      if (!type) {
        log("warn", `web file with an unknown extension is not served: ${url}`);
        continue;
      }
      const file = join(folder, entry.name);
      const size = statSync(file).size;
      if (assets.size >= MAX_WEB_FILES || totalBytes + size > MAX_WEB_BYTES) throw new Error("web folder is too large");
      totalBytes += size;
      assets.set(url, { body: readFileSync(file), type, immutable: url.startsWith("/assets/") });
    }
  };
  try {
    walk(dir, "", 0);
  } catch (e) {
    log("error", `could not read the web folder: ${(e as Error).message}`);
    return new Map();
  }
  if (!assets.has("/index.html")) {
    log("error", "web folder has no index.html; the interface will not be served");
    return new Map();
  }
  log("info", `web interface loaded: ${assets.size} files, ${totalBytes} bytes`);
  return assets;
}
