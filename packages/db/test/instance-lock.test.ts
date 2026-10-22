import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import { createSqliteInstanceLock } from "../src/instance-lock";

let dir = "";
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "ludiary-lock-"));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

it("lets only one of several simultaneous starts hold the lock (ADR 62)", async () => {
  const file = join(dir, "instance.lock");
  const results = await Promise.all([1, 2, 3, 4].map(() => createSqliteInstanceLock(file, undefined).acquire()));
  expect(results.filter((r) => r !== null)).toHaveLength(1);
  const lock = createSqliteInstanceLock(file, undefined);
  expect(await lock.isHeld()).toBe(true);
  for (const r of results) r?.();
  expect(await lock.isHeld()).toBe(false);
}, 20_000); // each losing attempt waits its 2 s busy timeout

it("does not make acquire() fail while another process keeps probing with isHeld()", async () => {
  const file = join(dir, "instance.lock");
  const sqlite = createRequire(join(import.meta.dirname, "../package.json")).resolve("better-sqlite3");
  // Same probe as isHeld(): timeout 0, BEGIN EXCLUSIVE, ROLLBACK, in a tight loop for 3 s from another process.
  const prober = spawn(
    process.execPath,
    [
      "-e",
      `const D=require(${JSON.stringify(sqlite)});const end=Date.now()+3000;console.log("probing");` +
        `while(Date.now()<end){try{const d=new D(${JSON.stringify(file)},{timeout:0});try{d.exec("BEGIN EXCLUSIVE");d.exec("ROLLBACK")}catch{}d.close()}catch{}}`,
    ],
    { stdio: ["ignore", "pipe", "inherit"] },
  );
  await new Promise<void>((resolve) => prober.stdout.once("data", () => resolve()));
  const lock = createSqliteInstanceLock(file, undefined);
  for (let i = 0; i < 10; i++) {
    const release = await lock.acquire();
    expect(release).not.toBeNull();
    release?.();
  }
  await new Promise((r) => prober.once("exit", r));
}, 20_000);

it("is released by the OS when the holder is killed", async () => {
  const file = join(dir, "instance.lock");
  const sqlite = createRequire(join(import.meta.dirname, "../package.json")).resolve("better-sqlite3");
  const holder = spawn(
    process.execPath,
    ["-e", `const D=require(${JSON.stringify(sqlite)});const d=new D(${JSON.stringify(file)});d.exec("BEGIN EXCLUSIVE");console.log("held");setInterval(()=>{},1e6);`],
    { stdio: ["ignore", "pipe", "inherit"] },
  );
  await new Promise<void>((resolve) => holder.stdout.once("data", () => resolve()));
  const lock = createSqliteInstanceLock(file, undefined);
  expect(await lock.acquire()).toBeNull();
  holder.kill("SIGKILL");
  await new Promise((r) => holder.once("exit", r));
  const release = await lock.acquire();
  expect(release).not.toBeNull();
  release?.();
});
