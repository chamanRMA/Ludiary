import { ExecError } from "@ludiary/contracts";
import { describe, expect, it } from "vitest";
import { manualTitle } from "../src/manual";
import { harness, type Harness } from "./helpers";

const EXE = "D:\\Games\\Farming Simulator 2025\\FarmingSimulator2025.exe";
const picks = (...paths: (string | null)[]) => {
  const queue = [...paths];
  const calls: unknown[] = [];
  return { calls, pickExecutable: async (o: unknown) => (calls.push(o), queue.shift() ?? null) };
};
const opts = (p: unknown, extra: Parameters<typeof harness>[0] = {}): Parameters<typeof harness>[0] => ({
  filePicker: p as never,
  dirs: ["D:\\Games\\Farming Simulator 2025"],
  files: [EXE],
  launcher: { kinds: ["uri", "exec"] },
  ...extra,
});
const code = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    return e as { code: string; key: string };
  }
  throw new Error("expected a rejection");
};
const added = async (h: Harness) => (await h.core.addManualGame())!.game;

describe("manualTitle", () => {
  it("uses the folder, the file for generic folders and drive roots", () => {
    expect(manualTitle(EXE)).toBe("Farming Simulator 2025");
    expect(manualTitle("D:\\Game\\bin\\x64\\game.exe")).toBe("game");
    expect(manualTitle("D:\\Win64\\x.exe")).toBe("x");
    expect(manualTitle("D:\\Emu.EXE")).toBe("Emu");
    expect(manualTitle("C:\\Users\\john\\game.exe")).toBe("game"); // never the Windows user name
  });
});

describe("addManualGame (ADR 93)", () => {
  it("creates the game, returns the same one for the same .exe, and stores real paths", async () => {
    const h = await harness(opts(picks(EXE, EXE.toLowerCase())));
    const first = await h.core.addManualGame();
    expect(first).toMatchObject({ created: true, game: { title: "Farming Simulator 2025", installed: true, mainAction: "play", properties: [{ store: "manual", actions: ["play"] }] } });
    const again = await h.core.addManualGame();
    expect(again).toMatchObject({ created: false, game: { id: first!.game.id } });
    expect(h.store.installs.size).toBe(1);
    expect([...h.store.installs.values()][0]).toMatchObject({ installPath: "D:\\Games\\Farming Simulator 2025", launchData: { executable: EXE }, detectedBy: "library" });
  });

  it("passes the translated texts to the dialog and answers null on cancel", async () => {
    const p = picks(null);
    const h = await harness(opts(p));
    expect(await h.core.addManualGame()).toBeNull();
    expect(p.calls).toEqual([{ title: "core.pickExecutable.title", filterName: "core.pickExecutable.filter" }]);
  });

  it("without a picker answers picker-unavailable; with a dialog open, busy", async () => {
    const h = await harness({ launcher: { kinds: ["uri", "exec"] } });
    expect((await code(h.core.addManualGame())).code).toBe("picker-unavailable");
    let release!: (v: string | null) => void;
    const slow = { pickExecutable: () => new Promise<string | null>((r) => (release = r)) };
    const h2 = await harness(opts(slow));
    const first = h2.core.addManualGame();
    expect((await code(h2.core.addManualGame())).code).toBe("busy");
    release(null);
    expect(await first).toBeNull();
  });

  it.each([
    ["a relative path", "game.exe"],
    ["a UNC path", "\\\\srv\\share\\g.exe"],
    ["a folder", "D:\\Games\\Farming Simulator 2025"],
    ["a .bat", "D:\\Games\\Farming Simulator 2025\\run.bat"],
    ["a .lnk", "D:\\Games\\Farming Simulator 2025\\x.lnk"],
    ["a missing file", "D:\\Games\\Farming Simulator 2025\\gone.exe"],
    ["an alternate data stream", `${EXE}:evil`],
    ["a trailing dot", "D:\\Games\\Farming Simulator 2025.\\x.exe"],
    ["not text", 42 as unknown as string],
  ])("rejects %s with manual-bad-file", async (_n, path) => {
    const h = await harness(opts(picks(path)));
    expect(await code(h.core.addManualGame())).toMatchObject({ code: "invalid-input", key: "core.errors.manual-bad-file" });
    expect(h.store.installs.size).toBe(0);
  });

  it("does not touch the disk for a UNC, stream or relative path", async () => {
    const h = await harness(opts(picks("\\\\srv\\share\\g.exe", `${EXE}:s`, "g.exe")));
    for (let i = 0; i < 3; i++) await code(h.core.addManualGame());
    expect(h.files.scopedCalls).toEqual([]);
  });

  it("rejects a real path that comes out UNC (mapped drive) and one inside Ludiary's folders", async () => {
    const h = await harness(opts(picks(EXE)));
    h.files.realPath = async () => "\\\\srv\\share\\FarmingSimulator2025.exe";
    expect((await code(h.core.addManualGame())).key).toBe("core.errors.manual-bad-file");
    const own = await harness(opts(picks(EXE), { ownFolders: ["D:\\Games"] }));
    expect((await code(own.core.addManualGame())).key).toBe("core.errors.manual-bad-file");
  });

  it("maps any error of the disk checks to manual-bad-file", async () => {
    const h = await harness(opts(picks(EXE)));
    h.files.realPath = async () => {
      throw new Error("EIO");
    };
    expect((await code(h.core.addManualGame())).key).toBe("core.errors.manual-bad-file");
  });
});

