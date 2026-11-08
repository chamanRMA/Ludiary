import { describe, expect, it } from "vitest";
import { harness } from "./helpers";

type Kind = "game" | "dlc";
function add(h: Awaited<ReturnType<typeof harness>>, id: string, path: string, over: { kind?: Kind; removedAt?: number | null } = {}) {
  h.store.properties.set(`p${id}`, {
    id: `p${id}`, canonicalGameId: `c${id}`, store: "steam", storeGameId: id, kind: over.kind ?? "game", baseStoreGameId: null,
    title: id, normalizedTitle: id, owned: true, removedAt: over.removedAt ?? null, storePlaytimeMinutes: null, storeLastPlayedAt: null,
  });
  h.store.installs.set(`i${id}`, { id: `i${id}`, propertyId: `p${id}`, deviceId: "dev", installPath: path, launchData: null });
}
const running = (paths: string[] | Error) => ({
  listExecutables: async () => {
    if (paths instanceof Error) throw paths;
    return paths;
  },
});

describe("isGameRunning (ADR 92)", () => {
  it("ignores case and slashes, and matches inside the folder", async () => {
    const h = await harness({ processes: running(["c:/games/FOO/bin/Foo.exe"]) });
    add(h, "1", "C:\\Games\\Foo");
    expect(await h.core.isGameRunning()).toBe(true);
  });

  it("does not take Foobar for Foo", async () => {
    const h = await harness({ processes: running(["C:\\Games\\Foobar\\x.exe"]) });
    add(h, "1", "C:\\Games\\Foo");
    expect(await h.core.isGameRunning()).toBe(false);
  });

  it("ignores a drive root, DLC and retired properties", async () => {
    const h = await harness({ processes: running(["C:\\Windows\\x.exe", "D:\\Old\\x.exe", "D:\\Dlc\\x.exe"]) });
    add(h, "1", "C:\\");
    add(h, "2", "D:\\Old", { removedAt: 5 });
    add(h, "3", "D:\\Dlc", { kind: "dlc" });
    expect(await h.core.isGameRunning()).toBe(false);
  });

  it("counts a manual installation", async () => {
    const h = await harness({ processes: running(["D:\\Games\\Farm\\farm.exe"]) });
    add(h, "1", "D:\\Games\\Farm");
    h.store.properties.set("p1", { ...h.store.properties.get("p1")!, store: "manual" });
    h.store.installs.set("i1", { ...h.store.installs.get("i1")!, launchData: { executable: "D:\\Games\\Farm\\farm.exe" }, detectedBy: "library" });
    expect(await h.core.isGameRunning()).toBe(true);
  });

  it("is false without a port", async () => {
    const h = await harness();
    add(h, "1", "C:\\Games\\Foo");
    expect(await h.core.isGameRunning()).toBe(false);
  });

  it("is false and warns, with the error name only, when the port fails", async () => {
    const h = await harness({ processes: running(new TypeError("C:\\secret\\path")) });
    add(h, "1", "C:\\Games\\Foo");
    expect(await h.core.isGameRunning()).toBe(false);
    const w = h.logs.filter((l) => l.startsWith("warn:"));
    expect(w).toHaveLength(1);
    expect(w[0]).toContain("TypeError");
    expect(w[0]).not.toContain("secret");
  });
});
