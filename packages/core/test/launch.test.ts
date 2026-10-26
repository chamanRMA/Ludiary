import { ConnectorError, ExecError, LocationsUnreadableError, type LaunchContext, type LaunchSpec, type StoreId } from "@ludiary/contracts";
import { describe, expect, it } from "vitest";
import { CoreError } from "../src";
import { addUserRoot, harness, makeConnector, resolver, type Harness } from "./helpers";

const GAME = "D:\\Games\\Portal";

function seed(h: Harness, store: StoreId, id: string, path = GAME, canonical = "c1") {
  h.store.canonical.set(canonical, { id: canonical, title: "Portal" });
  h.store.properties.set(`p-${store}-${id}`, {
    id: `p-${store}-${id}`,
    canonicalGameId: canonical,
    store,
    storeGameId: id,
    kind: "game",
    baseStoreGameId: null,
    title: "Portal",
    normalizedTitle: "portal",
    owned: false,
    removedAt: null,
    storePlaytimeMinutes: null,
    storeLastPlayedAt: null,
  });
  h.store.installs.set(`i-${store}-${id}`, { id: `i-${store}-${id}`, propertyId: `p-${store}-${id}`, deviceId: "dev", installPath: path, launchData: null });
  addUserRoot(h, "D:\\Games"); // the install must lie under a root in force (launch check)
  return `p-${store}-${id}`;
}

async function rejection(p: Promise<unknown>): Promise<CoreError> {
  try {
    await p;
  } catch (e) {
    return e as CoreError;
  }
  throw new Error("expected a rejection");
}

const withSpec = (spec: unknown, opts: Parameters<typeof harness>[0] = {}) =>
  harness({ dirs: ["D:\\Games"], connectors: [makeConnector({ resolveAction: async () => spec as LaunchSpec })], ...opts });

