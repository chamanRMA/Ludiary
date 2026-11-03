import { describe, expect, it } from "vitest";
import { planBackupPrune, type BackupInfo, type BackupStore } from "../src";
import { CoreError } from "../src";
import { harness } from "./helpers";

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 10, 4, 12); // Wednesday 4 Nov 2026
const copy = (n: number, createdAt: number, over: Partial<BackupInfo> = {}): BackupInfo => ({ id: `c${n}`, kind: "auto", createdAt, sizeBytes: 1, foreign: false, ...over });

describe("planBackupPrune (ADR 89 point 4)", () => {
  it("keeps the 7 newest and the newest of each of the 4 previous ISO weeks", () => {
    // One a day for 40 days, newest first.
    const all = Array.from({ length: 40 }, (_, i) => copy(i, NOW - i * DAY));
    const deleted = new Set(planBackupPrune(all, NOW));
    const kept = all.filter((c) => !deleted.has(c.id));
    expect(kept.slice(0, 7).map((c) => c.id)).toEqual(all.slice(0, 7).map((c) => c.id));
    // Weeks before the current one (Mon 2 Nov): 26 Oct, 19 Oct, 12 Oct, 5 Oct -> the Sunday of each (newest of that week).
    const week = (c: BackupInfo) => Math.floor((c.createdAt + 3 * DAY) / (7 * DAY));
    const current = week(copy(0, NOW));
    const newestOfWeek = (w: number) => all.find((c) => week(c) === w)!.id; // `all` is newest first
    const expected = new Set([...all.slice(0, 7).map((c) => c.id), ...[1, 2, 3, 4].map((n) => newestOfWeek(current - n))]);
    expect(new Set(kept.map((c) => c.id))).toEqual(expected);
    expect(kept.length).toBeLessThan(all.length);
  });

  it("changes week on Monday 00:00 UTC", () => {
    const sunday = Date.UTC(2026, 10, 1, 23, 59); // week of 26 Oct
    const monday = Date.UTC(2026, 10, 2, 0, 0); // week of 2 Nov
    const recent = Array.from({ length: 7 }, (_, i) => copy(100 + i, NOW - i * 3_600_000)); // 7 newest
    const deleted = planBackupPrune([...recent, copy(1, sunday), copy(2, sunday - 3_600_000), copy(3, monday + 60_000, { id: "monday" })], NOW);
    expect(deleted).toContain("c2"); // same previous week as c1, older
    expect(deleted).toContain("monday"); // current week, outside the 7 newest
    expect(deleted).not.toContain("c1");
  });

  it("never returns manual, internal, foreign or future-dated copies (H4, B4)", () => {
    const junk = [
      copy(1, NOW - 100 * DAY, { kind: "manual" }),
      copy(2, NOW - 100 * DAY, { kind: "pre-migration" }),
      copy(3, NOW - 100 * DAY, { kind: "pre-restore" }),
      copy(4, NOW - 100 * DAY, { foreign: true }),
      copy(5, NOW + 5 * DAY),
    ];
    expect(planBackupPrune(junk, NOW)).toEqual([]);
    // A future copy does not displace a real one from the 7 newest.
    const week = Array.from({ length: 7 }, (_, i) => copy(10 + i, NOW - i * DAY));
    expect(planBackupPrune([...week, copy(99, NOW + DAY)], NOW)).toEqual([]);
  });
});