describe("pickManualExecutable, updateGame title and removeGame", () => {
  it("changes the executable; a game deleted while the dialog is open gives not-found and writes nothing", async () => {
    const other = "D:\\Games\\Farming Simulator 2025\\Other.exe";
    const h = await harness(opts(picks(EXE, other), { files: [EXE, other] }));
    const g = await added(h);
    const changed = await h.core.pickManualExecutable(g.id);
    expect([...h.store.installs.values()][0]!.launchData).toEqual({ executable: other });
    expect(changed!.title).toBe("Farming Simulator 2025");
    (h.deps.filePicker as { pickExecutable: unknown }).pickExecutable = async () => {
      h.store.properties.clear();
      h.store.canonical.clear();
      return EXE;
    };
    expect((await code(h.core.pickManualExecutable(g.id))).code).toBe("not-found");
  });

  it("rename goes through normalizeLabel; store games cannot be renamed, changed or removed", async () => {
    const h = await harness(opts(picks(EXE)));
    const g = await added(h);
    await h.core.updateGame(g.id, { title: "  My   farm " });
    expect(h.userDataCalls.find((c) => c[0] === "updateGame")![2]).toMatchObject({ title: "My farm" });
    for (const bad of ["", "   ", "a\u0000b", "x".repeat(201)]) expect((await code(h.core.updateGame(g.id, { title: bad }))).code).toBe("invalid-input");
    h.store.properties.set("s", { ...[...h.store.properties.values()][0]!, id: "s", store: "steam", storeGameId: "1" });
    expect((await code(h.core.pickManualExecutable(g.id))).code).toBe("action-unavailable");
    expect((await code(h.core.removeGame(g.id))).code).toBe("action-unavailable");
    expect((await code(h.core.removeGame("nope"))).code).toBe("not-found");
  });

  it("removes a manual game", async () => {
    const h = await harness(opts(picks(EXE)));
    const g = await added(h);
    await h.core.removeGame(g.id);
    expect(h.store.properties.size).toBe(0);
  });
});

describe("launching a manual game", () => {
  const setup = async (extra: Parameters<typeof harness>[0] = {}) => {
    const h = await harness(opts(picks(EXE), extra));
    const g = await added(h);
    return { h, g, install: () => [...h.store.installs.values()][0]! };
  };

  it("hands exec exactly { executable, args: [], cwd } and finds the property without propertyId", async () => {
    const { h, g, install } = await setup();
    install().launchData = { executable: EXE, args: "--evil", cwd: "C:\\Windows" };
    expect(await h.core.launch(g.id)).toEqual({ status: "started" });
    expect(h.execs).toEqual([{ executable: EXE, args: [], cwd: "D:\\Games\\Farming Simulator 2025" }]);
    expect(await h.core.launch(g.id)).toEqual({ status: "already-starting" });
  });

  it("rejects a moved file, a realPath outside the folder, a cwd that does not match, and a scan-detected row", async () => {
    const { h, g, install } = await setup();
    h.files.files.clear();
    expect((await code(h.core.launch(g.id))).code).toBe("launch.rejected");
    h.files.files.add(h.files.compareKey(EXE));
    h.files.realPath = async (p) => (p.endsWith(".exe") ? "D:\\Elsewhere\\x.exe" : p);
    expect((await code(h.core.launch(g.id))).code).toBe("launch.rejected");
    h.files.realPath = async (p) => p;
    install().installPath = "D:\\Games";
    expect((await code(h.core.launch(g.id))).code).toBe("launch.rejected");
    install().installPath = "D:\\Games\\Farming Simulator 2025";
    install().detectedBy = "scan";
    expect((await code(h.core.launch(g.id))).code).toBe("launch.rejected");
    expect(h.execs).toEqual([]);
  });

  it("refuses install, maps denied and does not block the retry", async () => {
    let deny = true;
    const { h, g } = await setup({
      launcher: {
        kinds: ["uri", "exec"],
        exec: async () => {
          if (deny) throw new ExecError("denied");
        },
      },
    });
    expect((await code(h.core.launch(g.id, undefined, "install"))).code).toBe("action-unavailable");
    expect(await code(h.core.launch(g.id))).toMatchObject({ code: "launch.denied", key: "game.launchDeniedLocal" });
    deny = false;
    expect(await h.core.launch(g.id)).toEqual({ status: "started" });
  });

  it("has no Play without a launcher", async () => {
    const { h, g } = await setup({ launcher: null });
    expect((await h.core.getGame(g.id))!.mainAction).toBeNull();
    expect((await h.core.getGame(g.id))!.properties[0]!.actions).toEqual([]);
    expect((await h.core.listLibrary())[0]!.mainAction).toBeNull();
  });
});