describe("launch by id (ADR 40 rule 5, invariant 3)", () => {
  it("starts a stored, installed game through ProcessLauncher.openUri and returns no specification", async () => {
    const h = await harness();
    seed(h, "steam", "620");
    const res = await h.core.launch("c1");
    expect(res).toEqual({ status: "started" });
    expect(h.opened).toEqual(["steam://rungameid/620"]);
  });

  it("rejects unknown ids, uninstalled games and properties of another game", async () => {
    const h = await harness();
    expect((await rejection(h.core.launch("nope"))).code).toBe("not-found");
    expect((await rejection(h.core.launch(""))).code).toBe("invalid-input");
    const pid = seed(h, "steam", "620");
    h.store.installs.clear();
    expect((await rejection(h.core.launch("c1"))).code).toBe("not-installed");
    expect((await rejection(h.core.launch("c1", pid))).code).toBe("not-installed");
    seed(h, "steam", "730", GAME, "c2");
    expect((await rejection(h.core.launch("c1", "p-steam-730"))).code).toBe("not-found");
    expect(h.opened).toEqual([]);
  });

  it("does not launch additional content or retired properties", async () => {
    const h = await harness();
    const pid = seed(h, "steam", "620");
    h.store.properties.set(pid, { ...h.store.properties.get(pid)!, kind: "dlc" });
    expect((await rejection(h.core.launch("c1", pid))).code).toBe("action-unavailable");
    h.store.properties.set(pid, { ...h.store.properties.get(pid)!, kind: "game", removedAt: 5 });
    expect((await rejection(h.core.launch("c1", pid))).code).toBe("not-installed");
  });

  it("picks the first installed property in the fixed store order", async () => {
    const h = await harness({
      connectors: [makeConnector({ id: "gog" }), makeConnector({ id: "steam" })],
    });
    seed(h, "gog", "1");
    seed(h, "steam", "620");
    await h.core.launch("c1");
    expect(h.opened).toEqual(["steam://rungameid/620"]);
    await h.core.launch("c1", "p-gog-1").catch(() => undefined); // explicit property wins (already-starting here)
  });

  it("ignores a second launch of the same game within 5 s and allows it afterwards", async () => {
    const h = await harness();
    seed(h, "steam", "620");
    expect(await h.core.launch("c1")).toEqual({ status: "started" });
    h.clock.time += 4_999;
    expect(await h.core.launch("c1")).toEqual({ status: "already-starting" });
    expect(h.opened).toHaveLength(1);
    h.clock.time += 2;
    expect(await h.core.launch("c1")).toEqual({ status: "started" });
    expect(h.opened).toHaveLength(2);
  });

  it("a failed attempt does not block the retry", async () => {
    let fail = true;
    const h = await harness({ launcher: { openUri: async () => { if (fail) throw new Error("os says no"); } } });
    seed(h, "steam", "620");
    expect((await rejection(h.core.launch("c1"))).code).toBe("internal");
    fail = false;
    expect(await h.core.launch("c1")).toEqual({ status: "started" });
  });

  it("refuses to launch when the mode has no launcher", async () => {
    const h = await harness({ launcher: null });
    seed(h, "steam", "620");
    expect((await rejection(h.core.launch("c1"))).code).toBe("action-unavailable");
  });

  it("requires 'play' in the capabilities", async () => {
    const h = await harness({ connectors: [makeConnector({ caps: { actions: ["open-store-page"] } })] });
    seed(h, "steam", "620");
    expect((await rejection(h.core.launch("c1"))).code).toBe("action-unavailable");
  });

  it("maps connector errors and a null action", async () => {
    const missing = await harness({
      connectors: [makeConnector({ resolveAction: async () => { throw new ConnectorError("launch.launcher-missing", "no client"); } })],
    });
    seed(missing, "steam", "620");
    const e = await rejection(missing.core.launch("c1"));
    expect(e).toMatchObject({ code: "launch.launcher-missing", key: "connectors.common.errors.launch.launcher-missing" });

    const none = await harness({ connectors: [makeConnector({ resolveAction: async () => null })] });
    seed(none, "steam", "620");
    expect((await rejection(none.core.launch("c1"))).code).toBe("action-unavailable");

    const crash = await harness({ connectors: [makeConnector({ resolveAction: async () => { throw new TypeError("x"); } })] });
    seed(crash, "steam", "620");
    expect((await rejection(crash.core.launch("c1"))).code).toBe("internal");
  });
});

describe("specification checks", () => {
  it.each([
    ["scheme not in uriSchemes", { kind: "uri", uri: "calc://run" }],
    ["http", { kind: "uri", uri: "http://example.com" }],
    ["file", { kind: "uri", uri: "file:///C:/Windows/system32/calc.exe" }],
    ["no scheme", { kind: "uri", uri: "steam" }],
    ["upper-case scheme", { kind: "uri", uri: "STEAM://rungameid/1" }],
    ["space", { kind: "uri", uri: "steam://rungameid/1 -applaunch" }],
    ["control character", { kind: "uri", uri: "steam://rungameid/1\r\nX" }],
    ["quote", { kind: "uri", uri: 'steam://x"y' }],
    ["too long", { kind: "uri", uri: `steam://${"a".repeat(2100)}` }],
    ["kind not in launchKinds", { kind: "exec", executable: `${GAME}\\g.exe`, args: [] }],
    ["unknown kind", { kind: "shell", cmd: "calc" }],
    ["not an object", "steam://rungameid/1"],
  ])("rejects %s and logs the connector id", async (_n, spec) => {
    const h = await withSpec(spec);
    seed(h, "steam", "620");
    const e = await rejection(h.core.launch("c1"));
    expect(e.code).toBe("launch.rejected");
    expect(h.logs.some((l) => l.includes("rejected") && l.includes('"connector":"steam"'))).toBe(true);
    expect(h.opened).toEqual([]);
    expect(h.execs).toEqual([]);
  });

  it("rejects a kind the platform cannot run", async () => {
    const h = await withSpec(
      { kind: "exec", executable: `${GAME}\\g.exe`, args: [] },
      { files: [`${GAME}\\g.exe`], launcher: { kinds: ["uri", "exec"] }, connectors: [makeConnector({ caps: { launchKinds: ["uri", "exec"] }, resolveAction: async () => ({ kind: "exec", executable: `${GAME}\\g.exe`, args: [] }) })] },
    );
    (h.deps.launcher as { kinds: unknown }).kinds = ["uri"];
    seed(h, "steam", "620");
    expect((await rejection(h.core.launch("c1"))).code).toBe("launch.rejected");
    expect(h.execs).toEqual([]);
  });
});