/** In-memory BackupStore: records calls and fails on demand. */
function fakeStore(initial: BackupInfo[] = []) {
  const s = {
    copies: [...initial],
    created: [] as { folder: string; kind: string; installId: string }[],
    deleted: [] as string[],
    prepared: [] as string[],
    fail: null as CoreError | null,
    gate: null as Promise<void> | null,
  };
  const store: BackupStore = {
    defaultFolder: (docs) => `${docs}/Ludiary/Copias`,
    async create(folder, kind, installId, now) {
      if (s.gate) await s.gate;
      if (s.fail) throw s.fail;
      s.created.push({ folder, kind, installId });
      const c = copy(s.copies.length + 1000, now, { id: `new-${s.created.length}`, kind });
      s.copies.unshift(c);
      return c;
    },
    async list() {
      return [...s.copies].sort((a, b) => b.createdAt - a.createdAt).slice(0, 500);
    },
    async delete(_f, id) {
      s.deleted.push(id);
      s.copies = s.copies.filter((c) => c.id !== id);
    },
    async prepareRestore(_f, id) {
      if (s.fail) throw s.fail;
      s.prepared.push(id);
    },
  };
  return { s, store };
}
const err = (code: string) => new CoreError(code as never, code);
const docs = { documents: async () => "C:/Docs" };

async function setup(initial: BackupInfo[] = [], periodic = true) {
  const f = fakeStore(initial);
  const h = await harness({ backups: f.store, userFolders: docs });
  h.clock.time = NOW;
  if (periodic) h.store.kv.set("backups.periodic", true);
  return { ...f, h };
}

describe("backupTick (ADR 89 point 5)", () => {
  it("does nothing with the periodic copies off, or without a store", async () => {
    const off = await setup([], false);
    await off.h.core.backupTick();
    expect(off.s.created).toEqual([]);
    const bare = await harness({});
    await expect(bare.core.backupTick()).resolves.toBeUndefined();
  });

  it("copies when there is none, not at 23 h, yes at 24 h; a recent manual copy counts", async () => {
    const none = await setup();
    await none.h.core.backupTick();
    expect(none.s.created).toHaveLength(1);
    expect(none.s.created[0]?.folder).toBe("C:/Docs/Ludiary/Copias");

    const recent = await setup([copy(1, NOW - 23 * 3_600_000)]);
    await recent.h.core.backupTick();
    expect(recent.s.created).toEqual([]);

    const due = await setup([copy(1, NOW - 24 * 3_600_000)]);
    await due.h.core.backupTick();
    expect(due.s.created).toHaveLength(1);

    const manual = await setup([copy(1, NOW - 2 * DAY), copy(2, NOW - 3_600_000, { kind: "manual" })]);
    await manual.h.core.backupTick();
    expect(manual.s.created).toEqual([]);
  });

  it("ignores copies of other installs and future-dated ones for the tick (H4, B4)", async () => {
    const t = await setup([copy(1, NOW - 1000, { foreign: true }), copy(2, NOW + 3 * DAY)]);
    await t.h.core.backupTick();
    expect(t.s.created).toHaveLength(1);
  });

  it("prunes after a copy, only own auto copies", async () => {
    const old = Array.from({ length: 12 }, (_, i) => copy(i, NOW - (i + 2) * DAY));
    const t = await setup([...old, copy(50, NOW - 60 * DAY, { kind: "manual" }), copy(51, NOW - 60 * DAY, { foreign: true })]);
    await t.h.core.backupTick();
    expect(t.s.deleted.length).toBeGreaterThan(0);
    expect(t.s.deleted).not.toContain("c50");
    expect(t.s.deleted).not.toContain("c51");
  });

  it("a failure leaves lastError, never throws, and the next tick retries", async () => {
    const t = await setup();
    t.s.fail = err("backup.folder-unavailable");
    await expect(t.h.core.backupTick()).resolves.toBeUndefined();
    expect((await t.h.core.getBackups()).lastError).toEqual({ key: "core.errors.backup.folder-unavailable" });
    t.s.fail = null;
    await t.h.core.backupTick();
    expect(t.s.created).toHaveLength(1);
    expect((await t.h.core.getBackups()).lastError).toBeNull();
  });
});

