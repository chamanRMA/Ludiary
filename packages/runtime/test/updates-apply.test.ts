// ADR 90 points 7, 8 and 18: the inner launcher's side of an update, on real SQLite files in temporary folders.
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createSqliteInstanceLock, openDatabase } from "@ludiary/db";
import { makeLudiaryDb, tempDir } from "../../db/test/backup-fixtures";
import type { RuntimeDeps } from "../src/deps";
import { runLauncher, TRIAL_TIMEOUT_MS, START_TIMEOUT_MS } from "../src/launcher";
import { maybeApplyUpdate, runRollbackUpdate } from "../src/updates/apply";
import { readState, updateFolder, writeState, reconcileState } from "../src/updates/state";

let dir = "";
let dataDir = "";
let root = "";
const lines: string[] = [];
const log = (level: string, msg: string) => lines.push(`${level} ${msg}`);

const deps = (version = "0.2.0", extra: Partial<RuntimeDeps> = {}): RuntimeDeps =>
  ({
    version,
    platform: { dataDir, systemLocale: "en-US" },
    env: {},
    updates: { platform: { target: "windows-x64", installRoot: root, freeBytes: async () => 1e12, restartIntoLauncher: async () => {} }, keys: {}, repo: "o/r" },
    selfCommand: { command: process.execPath, args: ["-e", "process.exit(12)", "--"] },
    ...extra,
  }) as unknown as RuntimeDeps;

const stage = (to = "0.3.0") => {
  const folder = updateFolder(dataDir, to);
  mkdirSync(folder, { recursive: true });
  for (const f of [`Ludiary-Setup-${to}.exe`, "ludiary-update.json", "ludiary-update.json.sig"]) writeFileSync(join(folder, f), "x");
  writeState(dataDir, { state: "ready", version: to });
};
const marker = (): string => {
  const db = openDatabase(join(dataDir, "ludiary.db"), undefined);
  try {
    return JSON.parse((db.prepare("SELECT value FROM settings WHERE key = 'test.marker'").get() as { value: string }).value) as string;
  } finally {
    db.close();
  }
};
const setMarker = (value: string) => {
  const db = openDatabase(join(dataDir, "ludiary.db"), undefined);
  db.prepare("UPDATE settings SET value = ? WHERE key = 'test.marker'").run(JSON.stringify(value));
  db.close();
};
const PAIR = { from: "0.2.0", to: "0.3.0" };
const copies = () => (existsSync(join(dataDir, "backups")) ? readdirSync(join(dataDir, "backups")).filter((f) => f.includes("update_0_2_0_to_0_3_0")) : []);

