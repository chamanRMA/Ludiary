import { randomBytes } from "node:crypto";
import { mkdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { openDatabase } from "@ludiary/db";
import type { RuntimeDeps } from "./deps";
import { redactHome } from "./files";

type Db = ReturnType<typeof openDatabase>;

/** Writes and reads one row; proves the packaged executable can use the database. Only for --selftest's throw-away file. */
function probeDatabase(db: Db) {
  db.exec("CREATE TABLE IF NOT EXISTS prototype_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
  db.prepare("INSERT INTO prototype_meta (key, value) VALUES ('start_count', '1') ON CONFLICT(key) DO UPDATE SET value = excluded.value").run();
  return {
    sqliteVersion: (db.prepare("SELECT sqlite_version() AS v").get() as { v: string }).v,
    journalMode: String(db.pragma("journal_mode", { simple: true })),
    foreignKeys: db.pragma("foreign_keys", { simple: true }) === 1,
  };
}

/**
 * Packaging smoke test (ADR 41, 45): proves the packaged executable can use SQLite (WAL, write, read, backup)
 * and the system credential store. Uses throw-away names and cleans up after itself.
 * The report is written to a file because the executable has no console.
 */
export async function runSelfTest(deps: RuntimeDeps, outFile: string): Promise<number> {
  const report: Record<string, unknown> = {
    version: deps.version,
    node: process.version,
    arch: process.arch,
    execPath: process.execPath,
  };
  let ok = true;
  try {
    const dir = join(deps.platform.dataDir, "selftest");
    mkdirSync(dir, { recursive: true });
    const dbFile = join(dir, `selftest-${process.pid}.db`);
    const backupFile = join(dir, `selftest-${process.pid}.backup.db`);
    const db = openDatabase(dbFile, deps.sqliteAddon);
    const probe = probeDatabase(db);
    db.exec("CREATE TABLE IF NOT EXISTS t (id INTEGER PRIMARY KEY, v TEXT)");
    db.prepare("INSERT INTO t (v) VALUES (?)").run("hello");
    const read = (db.prepare("SELECT v FROM t ORDER BY id DESC LIMIT 1").get() as { v: string }).v;
    await db.backup(backupFile);
    const backupBytes = statSync(backupFile).size;
    const copy = openDatabase(backupFile, deps.sqliteAddon);
    const copied = (copy.prepare("SELECT v FROM t ORDER BY id DESC LIMIT 1").get() as { v: string }).v;
    copy.close();
    db.close();
    rmSync(dir, { recursive: true, force: true });
    report["sqlite"] = { ...probe, read, backupBytes, backupReadable: copied === "hello" };
    ok &&= probe.journalMode === "wal" && read === "hello" && copied === "hello";
  } catch (e) {
    ok = false;
    report["sqliteError"] = String(e);
  }

  try {
    const store = deps.createKeyStore("Ludiary-selftest");
    const name = `selftest/${process.pid}`;
    const secret = randomBytes(32);
    await store.set(name, secret);
    const back = await store.get(name);
    await store.delete(name);
    const gone = await store.get(name);
    const equal = back !== null && Buffer.compare(Buffer.from(back), secret) === 0;
    report["keyring"] = { roundTrip: equal, deleted: gone === null };
    ok &&= equal && gone === null;
  } catch (e) {
    ok = false;
    report["keyringError"] = String(e);
  }

  report["ok"] = ok;
  // execPath and error messages carry the user folder in a normal install (ADR 35).
  writeFileSync(outFile, JSON.stringify(report, (_key, v: unknown) => (typeof v === "string" ? redactHome(v) : v), 2));
  return ok ? 0 : 1;
}
