// ADR 92 points 2 and 3: the single text file of "Export logs". Only an allow-list of files, always filtered again.
import { lstatSync, fstatSync, openSync, closeSync, readSync, readdirSync } from "node:fs";
import { arch, release, version as osVersion } from "node:os";
import { join } from "node:path";
import type { StoreStatus } from "@ludiary/core";
import { redactHome } from "./files";
import type { UpdateStatus } from "./updates/service";
import { compareVersions, isVersion } from "./updates/version";

export const MAX_FILE_BYTES = 2 * 1024 * 1024;
export const MAX_TOTAL_BYTES = 16 * 1024 * 1024;
const LOG_NAME = /^[a-z0-9-]+\.log(\.1)?$/;

export interface LogExportOptions {
  dataDir: string;
  version: string;
  locale: string;
  stores: () => Promise<readonly StoreStatus[]>;
  updates?: () => Promise<UpdateStatus>;
  now?: () => number;
  redact?: (text: string) => string;
}

/** True for a real folder: a link or junction (lstat reports it as a link) is skipped, so nothing outside the data folder is read. */
function isRealDir(path: string): boolean {
  try {
    return lstatSync(path).isDirectory();
  } catch {
    return false;
  }
}

/**
 * Last `max` bytes of a regular, unlinked file, and whether something was left out (then the partial first line is dropped).
 * Throws on any read error. After opening, the handle must be the file that lstat saw (no swap) with a single hard link.
 */
function readTail(path: string, max: number): { text: string; cut: boolean } {
  const st = lstatSync(path);
  if (!st.isFile()) throw new Error("not a file");
  const fd = openSync(path, "r");
  try {
    const f = fstatSync(fd);
    if (!f.isFile() || f.nlink !== 1 || f.ino !== st.ino || f.dev !== st.dev) throw new Error("not the same file");
    const len = Math.min(f.size, max);
    const buf = Buffer.alloc(len);
    let got = 0;
    while (got < len) {
      const n = readSync(fd, buf, got, len - got, f.size - len + got);
      if (n === 0) break;
      got += n;
    }
    const cut = f.size > max;
    let text = buf.subarray(0, got).toString("utf8");
    if (cut) text = text.slice(text.indexOf("\n") + 1 || text.length); // the first line is usually cut in the middle: it could hide part of a path
    return { text, cut };
  } finally {
    closeSync(fd);
  }
}

/** Allowed files as [relative title, absolute path]: the rotated file first, then the current one. */
function allowedFiles(dataDir: string): [string, string][] {
  const out: [string, string][] = [];
  if (isRealDir(join(dataDir, "logs"))) try {
    const names = readdirSync(join(dataDir, "logs"), { withFileTypes: true })
      .filter((d) => d.isFile() && LOG_NAME.test(d.name))
      .map((d) => d.name);
    const key = (n: string) => n.replace(/\.1$/, "");
    names.sort((a, b) => (key(a) === key(b) ? (a.endsWith(".1") ? -1 : 1) : key(a) < key(b) ? -1 : 1));
    for (const n of names) out.push([`logs/${n}`, join(dataDir, "logs", n)]);
  } catch {
    /* no logs folder yet */
  }
  if (isRealDir(join(dataDir, "updates"))) try {
    const versions = readdirSync(join(dataDir, "updates"), { withFileTypes: true })
      .filter((d) => d.isDirectory() && isVersion(d.name))
      .map((d) => d.name)
      .sort(compareVersions);
    for (const v of versions) {
      const p = join(dataDir, "updates", v, "install.log");
      if (!isRealDir(join(dataDir, "updates", v))) continue;
      try {
        if (lstatSync(p).isFile()) out.push([`updates/${v}/install.log`, p]);
      } catch {
        /* this version has no install log */
      }
    }
  } catch {
    /* no updates folder */
  }
  return out;
}

async function header(o: LogExportOptions, at: Date): Promise<string> {
  const lines = [`Ludiary ${o.version}`, `OS: ${osVersion()} ${release()} ${arch()}`, `Node: ${process.version}`, `Locale: ${o.locale}`, `Generated: ${at.toISOString()}`];
  try {
    const u = await o.updates?.();
    if (u) lines.push(`Updater: mode=${u.mode} state=${u.state} current=${u.current} latest=${u.latest ?? "-"} error=${u.error ?? "-"}`);
  } catch {
    lines.push("Updater: unavailable");
  }
  try {
    // Never accountLabel or any account name (ADR 92 point 2).
    for (const s of await o.stores()) {
      lines.push(`Store ${s.store}: connection=${s.connection} mode=${s.mode}`);
      for (const r of s.sync) {
        const last = r.lastAttemptAt === null ? "-" : new Date(r.lastAttemptAt).toISOString();
        lines.push(`  ${r.operation}: status=${r.status} last=${last} error=${r.error?.code ?? "-"}`);
      }
    }
  } catch {
    lines.push("Stores: unavailable");
  }
  return lines.join("\n");
}

const pad = (n: number) => String(n).padStart(2, "0");

export function createLogExporter(o: LogExportOptions): () => Promise<{ filename: string; body: string }> {
  const redact = o.redact ?? redactHome;
  return async () => {
    const at = new Date((o.now ?? Date.now)());
    const stamp = `${at.getUTCFullYear()}${pad(at.getUTCMonth() + 1)}${pad(at.getUTCDate())}-${pad(at.getUTCHours())}${pad(at.getUTCMinutes())}${pad(at.getUTCSeconds())}`;
    const parts = [redact(await header(o, at))];
    let left = MAX_TOTAL_BYTES;
    for (const [title, path] of allowedFiles(o.dataDir)) {
      let section = `===== ${title} =====\n`;
      if (left <= 0) {
        parts.push(`${section}[truncated]`);
        continue;
      }
      try {
        const { text, cut } = readTail(path, Math.min(MAX_FILE_BYTES, left));
        let body = redact(text);
        let truncated = cut;
        if (Buffer.byteLength(body) > left) {
          body = Buffer.from(body).subarray(-left).toString("utf8");
          truncated = true;
        }
        left -= Buffer.byteLength(body);
        section += `${truncated ? "[truncated]\n" : ""}${body}`;
      } catch {
        section += "unreadable"; // no path and no system message (ADR 92 point 2)
      }
      parts.push(section);
    }
    return { filename: `ludiary-logs-${o.version}-${stamp}.txt`, body: `${parts.join("\n\n")}\n` };
  };
}