describe("exec checks (not used by any platform yet)", () => {
  const CLIENT = "C:\\Galaxy\\GalaxyClient.exe";
  function execHarness(spec: () => unknown, opts: Parameters<typeof harness>[0] = {}) {
    return harness({
      dirs: ["D:\\Games", GAME, "C:\\Galaxy", "C:\\Windows"],
      files: [`${GAME}\\g.exe`, CLIENT, "C:\\Windows\\calc.exe"],
      launcher: { kinds: ["uri", "exec"] },
      mode: "auto-and-manual",
      locations: resolver({ "steam-client": [{ declarationId: "steam-client", path: CLIENT }] }),
      connectors: [makeConnector({ caps: { launchKinds: ["exec"], uriSchemes: [] }, resolveAction: async () => spec() as LaunchSpec })],
      ...opts,
    });
  }

  it("runs an executable inside the install path, with args as a list and a cwd", async () => {
    const h = await execHarness(() => ({ kind: "exec", executable: `${GAME}\\g.exe`, args: ["--a", "b c"], cwd: GAME }));
    seed(h, "steam", "1");
    expect(await h.core.launch("c1")).toEqual({ status: "started" });
    expect(h.execs).toEqual([{ executable: `${GAME}\\g.exe`, args: ["--a", "b c"], cwd: GAME }]);
  });

  it("never runs a file inside a launcher location: it is readable, not an exec destination (ADR 77, audit A1)", async () => {
    const h = await execHarness(() => ({ kind: "exec", executable: CLIENT, args: ["/command=runGame"] }));
    seed(h, "steam", "1");
    expect((await rejection(h.core.launch("c1"))).code).toBe("launch.rejected");
    expect(h.execs).toEqual([]);
  });

  it("does not trust launcher locations when detection was not allowed", async () => {
    const h = await execHarness(() => ({ kind: "exec", executable: CLIENT, args: [] }), { mode: "manual-only" });
    seed(h, "steam", "1");
    expect((await rejection(h.core.launch("c1"))).code).toBe("launch.rejected");
  });

  it.each([
    ["relative path", { kind: "exec", executable: "g.exe", args: [] }],
    ["outside install path and launchers", { kind: "exec", executable: "C:\\Windows\\calc.exe", args: [] }],
    ["prefix trap", { kind: "exec", executable: "D:\\Games\\Portal2\\g.exe", args: [] }],
    ["does not exist", { kind: "exec", executable: `${GAME}\\missing.exe`, args: [] }],
    ["is a directory", { kind: "exec", executable: GAME, args: [] }],
    ["control character in an argument", { kind: "exec", executable: `${GAME}\\g.exe`, args: ["ok", "bad\narg"] }],
    ["non-string argument", { kind: "exec", executable: `${GAME}\\g.exe`, args: [1] }],
    ["args not a list", { kind: "exec", executable: `${GAME}\\g.exe`, args: "--x" }],
    ["cwd outside", { kind: "exec", executable: `${GAME}\\g.exe`, args: [], cwd: "C:\\Windows" }],
    ["control character in the path", { kind: "exec", executable: `${GAME}\\g\u0000.exe`, args: [] }],
  ])("rejects %s", async (_n, spec) => {
    const h = await execHarness(() => spec);
    seed(h, "steam", "1");
    expect((await rejection(h.core.launch("c1"))).code).toBe("launch.rejected");
    expect(h.execs).toEqual([]);
  });
});