describe("backup service", () => {
  it("rejects a second operation with backup.busy and whenIdle waits for the lock", async () => {
    const t = await setup([], false);
    let open!: () => void;
    t.s.gate = new Promise<void>((r) => (open = r));
    const first = t.h.core.createBackup();
    await expect(t.h.core.createBackup()).rejects.toMatchObject({ code: "backup.busy" });
    await expect(t.h.core.restoreBackup("x")).rejects.toMatchObject({ code: "backup.busy" });
    let idle = false;
    void t.h.core.whenIdle().then(() => (idle = true));
    await new Promise((r) => setTimeout(r, 10));
    expect(idle).toBe(false);
    open();
    await first;
    await t.h.core.whenIdle();
    expect(idle).toBe(true);
  });

  it("activating without a folder answers backup.no-folder and saves nothing", async () => {
    const h = await harness({ backups: fakeStore().store });
    await expect(h.core.updateSettings({ backups: { periodic: true } })).rejects.toMatchObject({ code: "backup.no-folder" });
    expect(h.store.kv.has("backups.periodic")).toBe(false);
    expect((await h.core.getSettings()).backups.periodic).toBe(false);
  });

  it("activating with a folder saves it and starts the first copy without waiting for it", async () => {
    const t = await setup([], false);
    const settings = await t.h.core.updateSettings({ backups: { periodic: true } });
    expect(settings.backups.periodic).toBe(true);
    await t.h.core.whenIdle();
    expect(t.s.created).toHaveLength(1);
    // A failing first copy keeps the setting on and shows the error.
    const f = await setup([], false);
    f.s.fail = err("backup.write-failed");
    expect((await f.h.core.updateSettings({ backups: { periodic: true } })).backups.periodic).toBe(true);
    await f.h.core.whenIdle();
    expect((await f.h.core.getBackups()).lastError).toEqual({ key: "core.errors.backup.write-failed" });
  });

  it("the restoration answers only if the preparation succeeded, and then keeps the lock until exit", async () => {
    const t = await setup([copy(1, NOW - DAY)], false);
    t.s.fail = err("backup.not-ludiary");
    await expect(t.h.core.restoreBackup("c1")).rejects.toMatchObject({ code: "backup.not-ludiary" });
    t.s.fail = null;
    await t.h.core.restoreBackup("c1");
    expect(t.s.prepared).toEqual(["c1"]);
    await expect(t.h.core.createBackup()).rejects.toMatchObject({ code: "backup.busy" });
    await expect(t.h.core.restoreBackup("c1")).rejects.toMatchObject({ code: "backup.busy" });
    await t.h.core.backupTick(); // the tick does not copy either
    expect(t.s.created).toEqual([]);
  });

  it("lists 500 at most, folder from settings wins, lastRestore comes from the process memory", async () => {
    const many = Array.from({ length: 600 }, (_, i) => copy(i, NOW - i * 1000));
    const f = fakeStore(many);
    const last = { id: "ludiary-20261103T123456789Z-0a1b2c3d-manual.sqlite", at: 5, outcome: "ok" as const, disabledRoots: 2 };
    const h = await harness({ backups: f.store, userFolders: docs, lastRestore: () => last });
    h.clock.time = NOW;
    const state = await h.core.getBackups();
    expect(state.copies).toHaveLength(500);
    expect(state.folderIsDefault).toBe(true);
    expect(state.lastBackupAt).toBe(NOW);
    expect(state.lastRestore).toEqual(last);
    h.store.kv.set("backups.folder", "D:\\Mine");
    expect(await h.core.getBackups()).toMatchObject({ folder: "D:\\Mine", folderIsDefault: false });
  });

  it("the folder only changes through the dialog and must be an absolute existing directory", async () => {
    const f = fakeStore();
    const h = await harness({ backups: f.store, dirs: ["D:\\Usb"], picker: { pick: async () => "D:\\Usb" } });
    expect((await h.core.pickBackupFolder())?.folder).toBe("D:\\Usb");
    expect(h.store.kv.get("backups.folder")).toBe("D:\\Usb");
    const gone = await harness({ backups: f.store, picker: { pick: async () => "D:\\Missing" } });
    await expect(gone.core.pickBackupFolder()).rejects.toMatchObject({ code: "invalid-input" });
    const cancelled = await harness({ backups: f.store, picker: { pick: async () => null } });
    expect(await cancelled.core.pickBackupFolder()).toBeNull();
  });
});
