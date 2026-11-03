// ADR 89 point 16, H3 (audit of the code): the raw move of M3 and its roll back, and step B, survive a cut or a failure at any point.
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fault = vi.hoisted(() => ({ fn: null as null | ((op: "write" | "rename", from: string, to?: string) => boolean) }));
vi.mock("node:fs", async (original) => {
  const real = await original<typeof import("node:fs")>();
  return {
    ...real,
    writeFileSync: (...args: Parameters<typeof real.writeFileSync>) => {
      if (fault.fn?.("write", String(args[0]))) throw new Error("injected write failure");
      return real.writeFileSync(...args);
    },
    renameSync: (from: Parameters<typeof real.renameSync>[0], to: Parameters<typeof real.renameSync>[1]) => {
      if (fault.fn?.("rename", String(from), String(to))) throw new Error("injected rename failure");
      return real.renameSync(from, to);
    },
  };
});

import { applyPendingRestoreSwap, createBackupStore, readPendingRestore, rollBackRestore, SwapError, userBackupName, type PendingRestore } from "../src";
import { makeLudiaryDb, tempDir } from "./backup-fixtures";

let dir = "";
let dataDir = "";
let userDir = "";
const NOW = Date.UTC(2026, 10, 4, 12);
const ID = userBackupName(NOW - 1000, "bbbbbbbb", "manual");
const RAW = `pre-restore-${String(NOW).padStart(15, "0")}-raw`;
const garbage = "garbage, not sqlite".repeat(20);
const rawDir = () => join(dataDir, "backups", RAW);
const read = (f: string) => readFileSync(join(dataDir, f), "utf8");

beforeEach(async () => {
  dir = tempDir();
  dataDir = join(dir, "data");
  userDir = join(dir, "Copias");
  mkdirSync(dataDir, { recursive: true });
  mkdirSync(userDir, { recursive: true });
  await makeLudiaryDb(join(userDir, ID), { marker: "restored" });
});
afterEach(() => {
  fault.fn = null;
  rmSync(dir, { recursive: true, force: true });
});

async function prepare(): Promise<PendingRestore> {
  await createBackupStore({ db: undefined as never, dataDir, internalDir: join(dataDir, "backups"), addon: undefined }).prepareRestore(userDir, ID, NOW);
  const r = readPendingRestore(dataDir);
  if (r.kind !== "pending") throw new Error("not pending");
  return r.state;
}
function brokenCurrent(): void {
  writeFileSync(join(dataDir, "ludiary.db"), garbage);
  writeFileSync(join(dataDir, "ludiary.db-wal"), "wal");
  writeFileSync(join(dataDir, "ludiary.db-shm"), "shm");
}
/** A failed open already removed the -wal and -shm of a broken database; put them back right before the raw move. */
const plantWal = () => {
  writeFileSync(join(dataDir, "ludiary.db-wal"), "wal");
  writeFileSync(join(dataDir, "ludiary.db-shm"), "shm");
};
const swap = (state: PendingRestore) => applyPendingRestoreSwap(dataDir, undefined, state, NOW);

