// ADR 76 points 12.7 and 13: launch modes, the store-client branch of checkSpec and the setting's validation.
import { checkConnectorManifest, type LaunchContext, type LaunchModeId, type LaunchSpec, type StoreConnector } from "@ludiary/contracts";
import { describe, expect, it } from "vitest";
import { addUserRoot, harness, key, makeConnector, resolver, type Harness } from "./helpers";

const GAME = "D:\\Games\\Portal";
const DIR = "C:\\Galaxy";
const CLIENT = `${DIR}\\GalaxyClient.exe`;
const MODES = [
  { id: "client" as const, labelKey: key("connectors.test.launch.client") },
  { id: "direct" as const, labelKey: key("connectors.test.launch.direct") },
];

function connector(spec: () => unknown, extra: Partial<StoreConnector> = {}, ctxOut?: (c: LaunchContext) => void): StoreConnector {
  const base = makeConnector({
    id: "gog",
    caps: { launchKinds: ["exec"], uriSchemes: [], actions: ["play", "open-store-page", "install"] },
    locations: [{ id: "galaxy", purpose: "launcher", os: ["windows"], executable: "GalaxyClient.exe", sources: [{ kind: "known-folder", folder: "ProgramFilesX86", relative: "Galaxy" }] }],
    resolveAction: async (_p, _a, c) => (ctxOut?.(c), spec() as LaunchSpec),
  });
  return { ...base, launchModes: MODES, ...extra };
}

async function setup(spec: () => unknown, opts: { mode?: unknown; resolved?: boolean; other?: boolean; extra?: Partial<StoreConnector>; ctxOut?: (c: LaunchContext) => void } = {}) {
  const h = await harness({
    dirs: ["D:\\Games", GAME, DIR, `${DIR}\\Games\\X`, "C:\\Other"],
    files: [`${GAME}\\g.exe`, CLIENT, `${DIR}\\Games\\X\\x.exe`, `${DIR}\\Other.exe`, "C:\\Other\\GalaxyClient.exe"],
    launcher: { kinds: ["uri", "exec"] },
    mode: opts.resolved === false ? "manual-only" : "auto-and-manual",
    locations: resolver({ galaxy: [{ declarationId: opts.other ? "other" : "galaxy", path: DIR }] }),
    connectors: [connector(spec, opts.extra, opts.ctxOut)],
  });
  if (opts.mode !== undefined) h.store.kv.set("launch.gog.mode", opts.mode);
  seed(h);
  return h;
}

function seed(h: Harness) {
  h.store.canonical.set("c1", { id: "c1", title: "Portal" });
  h.store.properties.set("p1", { id: "p1", canonicalGameId: "c1", store: "gog", storeGameId: "1", kind: "game", baseStoreGameId: null, title: "Portal", normalizedTitle: "portal", owned: false, removedAt: null, storePlaytimeMinutes: null, storeLastPlayedAt: null });
  h.store.installs.set("i1", { id: "i1", propertyId: "p1", deviceId: "dev", installPath: GAME, launchData: null });
  addUserRoot(h, "D:\\Games");
}

const client = { kind: "exec", executable: CLIENT, args: ["/command=runGame"], cwd: DIR };

describe("manifest rules (ADR 76 point 12.4)", () => {
  it("accepts a well-formed manifest", () => expect(checkConnectorManifest(connector(() => null))).toEqual([]));
  it.each([
    ["missing direct", { launchModes: [MODES[0]!] }],
    ["repeated", { launchModes: [MODES[0]!, MODES[0]!] }],
    ["no labelKey", { launchModes: [{ id: "client" as const, labelKey: "" as never }, MODES[1]!] }],
    ["client without exec", { capabilities: { ...connector(() => null).capabilities, launchKinds: ["uri" as const], uriSchemes: ["x"] } }],
  ])("rejects launchModes: %s", (_n, extra) => expect(checkConnectorManifest(connector(() => null, extra as Partial<StoreConnector>)).length).toBeGreaterThan(0));
  it("rejects client without a launcher location with executable", () => {
    const c = connector(() => null);
    const loc = { ...c.locations[0]! };
    delete (loc as { executable?: string }).executable;
    expect(checkConnectorManifest({ ...c, locations: [loc] }).length).toBeGreaterThan(0);
  });
  it.each(["a\\b.exe", "a/b.exe", "..\\a.exe", "a.txt", "..exe", "", "a/exe", "a:exe", "aexe"])("rejects executable %j", (exe) => {
    const c = connector(() => null);
    expect(checkConnectorManifest({ ...c, locations: [{ ...c.locations[0]!, executable: exe }] }).length).toBeGreaterThan(0);
  });
  it("rejects executable on a scan location", () => {
    const c = connector(() => null);
    expect(checkConnectorManifest({ ...c, locations: [...c.locations, { id: "s", purpose: "scan", os: ["windows"], executable: "a.exe", sources: c.locations[0]!.sources }] }).length).toBeGreaterThan(0);
  });
});