describe("exec outcome (ADR 76)", () => {
  const spec = { kind: "exec", executable: `${GAME}\\g.exe`, args: ["--secret-arg"], cwd: GAME };
  const exec = (launcher: Parameters<typeof harness>[0] extends infer O ? O : never) =>
    harness({ dirs: ["D:\\Games", GAME], files: [`${GAME}\\g.exe`], connectors: [makeConnector({ id: "gog", caps: { launchKinds: ["exec"], uriSchemes: [] }, resolveAction: async () => spec as LaunchSpec })], ...launcher });

  it("maps ExecError denied to launch.denied with the game.launchDenied key, and logs no path or arguments", async () => {
    const h = await exec({ launcher: { kinds: ["uri", "exec"], exec: async () => { throw new ExecError("denied"); } } });
    seed(h, "gog", "1");
    const e = await rejection(h.core.launch("c1"));
    expect(e).toMatchObject({ code: "launch.denied", key: "game.launchDenied" });
    expect(h.logs.join("\n")).not.toMatch(/Games|secret-arg/);
  });

  it("maps ExecError rejected to launch.rejected and failed to internal", async () => {
    for (const [reason, code] of [["rejected", "launch.rejected"], ["failed", "internal"]] as const) {
      const h = await exec({ launcher: { kinds: ["uri", "exec"], exec: async () => { throw new ExecError(reason); } } });
      seed(h, "gog", "1");
      expect((await rejection(h.core.launch("c1"))).code).toBe(code);
    }
  });

  it("hands the platform the canonical paths it checked", async () => {
    const h = await exec({ launcher: { kinds: ["uri", "exec"] } });
    (h.deps.files as { realPath: (p: string) => Promise<string> }).realPath = async (p) => p.replace("Games", "Real");
    h.deps.files.isInside = async () => true;
    seed(h, "gog", "1");
    await h.core.launch("c1");
    expect(h.execs).toEqual([{ executable: "D:\\Real\\Portal\\g.exe", args: ["--secret-arg"], cwd: "D:\\Real\\Portal" }]);
  });
});

describe("root check before launching", () => {
  it.each([
    ["a disabled root", (h: Harness) => addUserRoot(h, "D:\\Games", false)],
    ["a removed root", (h: Harness) => void h.store.roots.clear()],
    ["detection 'later'", (h: Harness) => void h.store.kv.set("detection.mode", "later")],
  ])("%s gives not-installed and the connector is not called", async (_n, change) => {
    let calls = 0;
    const h = await harness({ connectors: [makeConnector({ resolveAction: async () => (calls++, { kind: "uri", uri: "steam://rungameid/1" }) })] });
    seed(h, "steam", "1");
    change(h);
    expect((await rejection(h.core.launch("c1"))).code).toBe("not-installed");
    expect(calls).toBe(0);
    expect(h.opened).toEqual([]);
  });
});

describe("canonical paths (ADR 76)", () => {
  const make = (realPath: (p: string) => Promise<string>) =>
    harness({ dirs: ["D:\\Games", GAME], files: [`${GAME}\\g.exe`], launcher: { kinds: ["uri", "exec"] }, connectors: [makeConnector({ id: "gog", caps: { launchKinds: ["exec"], uriSchemes: [] }, resolveAction: async () => ({ kind: "exec", executable: `${GAME}\\g.exe`, args: [] }) })] }).then((h) => {
      (h.deps.files as { realPath: typeof realPath }).realPath = realPath;
      return h;
    });

  it("rejects when realPath leaves the install path (isInside is real)", async () => {
    const h = await make(async () => "C:\\Windows\\calc.exe");
    seed(h, "gog", "1");
    expect((await rejection(h.core.launch("c1"))).code).toBe("launch.rejected");
    expect(h.execs).toEqual([]);
  });

  it("rejects when realPath throws", async () => {
    const h = await make(async () => { throw new Error("EPERM"); });
    seed(h, "gog", "1");
    expect((await rejection(h.core.launch("c1"))).code).toBe("launch.rejected");
    expect(h.execs).toEqual([]);
  });
});