describe("raw move (M3)", () => {
  it("a failure in the middle of the move gives back what was already moved and drops the restoration", async () => {
    brokenCurrent();
    const state = await prepare();
    // shm and wal move first, the database file is the last one and fails.
    fault.fn = (op, from, to) => {
      if (op === "write" && from.endsWith("restore-pending.json.tmp")) plantWal();
      return op === "rename" && from.endsWith("ludiary.db") && (to ?? "").includes("-raw");
    };
    expect(await swap(state)).toBeNull();
    fault.fn = null;
    expect(read("ludiary.db")).toBe(garbage);
    expect(read("ludiary.db-wal")).toBe("wal");
    expect(read("ludiary.db-shm")).toBe("shm");
    expect(readdirSync(dataDir).filter((f) => f.startsWith("restore-pending"))).toEqual([]);
  });

  it("a cut in the middle of the move (state written first) is finished by the next start", async () => {
    brokenCurrent();
    const state = await prepare();
    // What a dead process leaves: the state with the raw folder written, only the shm moved.
    writeFileSync(join(dataDir, "restore-pending.json"), JSON.stringify({ ...state, preRestore: RAW, kept: { nextAllowedAt: [], activeUserRoots: [] } }));
    mkdirSync(rawDir(), { recursive: true });
    writeFileSync(join(rawDir(), "ludiary.db-shm"), "shm");
    rmSync(join(dataDir, "ludiary.db-shm"));
    const again = readPendingRestore(dataDir);
    expect(again.kind).toBe("pending");
    const swapped = await swap(again.kind === "pending" ? again.state : state);
    expect(swapped?.phase).toBe("swapped");
    expect(readdirSync(rawDir()).sort()).toEqual(["ludiary.db", "ludiary.db-shm", "ludiary.db-wal"]);
    expect(readFileSync(join(rawDir(), "ludiary.db"), "utf8")).toBe(garbage);
    expect(existsSync(join(dataDir, "ludiary.db-wal"))).toBe(false);
    expect(readFileSync(join(dataDir, "ludiary.db")).subarray(0, 15).toString()).toBe("SQLite format 3"); // the restored one
  });

  it("a failure writing the swapped state (raw case) is rolled back: the raw files return", async () => {
    brokenCurrent();
    const state = await prepare();
    let writes = 0;
    fault.fn = (op, from) => {
      if (op !== "write" || !from.endsWith("restore-pending.json.tmp")) return false;
      if (++writes === 1) plantWal(); // 1: raw state, 2: swapped (fails)
      return writes === 2;
    };
    const err = await swap(state).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(SwapError);
    fault.fn = null;
    rollBackRestore(dataDir, (err as SwapError).state);
    expect(read("ludiary.db")).toBe(garbage);
    expect(read("ludiary.db-wal")).toBe("wal");
    expect(readdirSync(dataDir).filter((f) => f.startsWith("restore-pending"))).toEqual([]);
  });

  it("a failure writing the swapped state (normal case) leaves the current database in use", async () => {
    await makeLudiaryDb(join(dataDir, "ludiary.db"), { marker: "current" });
    const state = await prepare();
    fault.fn = (op, from) => op === "write" && from.endsWith("restore-pending.json.tmp");
    const err = await swap(state).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(SwapError);
    fault.fn = null;
    rollBackRestore(dataDir, (err as SwapError).state);
    expect(readFileSync(join(dataDir, "ludiary.db")).includes("current")).toBe(true);
    expect(readdirSync(dataDir).filter((f) => f.startsWith("restore-pending"))).toEqual([]);
  });

  it("a cut in the middle of the roll back: after the database came back, nothing in dataDir is deleted", async () => {
    mkdirSync(rawDir(), { recursive: true });
    // Database file already back; wal and shm still in the raw folder.
    writeFileSync(join(dataDir, "ludiary.db"), garbage);
    writeFileSync(join(rawDir(), "ludiary.db-wal"), "wal");
    writeFileSync(join(rawDir(), "ludiary.db-shm"), "shm");
    rollBackRestore(dataDir, { phase: "rolling-back", id: ID, requestedAt: 1, preRestore: RAW });
    expect(read("ludiary.db")).toBe(garbage);
    expect(read("ludiary.db-wal")).toBe("wal");
    expect(read("ludiary.db-shm")).toBe("shm");
  });

  it("a cut before anything came back: the files of the restored database in dataDir go, the raw ones return", async () => {
    mkdirSync(rawDir(), { recursive: true });
    for (const [f, c] of [["ludiary.db", garbage], ["ludiary.db-wal", "wal"]] as const) writeFileSync(join(rawDir(), f), c);
    writeFileSync(join(dataDir, "ludiary.db"), "restored");
    writeFileSync(join(dataDir, "ludiary.db-wal"), "restored wal");
    writeFileSync(join(dataDir, "ludiary.db-shm"), "restored shm"); // the raw folder had none: this one is stale
    rollBackRestore(dataDir, { phase: "rolling-back", id: ID, requestedAt: 1, preRestore: RAW });
    expect(read("ludiary.db")).toBe(garbage);
    expect(read("ludiary.db-wal")).toBe("wal");
    expect(existsSync(join(dataDir, "ludiary.db-shm"))).toBe(false);
    // Repeating it changes nothing.
    rollBackRestore(dataDir, { phase: "rolling-back", id: ID, requestedAt: 1, preRestore: RAW });
    expect(read("ludiary.db")).toBe(garbage);
    expect(read("ludiary.db-wal")).toBe("wal");
  });
});

describe("step B repeated (swapped phase)", () => {
  it("touches nothing when restore-pending.sqlite is no longer there", async () => {
    writeFileSync(join(dataDir, "ludiary.db"), "restored and in use");
    writeFileSync(join(dataDir, "ludiary.db-wal"), "live wal of the restored database");
    writeFileSync(join(dataDir, "ludiary.db-shm"), "live shm");
    const state: PendingRestore = { phase: "swapped", id: ID, requestedAt: 1, preRestore: null, kept: { nextAllowedAt: [], activeUserRoots: [] } };
    await swap(state);
    expect(read("ludiary.db")).toBe("restored and in use");
    expect(read("ludiary.db-wal")).toBe("live wal of the restored database");
    expect(read("ludiary.db-shm")).toBe("live shm");
  });
});