describe("checkSpec client branch (ADR 76 point 13)", () => {
  it("accepts the exact client with mode client and play", async () => {
    const h = await setup(() => client);
    expect(await h.core.launch("c1")).toEqual({ status: "started" });
    expect(h.execs).toEqual([{ executable: CLIENT, args: ["/command=runGame"], cwd: DIR }]);
  });
  it("is the default without a stored row", async () => {
    let seen: LaunchContext | undefined;
    const h = await setup(() => client, { ctxOut: (c) => (seen = c) });
    await h.core.launch("c1");
    expect(seen!.launchMode).toBe("client");
  });
  it.each(["constructor", "__proto__", "toString", "direct-x", 5, null])("reads a stored %j as client", async (v) => {
    let seen: LaunchContext | undefined;
    const h = await setup(() => client, { mode: v, ctxOut: (c) => (seen = c) });
    await h.core.launch("c1");
    expect(seen!.launchMode).toBe("client");
    expect((await h.core.getSettings()).storeLaunch).toEqual({ gog: { mode: "client" } });
  });
  it("reflects direct", async () => {
    let seen: LaunchContext | undefined;
    const h = await setup(() => ({ kind: "exec", executable: `${GAME}\\g.exe`, args: [] }), { mode: "direct", ctxOut: (c) => (seen = c) });
    await h.core.launch("c1");
    expect(seen!.launchMode).toBe("direct");
  });
  it("leaves launchMode undefined for a connector without launchModes", async () => {
    let seen: LaunchContext | undefined;
    const { launchModes: _l, ...rest } = connector(() => ({ kind: "exec", executable: `${GAME}\\g.exe`, args: [] }), {}, (c) => (seen = c));
    const h = await harness({ dirs: ["D:\\Games", GAME], files: [`${GAME}\\g.exe`], launcher: { kinds: ["uri", "exec"] }, connectors: [rest as StoreConnector] });
    seed(h);
    await h.core.launch("c1");
    expect(seen!.launchMode).toBeUndefined();
  });

  const rejected = async (h: Harness) => {
    await expect(h.core.launch("c1")).rejects.toMatchObject({ code: "launch.rejected" });
    expect(h.execs).toEqual([]);
  };
  it("rejects the client with mode direct", async () => rejected(await setup(() => client, { mode: "direct" })));
  it("rejects the client for install", async () => {
    const h = await setup(() => client);
    h.store.installs.clear();
    h.store.properties.set("p1", { ...h.store.properties.get("p1")!, owned: true });
    await expect(h.core.launch("c1", undefined, "install")).rejects.toMatchObject({ code: "launch.rejected" });
    expect(h.execs).toEqual([]);
  });
  it("rejects when the resolved location is not the connector's declaration", async () => rejected(await setup(() => client, { other: true })));
  it("rejects with partial or no resolution", async () => rejected(await setup(() => client, { resolved: false })));
  it("rejects another exe in the client folder", async () => {
    await rejected(await setup(() => ({ kind: "exec", executable: `${DIR}\\Games\\X\\x.exe`, args: [] })));
    await rejected(await setup(() => ({ kind: "exec", executable: `${DIR}\\Other.exe`, args: [] })));
  });
  it("rejects a cwd outside the client folder", async () => rejected(await setup(() => ({ ...client, cwd: "C:\\Other" }))));
  it("rejects a client that is a link to another exe in the folder (planted link)", async () => {
    const h = await setup(() => client);
    const real = h.files.realPath.bind(h.files);
    h.files.realPath = async (p: string) => (h.files.compareKey(p) === h.files.compareKey(CLIENT) ? `${DIR}\\Games\\X\\x.exe` : real(p));
    await rejected(h);
  });
  it("rejects a link whose target keeps the name but sits elsewhere", async () => {
    const h = await setup(() => client);
    const real = h.files.realPath.bind(h.files);
    h.files.realPath = async (p: string) => (h.files.compareKey(p) === h.files.compareKey(CLIENT) ? "C:\\Other\\GalaxyClient.exe" : real(p));
    await rejected(h);
  });
  it("does not log paths or arguments", async () => {
    const h = await setup(() => client, { mode: "direct" });
    await expect(h.core.launch("c1")).rejects.toBeTruthy();
    expect(h.logs.join("\n")).not.toMatch(/Galaxy|runGame/);
  });
});

describe("launch settings (ADR 76 point 13.5)", () => {
  const patch = async (store: string, v: unknown) => {
    const h = await setup(() => client);
    return h.core.updateSettings({ storeLaunch: { [store]: v } } as never);
  };
  it("stores a valid mode and shows it", async () => {
    const h = await setup(() => client);
    expect((await h.core.updateSettings({ storeLaunch: { gog: { mode: "direct" } } })).storeLaunch).toEqual({ gog: { mode: "direct" } });
    expect(h.store.kv.get("launch.gog.mode")).toBe("direct");
  });
  it.each(["constructor", "__proto__", "toString", "other", 3, null])("rejects mode %j", async (m) => {
    await expect(patch("gog", { mode: m })).rejects.toMatchObject({ code: "invalid-input" });
  });
  it("rejects a store without launchModes, and a __proto__ store", async () => {
    await expect(patch("steam", { mode: "client" })).rejects.toMatchObject({ code: "invalid-input" });
    const h = await setup(() => client);
    await expect(h.core.updateSettings(JSON.parse('{"storeLaunch":{"__proto__":{"mode":"client"}}}'))).rejects.toMatchObject({ code: "invalid-input" });
  });
});
