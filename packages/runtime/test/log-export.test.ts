import { linkSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { tempDir } from "../../db/test/backup-fixtures";
import { createLogExporter, MAX_FILE_BYTES } from "../src/log-export";

let dir = "";
beforeEach(() => {
  dir = tempDir();
  mkdirSync(join(dir, "logs"), { recursive: true });
  mkdirSync(join(dir, "updates", "0.3.0"), { recursive: true });
  mkdirSync(join(dir, "updates", "junk"), { recursive: true });
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const exporter = (over: Partial<Parameters<typeof createLogExporter>[0]> = {}) =>
  createLogExporter({ dataDir: dir, version: "0.2.0", locale: "es", stores: async () => [], now: () => Date.UTC(2026, 10, 5, 1, 2, 3), redact: (t) => t.replaceAll("SECRETHOME", "~"), ...over });

describe("log export (ADR 92)", () => {
  it("includes only the allowed files, rotated first", async () => {
    for (const f of ["logs/server.log", "logs/server.log.1", "logs/crash.log", "logs/notes.txt", "logs/Bad.log", "runtime.json", "state.json", "versions.json", "updates/0.3.0/install.log", "updates/junk/install.log", "updates/0.3.0/other.txt"])
      writeFileSync(join(dir, f), `content of ${f}`);
    const { filename, body } = await exporter()();
    expect(filename).toBe("ludiary-logs-0.2.0-20261105-010203.txt");
    const titles = [...body.matchAll(/^===== (.+) =====$/gm)].map((m) => m[1]);
    expect(titles).toEqual(["logs/crash.log", "logs/server.log.1", "logs/server.log", "updates/0.3.0/install.log"]);
    expect(body).not.toContain("runtime.json");
    expect(body).not.toContain(dir);
  });

  it("filters the home folder again, including install.log", async () => {
    writeFileSync(join(dir, "updates", "0.3.0", "install.log"), "path SECRETHOME\\AppData ok");
    const { body } = await exporter()();
    expect(body).toContain("path ~\\AppData ok");
    expect(body).not.toContain("SECRETHOME");
  });

  it("keeps the last 2 MiB of a file and says so", async () => {
    writeFileSync(join(dir, "logs", "server.log"), `${"a".repeat(MAX_FILE_BYTES)}\n${"b".repeat(100)}`);
    const { body } = await exporter()();
    expect(body).toContain("[truncated]");
    expect(body).not.toContain("aaaa");
    expect(body).toContain("b".repeat(100));
  });

  it("stops at the 16 MiB total with [truncated]", async () => {
    for (let i = 0; i < 10; i++) writeFileSync(join(dir, "logs", `f${i}.log`), "x".repeat(MAX_FILE_BYTES));
    const { body } = await exporter()();
    expect(Buffer.byteLength(body)).toBeLessThan(16 * 1024 * 1024 + 4096);
    expect(body.match(/\[truncated\]/g)!.length).toBeGreaterThan(0);
    expect(body).toContain("===== logs/f9.log =====");
  });

  it("an unreadable file (here a hard-linked one) gives the code only, with no path", async () => {
    const outside = join(dir, "outside.txt");
    writeFileSync(outside, "secret");
    linkSync(outside, join(dir, "logs", "a.log"));
    const { body } = await exporter()();
    expect(body).toContain("===== logs/a.log =====\nunreadable");
    expect(body).not.toContain("secret");
  });

  it("does not follow a junction used as logs/ or as a version folder", async () => {
    const other = join(dir, "other");
    mkdirSync(other);
    writeFileSync(join(other, "server.log"), "leaked");
    writeFileSync(join(other, "install.log"), "leaked");
    rmSync(join(dir, "logs"), { recursive: true });
    symlinkSync(other, join(dir, "logs"), "junction");
    rmSync(join(dir, "updates", "0.3.0"), { recursive: true });
    symlinkSync(other, join(dir, "updates", "0.3.0"), "junction");
    const { body } = await exporter()();
    expect(body).not.toContain("leaked");
    expect(body).not.toContain("=====");
  });

  it("drops the half line at the start of a cut file", async () => {
    writeFileSync(join(dir, "logs", "server.log"), `${"a".repeat(MAX_FILE_BYTES)}\nlast line\n`);
    const { body } = await exporter()();
    expect(body).toContain("[truncated]\nlast line");
    expect(body).not.toContain("aaaa");
  });

  it("the header has no accountLabel and no absolute paths", async () => {
    writeFileSync(join(dir, "logs", "server.log"), "x");
    const { body } = await exporter({
      stores: async () => [{ store: "steam", access: "official-api", connection: "connected", mode: "library", accountLabel: "Jane Doe", sync: [{ store: "steam", operation: "library", lastAttemptAt: 5, lastSuccessAt: null, status: "error", error: { code: "auth", key: "k" } as never, nextAllowedAt: null }] }],
      updates: async () => ({ mode: "notify", current: "0.2.0", state: "rolled-back", error: "code-1" }),
    })();
    const head = body.split("=====")[0]!;
    expect(head).toContain("Store steam: connection=connected");
    expect(head).toContain("error=auth");
    expect(head).toContain("state=rolled-back");
    expect(head).not.toContain("Jane");
    expect(head).not.toContain(homedir());
    expect(head).not.toContain(dir);
  });
});