describe("launch context", () => {
  async function captured(mode: "auto-and-manual" | "manual-only" | "later") {
    let ctx: LaunchContext | undefined;
    const h = await harness({
      mode,
      locations: resolver({ "steam-client": [{ declarationId: "steam-client", path: "C:\\Steam\\steam.exe" }] }),
      connectors: [makeConnector({ resolveAction: async (_p, _a, c) => ((ctx = c), { kind: "uri", uri: "steam://rungameid/1" }) })],
    });
    seed(h, "steam", "1");
    await h.core.launch("c1");
    return ctx!;
  }

  it("resolves launcher locations only with auto-detection (launchersResolved)", async () => {
    const auto = await captured("auto-and-manual");
    expect(auto.launchersResolved).toBe(true);
    expect(auto.launchers.map((l) => l.path)).toEqual(["C:\\Steam\\steam.exe"]);
    const manual = await captured("manual-only");
    expect(manual.launchersResolved).toBe(false);
    expect(manual.launchers).toEqual([]);
  });

  it("reports launchersResolved false when a launcher location cannot be read (ADR 79)", async () => {
    let ctx: LaunchContext | undefined;
    const h = await harness({
      mode: "auto-and-manual",
      locations: { resolve: async () => { throw new Error("registry helper unavailable"); } },
      connectors: [makeConnector({ resolveAction: async (_p, _a, c) => ((ctx = c), { kind: "uri", uri: "steam://rungameid/1" }) })],
    });
    seed(h, "steam", "1");
    await h.core.launch("c1");
    expect(ctx!.launchersResolved).toBe(false);
    expect(ctx!.launchers).toEqual([]);
  });

  it("keeps the locations that did resolve and reports resolved false (ADR 79)", async () => {
    let ctx: LaunchContext | undefined;
    const h = await harness({
      mode: "auto-and-manual",
      locations: { resolve: async () => { throw new LocationsUnreadableError("down", [{ declarationId: "steam-client", path: "C:\\Steam\\steam.exe" }]); } },
      connectors: [makeConnector({ resolveAction: async (_p, _a, c) => ((ctx = c), { kind: "uri", uri: "steam://rungameid/1" }) })],
    });
    seed(h, "steam", "1");
    await h.core.launch("c1");
    expect(ctx!.launchersResolved).toBe(false);
    expect(ctx!.launchers.map((l) => l.path)).toEqual(["C:\\Steam\\steam.exe"]);
  });

  it("passes the stored property, never anything from the caller", async () => {
    let seen: unknown;
    const h = await harness({ connectors: [makeConnector({ resolveAction: async (p) => ((seen = p), { kind: "uri", uri: "steam://rungameid/9" }) })] });
    seed(h, "steam", "9");
    await h.core.launch("c1");
    expect(seen).toEqual({ storeGameId: "9", installed: true, installPath: GAME, launchData: null });
  });
});

describe("game detail actions", () => {
  it("offers play when installed and the store page otherwise", async () => {
    const h = await harness({ connectors: [makeConnector({ caps: { actions: ["play", "open-store-page"] } })] });
    seed(h, "steam", "1");
    expect((await h.core.getGame("c1"))!.properties[0]!.actions).toEqual(["play"]);
    h.store.installs.clear();
    expect((await h.core.getGame("c1"))!.properties[0]!.actions).toEqual(["open-store-page"]);
    expect(await h.core.getGame("missing")).toBeNull();
  });
});

void addUserRoot;
