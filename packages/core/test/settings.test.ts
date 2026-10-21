import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { FolderPicker } from "@ludiary/contracts";
import { describe, expect, it, vi } from "vitest";
import { CoreError } from "../src";
import { addUserRoot, entry, harness, makeConnector } from "./helpers";

describe("settings and first run", () => {
  it("defaults, validation and detection change", async () => {
    const h = await harness({ onboarded: false });
    expect(await h.core.getSettings()).toEqual({ locale: "system", detection: null });
    expect(await h.core.getOnboarding()).toEqual({ completedAt: null, detection: null });
    await expect(h.core.updateSettings({ locale: "fr" as never })).rejects.toBeInstanceOf(CoreError);
    await expect(h.core.updateSettings({ detection: "everything" as never })).rejects.toMatchObject({ code: "invalid-input" });
    expect(await h.core.updateSettings({ locale: "es", detection: "manual-only" })).toEqual({ locale: "es", detection: "manual-only" });
  });

  it("completing the first run stores the mode, scans without waiting, and can be reset", async () => {
    let calls = 0;
    const h = await harness({
      onboarded: false,
      dirs: ["D:\\Games"],
      connectors: [makeConnector({ scan: async () => (calls++, { entries: [entry("1", "G", "D:\\Games\\G")], unreadableRoots: [] }) })],
    });
    addUserRoot(h, "D:\\Games");
    await h.core.requestSync({ trigger: "open" });
    expect(calls).toBe(0);
    await h.core.completeOnboarding("manual-only");
    await h.core.whenIdle();
    expect(calls).toBe(1);
    expect(await h.core.listLibrary()).toHaveLength(1);
    const o = await h.core.getOnboarding();
    expect(o.detection).toBe("manual-only");
    expect(o.completedAt).toBe(h.clock.now());
    await h.core.resetOnboarding();
    expect((await h.core.getOnboarding()).completedAt).toBeNull();
    await expect(h.core.completeOnboarding("sometimes" as never)).rejects.toMatchObject({ code: "invalid-input" });
  });

  it("completing with null leaves the mode unset (treated as 'later')", async () => {
    const h = await harness({ onboarded: false });
    await h.core.completeOnboarding(null);
    expect(await h.core.getOnboarding()).toMatchObject({ detection: null });
    expect((await h.core.getOnboarding()).completedAt).not.toBeNull();
  });
});

describe("scan folders", () => {
  const picker = (path: string | null | (() => Promise<string | null>)): FolderPicker => ({
    pick: typeof path === "function" ? path : async () => path,
  });

  it("adds a picked folder as an enabled 'user' root and scans", async () => {
    const pick = vi.fn(async () => "d:/Games/");
    const h = await harness({ dirs: ["D:\\Games"], picker: { pick } });
    const root = await h.core.pickScanRoot();
    expect(pick).toHaveBeenCalledWith({ title: "core.pickFolder.title" });
    expect(root).toMatchObject({ origin: "user", path: "d:\\Games", enabled: true, store: null, declarationId: null });
    expect(await h.core.listScanRoots()).toHaveLength(1);
  });

  it("returns null when cancelled and the existing root for a repeated folder", async () => {
    const h = await harness({ dirs: ["D:\\Games"], picker: picker(null) });
    expect(await h.core.pickScanRoot()).toBeNull();
    const h2 = await harness({ dirs: ["D:\\Games"], picker: picker("D:\\Games") });
    const a = await h2.core.pickScanRoot();
    const b = await h2.core.pickScanRoot();
    expect(b?.id).toBe(a?.id);
    expect(await h2.core.listScanRoots()).toHaveLength(1);
  });

  it("re-enables a repeated folder that was switched off", async () => {
    const h = await harness({ dirs: ["D:\\Games"], picker: picker("D:\\Games") });
    const a = (await h.core.pickScanRoot())!;
    await h.core.setScanRootEnabled(a.id, false);
    expect((await h.core.pickScanRoot())?.enabled).toBe(true);
  });

  it("allows one dialog at a time", async () => {
    let release: (p: string | null) => void = () => undefined;
    const h = await harness({ dirs: ["D:\\Games"], picker: picker(() => new Promise((r) => (release = r))) });
    const first = h.core.pickScanRoot();
    await expect(h.core.pickScanRoot()).rejects.toMatchObject({ code: "busy" });
    release(null);
    expect(await first).toBeNull();
    const second = h.core.pickScanRoot(); // free again
    release(null);
    expect(await second).toBeNull();
  });

  it("fails clearly without a picker, and for paths that are not folders", async () => {
    const none = await harness();
    await expect(none.core.pickScanRoot()).rejects.toMatchObject({ code: "picker-unavailable" });
    const bad = await harness({ picker: picker("D:\\Nope") });
    await expect(bad.core.pickScanRoot()).rejects.toMatchObject({ code: "invalid-input" });
    const rel = await harness({ picker: picker("relative") });
    await expect(rel.core.pickScanRoot()).rejects.toMatchObject({ code: "invalid-input" });
  });

  it("removes only 'user' roots and reports unknown ones", async () => {
    const h = await harness({ dirs: ["D:\\Games"] });
    const user = addUserRoot(h, "D:\\Games");
    h.store.roots.set("disc", { id: "disc", origin: "discovered", path: "C:\\Steam", pathKey: "c:\\steam", declarationId: "steam-root", store: "steam", tag: null, enabled: true });
    await expect(h.core.removeScanRoot("disc")).rejects.toMatchObject({ code: "invalid-input" });
    await expect(h.core.removeScanRoot("zzz")).rejects.toMatchObject({ code: "not-found" });
    await expect(h.core.setScanRootEnabled("zzz", true)).rejects.toMatchObject({ code: "not-found" });
    await h.core.removeScanRoot(user.id);
    expect((await h.core.listScanRoots()).map((r) => r.id)).toEqual(["disc"]);
    expect((await h.core.setScanRootEnabled("disc", false)).enabled).toBe(false);
  });
});

describe("independence (ADR 38)", () => {
  it("the core imports no node:* module, db or platform package", () => {
    const dir = join(import.meta.dirname, "../src");
    for (const f of readdirSync(dir).filter((x) => x.endsWith(".ts"))) {
      const text = readFileSync(join(dir, f), "utf8");
      expect(text, f).not.toMatch(/from ["']node:/);
      expect(text, f).not.toMatch(/from ["']@ludiary\/(db|platform-[a-z]+|runtime|api)/);
    }
  });
});