beforeEach(async () => {
  dir = tempDir();
  dataDir = join(dir, "data");
  root = join(dir, "Programs");
  mkdirSync(dataDir, { recursive: true });
  mkdirSync(root, { recursive: true });
  lines.length = 0;
  await makeLudiaryDb(join(dataDir, "ludiary.db"), { marker: "old" });
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("maybeApplyUpdate (point 7.2)", () => {
  it("takes the lock, copies the database, writes applying and lets the lock go", async () => {
    stage();
    expect(await maybeApplyUpdate(deps(), log)).toBe(true);
    expect(readState(dataDir)).toMatchObject({ state: "applying", from: "0.2.0", to: "0.3.0" });
    expect(copies()).toHaveLength(1);
    expect(await createSqliteInstanceLock(join(dataDir, "instance.lock"), undefined).isHeld()).toBe(false);
  });

  it.each([
    ["nothing ready", () => writeState(dataDir, { state: "idle" })],
    ["an equal version", () => stage("0.2.0")],
    ["an older version", () => stage("0.1.0")],
    ["a missing installer", () => (stage(), rmSync(join(updateFolder(dataDir, "0.3.0"), "Ludiary-Setup-0.3.0.exe")))],
    ["a bad version", () => (stage(), writeFileSync(join(root, "versions.json"), JSON.stringify({ active: "0.2.0", previous: null, trial: false, trials: 0, badVersions: ["0.3.0"] })))],
  ])("does not apply %s", async (_n, arrange) => {
    arrange();
    expect(await maybeApplyUpdate(deps(), log)).toBe(false);
    expect(copies()).toHaveLength(0);
  });

  it("a bad version is applied only when the state names it in retryBad (M4)", async () => {
    stage();
    writeFileSync(join(root, "versions.json"), JSON.stringify({ active: "0.2.0", previous: null, trial: false, trials: 0, badVersions: ["0.3.0"] }));
    writeState(dataDir, { state: "ready", version: "0.3.0", retryBad: "0.3.0" });
    expect(await maybeApplyUpdate(deps(), log)).toBe(true);
    expect(readState(dataDir).retryBad).toBe("0.3.0");
  });

  it("does nothing while another process holds the instance lock", async () => {
    stage();
    const release = await createSqliteInstanceLock(join(dataDir, "instance.lock"), undefined).acquire();
    expect(await maybeApplyUpdate(deps(), log)).toBe(false);
    release!();
    expect(readState(dataDir).state).toBe("ready");
  });

  it("a failed copy means no update this time", async () => {
    stage();
    rmSync(join(dataDir, "ludiary.db"));
    writeFileSync(join(dataDir, "ludiary.db"), "this is not a database");
    expect(await maybeApplyUpdate(deps(), log)).toBe(false);
    expect(readState(dataDir).state).toBe("ready");
  });

  it("reuses the copy of an installation that started and was never confirmed (A1)", async () => {
    stage();
    expect(await maybeApplyUpdate(deps(), log)).toBe(true);
    setMarker("migrated"); // the new version already ran its migrations
    writeState(dataDir, { state: "ready", version: "0.3.0" });
    writeFileSync(join(root, "versions.json"), JSON.stringify({ active: "0.2.0", previous: null, trial: false, trials: 0, badVersions: [], applying: { to: "0.3.0", attempts: 1 } }));
    expect(await maybeApplyUpdate(deps(), log)).toBe(true);
    expect(copies()).toHaveLength(1);
  });
});

describe("runRollbackUpdate (point 18, A2)", () => {
  async function failedUpdate() {
    stage();
    await maybeApplyUpdate(deps(), log);
    setMarker("migrated by 0.3.0");
  }

  it("puts the copy back, saves the current database first and records the rollback", async () => {
    await failedUpdate();
    expect(await runRollbackUpdate(deps(), 1, PAIR)).toBe(0);
    expect(marker()).toBe("old");
    expect(readState(dataDir)).toMatchObject({ state: "rolled-back", from: "0.2.0", to: "0.3.0", code: "1" });
    expect(readdirSync(join(dataDir, "backups")).some((f) => f.startsWith("pre-restore-"))).toBe(true);
    expect(existsSync(join(dataDir, "restore-pending.json"))).toBe(false);
  });

  it("is idempotent: a second run changes nothing", async () => {
    await failedUpdate();
    await runRollbackUpdate(deps(), 1, PAIR);
    setMarker("typed by the user after the rollback");
    expect(await runRollbackUpdate(deps(), 1, PAIR)).toBe(0);
    expect(marker()).toBe("typed by the user after the rollback");
  });

  it("aborts without touching anything when it cannot take the lock", async () => {
    await failedUpdate();
    const release = await createSqliteInstanceLock(join(dataDir, "instance.lock"), undefined).acquire();
    expect(await runRollbackUpdate(deps(), 1, PAIR)).toBe(1);
    release!();
    expect(marker()).toBe("migrated by 0.3.0");
    expect(readState(dataDir).state).toBe("applying");
  });

  it("restores even when the current database has migrations this version does not know, and says so", async () => {
    await failedUpdate();
    const db = openDatabase(join(dataDir, "ludiary.db"), undefined);
    db.prepare("INSERT INTO schema_migrations (id, hash, applied_at) VALUES ('9999_future', 'h', 1)").run();
    db.close();
    expect(await runRollbackUpdate(deps(), 1, PAIR)).toBe(0);
    expect(marker()).toBe("old");
  });

  it("nothing to restore (no copy of the pair): the database stays", async () => {
    expect(await runRollbackUpdate(deps(), 1, PAIR)).toBe(0);
    expect(marker()).toBe("old");
  });

  it("restores the copy of the pair the launcher names, whatever state.json says (the new server may have rewritten it)", async () => {
    await failedUpdate();
    writeState(dataDir, { state: "downloading", version: "0.4.0" }); // what a download during the trial would leave
    expect(await runRollbackUpdate(deps(), 14, PAIR)).toBe(0);
    expect(marker()).toBe("old");
    expect(readState(dataDir)).toMatchObject({ state: "rolled-back", to: "0.3.0", code: "14" });
  });

  it("refuses a missing or inconsistent pair without touching anything", async () => {
    await failedUpdate();
    expect(await runRollbackUpdate(deps(), 1, null)).toBe(1);
    expect(await runRollbackUpdate(deps(), 1, { from: "0.1.0", to: "0.3.0" })).toBe(1);
    expect(marker()).toBe("migrated by 0.3.0");
  });

  it("a corrupt copy fails and leaves the current database where it is", async () => {
    await failedUpdate();
    writeFileSync(join(dataDir, "backups", copies()[0]!), "corrupt");
    expect(await runRollbackUpdate(deps(), 1, PAIR)).toBe(1);
    expect(marker()).toBe("migrated by 0.3.0");
  });
});

describe("runLauncher roles (point 7.2, 7.5 and point 18 B6, A3)", () => {
  it("--from-launcher with a ready update and no server exits with 20", async () => {
    stage();
    expect(await runLauncher(deps(), { fromLauncher: true })).toBe(20);
    expect(readState(dataDir).state).toBe("applying");
  });

  it("without --from-launcher it never applies, and cleans an `applying` left behind", async () => {
    stage();
    writeState(dataDir, { state: "applying", from: "0.2.0", to: "0.3.0" });
    const code = await runLauncher(deps(), {});
    expect(code).not.toBe(20);
    expect(readState(dataDir).state).toBe("ready"); // folder still there: offered again, Go counts the attempts
  });

  it("--trial returns the exit code of a server that failed fatally and shows no dialog", async () => {
    const shown: string[] = [];
    const d = deps("0.3.0", { dialogs: { showError: async (t: string) => void shown.push(t) } });
    expect(await runLauncher(d, { fromLauncher: true, trial: true })).toBe(12);
    expect(shown).toEqual([]);
  });

  it("a normal start shows the dialog and returns 1", async () => {
    const shown: string[] = [];
    const d = deps("0.3.0", { dialogs: { showError: async (t: string) => void shown.push(t) } });
    expect(await runLauncher(d, { fromLauncher: true })).toBe(1);
    expect(shown).toHaveLength(1);
  });

  it("the trial limit is the start timeout plus 60 s, and the stable launcher uses the same figure (M4)", () => {
    expect(TRIAL_TIMEOUT_MS).toBe(START_TIMEOUT_MS + 60_000);
    const go = readFileSync(new URL("../../../apps/desktop/launcher/main.go", import.meta.url), "utf8");
    expect(go).toContain(`trialTimeout:    ${TRIAL_TIMEOUT_MS / 1000} * time.Second`);
  });
});

describe("reconcileState", () => {
  const vf = (v: object) => writeFileSync(join(root, "versions.json"), JSON.stringify({ previous: null, trial: false, trials: 0, badVersions: [], ...v }));

  it("a confirmed update becomes `updated`, once", () => {
    writeState(dataDir, { state: "applying", from: "0.2.0", to: "0.3.0" });
    vf({ active: "0.3.0" });
    expect(reconcileState(dataDir, root, "0.3.0", log)).toEqual({ state: "idle", updated: "0.3.0" });
  });
  it("a trial still running is left alone", () => {
    writeState(dataDir, { state: "applying", from: "0.2.0", to: "0.3.0" });
    vf({ active: "0.3.0", previous: "0.2.0", trial: true });
    expect(reconcileState(dataDir, root, "0.3.0", log).state).toBe("applying");
  });
  it("install-interrupted: the folder is gone after the attempt was counted", () => {
    writeState(dataDir, { state: "applying", from: "0.2.0", to: "0.3.0" });
    vf({ active: "0.2.0", applying: { to: "0.3.0", attempts: 1 } });
    expect(reconcileState(dataDir, root, "0.2.0", log)).toMatchObject({ state: "failed", code: "install-interrupted" });
  });
  it("verify-failed: Go removed the folder before counting anything", () => {
    writeState(dataDir, { state: "applying", from: "0.2.0", to: "0.3.0" });
    vf({ active: "0.2.0" });
    expect(reconcileState(dataDir, root, "0.2.0", log)).toMatchObject({ state: "failed", code: "verify-failed" });
  });
  it("rollback-interrupted when rollingBack is present", () => {
    writeState(dataDir, { state: "applying", from: "0.2.0", to: "0.3.0" });
    vf({ active: "0.3.0", rollingBack: { from: "0.2.0", to: "0.3.0" } });
    expect(reconcileState(dataDir, root, "0.2.0", log)).toMatchObject({ code: "rollback-interrupted" });
  });
  it("a stale applying (the target is already installed or older) goes back to idle (point 23)", () => {
    writeState(dataDir, { state: "applying", from: "0.1.0", to: "0.2.0" });
    vf({ active: "0.3.0" });
    expect(reconcileState(dataDir, root, "0.3.0", log)).toEqual({ state: "idle" });
  });
  it("a stored failure for a version not newer than the installed one goes back to idle (point 23)", () => {
    writeState(dataDir, { state: "failed", to: "0.2.0", code: "verify-failed" });
    expect(reconcileState(dataDir, root, "0.2.0", log).state).toBe("idle");
    writeState(dataDir, { state: "failed", version: "0.3.0", code: "hash-mismatch" });
    expect(reconcileState(dataDir, root, "0.2.0", log).state).toBe("failed"); // still newer: the check decides
  });
  it("rollback-interrupted is kept while the rollback is still marked (point 23, A1)", () => {
    writeState(dataDir, { state: "failed", to: "0.2.0", code: "rollback-interrupted" });
    vf({ active: "0.3.0", rollingBack: { from: "0.3.0", to: "0.2.0" } });
    expect(reconcileState(dataDir, root, "0.2.0", log)).toMatchObject({ state: "failed", code: "rollback-interrupted" });
  });
  it("a stale applying whose target is the installed version keeps the updated notice", () => {
    writeState(dataDir, { state: "applying", from: "0.1.0", to: "0.3.0" });
    expect(reconcileState(dataDir, root, "0.3.0", log)).toEqual({ state: "idle", updated: "0.3.0" });
  });
  it("a stale ready state (the version is already installed) goes back to idle", () => {
    stage("0.2.0");
    expect(reconcileState(dataDir, root, "0.2.0", log).state).toBe("idle");
  });
  it("a manual installation of an older version is flagged once (M8)", () => {
    vf({ active: "0.1.0", previous: "0.2.0", trial: true });
    expect(reconcileState(dataDir, root, "0.1.0", log).downgraded).toBe(true);
  });
  it("an unreadable state counts as idle", () => {
    mkdirSync(join(dataDir, "updates"), { recursive: true });
    writeFileSync(join(dataDir, "updates", "state.json"), "{{{");
    expect(readState(dataDir)).toEqual({ state: "idle" });
  });
});
