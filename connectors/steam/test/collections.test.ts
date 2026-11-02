import { discoveryContext, memoryFiles, memoryVault, readFixtureFiles, type MemoryFiles } from "@ludiary/connector-testkit";
import { ConnectorError, PathEscapesRootsError, type CollectionImportContext } from "@ludiary/contracts";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createSteamConnector } from "../src";
import { FIXTURES, STEAM_ROOT } from "./helpers";

const c = createSteamConnector();
const SEP = String.fromCharCode(92);
const P = (...parts: string[]): string => parts.join(SEP);
const FILE = ["config", "cloudstorage", "cloud-storage-namespace-1.json"];
const fixtureText = readFixtureFiles(join(FIXTURES, "collections"))[0]!.content;
const ROOT2 = "D:" + SEP + "Steam";
const steamIdOf = (accountId: number): string => String(76561197960265728n + BigInt(accountId)); // in-memory only

function ctxFor(opts: {
  files?: Record<string, string | Uint8Array>; // keyed by "<accountid>" -> file content, or full path
  roots?: string[];
  steamId?: string;
  escaping?: string[];
  dirs?: string[];
}): CollectionImportContext & { logs: { msg: string; fields: unknown }[] } {
  const roots = opts.roots ?? [STEAM_ROOT];
  const tree: Record<string, string | Uint8Array> = {};
  for (const d of opts.dirs ?? []) tree[d] = "";
  for (const [k, v] of Object.entries(opts.files ?? {})) tree[k.includes(SEP) ? k : P(roots[0]!, "userdata", k, ...FILE)] = v;
  const base = discoveryContext({ locations: roots.map((path) => ({ declarationId: "steam-root", path })) });
  const fs = memoryFiles(tree, { roots: roots.map((r) => P(r, "userdata")), ...(opts.escaping ? { escaping: opts.escaping } : {}) });
  return { ...base, fs, secrets: memoryVault(opts.steamId ? { steamId: opts.steamId } : {}), logs: base.logs };
}
const run = (ctx: CollectionImportContext) => c.importCollections!(ctx);
const fail = async (p: Promise<unknown>): Promise<ConnectorError> => {
  const e = await p.then(
    () => null,
    (x: unknown) => x,
  );
  expect(e).toBeInstanceOf(ConnectorError);
  return e as ConnectorError;
};

describe("importCollections manifest (ADR 87)", () => {
  it("declares the operation and the userdata root", () => {
    expect(c.importCollections).toBeDefined();
    expect(c.importCollectionsRoot).toBe("userdata");
  });
});

describe("importCollections: analysis of the invented file", () => {
  it("reads every odd case", async () => {
    const snap = await run(ctxFor({ files: { "11111111": fixtureText } }));
    expect(snap.accountSource).toBe("single-folder");
    expect(snap.collections.map((x) => x.name)).toEqual([
      "Pendientes de prueba",
      "RPG",
      "rpg",
      "N".repeat(70),
      "Peligro\u202Eoculto",
      "Accesos directos",
      "__proto__",
      "Con proto",
      "constructor",
    ]);
    const byName = (n: string) => snap.collections.find((x) => x.name === n)!.storeGameIds;
    expect(byName("Pendientes de prueba")).toEqual(["250900", "400", "620"]); // text digits; dupes, 1.5, -3, object, 0, too big dropped
    expect(byName("RPG")).toEqual(["250900"]); // removed takes one out (SC2)
    expect(byName("Accesos directos")).toEqual(["4000000000", "250900"]);
    expect(byName("Con proto")).toEqual(["620"]); // own "__proto__" inside value has no effect
    expect(snap.collections.map((x) => x.sourceId)).toEqual(["uc-a", "uc-b", "uc-c", "uc-d", "uc-e", "uc-shortcut", "__proto__", "uc-pp", "constructor"]);
    expect(snap.favorites).toEqual(["620", "4000000000"]);
    expect(snap.skipped).toEqual({
      dynamic: 1,
      deleted: 1,
      hidden: 2, // games hidden (added minus removed), not collections
      invalid: 6 + 1 + 1, // 6 bad appids, the malformed value, the collection without name
      limitSnapshot: 0,
      limitIds: 0,
    });
  });

  it("accepts a BOM and rejects what is not an array, invalid UTF-8 and over 8 MiB", async () => {
    const bom = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode("[]")]);
    expect((await run(ctxFor({ files: { "1": bom } }))).collections).toEqual([]);
    for (const bad of ['{"a":1}', new Uint8Array([0x5b, 0xff, 0x5d])]) {
      const e = await fail(run(ctxFor({ files: { "1": bad } })));
      expect(e.code).toBe("store.unexpected-response");
    }
    const big = new Uint8Array(8 * 1024 * 1024 + 1).fill(0x20);
    expect((await fail(run(ctxFor({ files: { "1": big } })))).code).toBe("scan.root-unreadable");
  });

  it("caps 1000 collections and 100 000 distinct appids, and groups repeated Steam ids", async () => {
    const pair = (id: string, added: number[]) => ["user-collections." + id, { value: JSON.stringify({ id, name: id, added }) }];
    const many = Array.from({ length: 1002 }, (_, i) => pair("c" + i, [1]));
    many.push(pair("c0", [2]));
    const s1 = await run(ctxFor({ files: { "1": JSON.stringify(many) } }));
    expect(s1.collections).toHaveLength(1000);
    expect(s1.skipped.limitSnapshot).toBe(2);
    expect(s1.collections[0]!.storeGameIds).toEqual(["1"]); // first wins

    const ids = Array.from({ length: 100_005 }, (_, i) => i + 1);
    const s2 = await run(ctxFor({ files: { "1": JSON.stringify([pair("big", ids)]) } }));
    expect(s2.collections[0]!.storeGameIds).toHaveLength(100_000);
    expect(s2.skipped.limitIds).toBe(5);
  });
});

describe("importCollections: sourceId (ADR 88)", () => {
  const entry = (id: unknown, name: string) => ["user-collections.k", { value: JSON.stringify({ id, name, added: [1] }) }];
  const file = (...e: unknown[]) => JSON.stringify(e);

  it("is stable and a rename keeps it", async () => {
    const a = await run(ctxFor({ files: { "1": file(entry("uc-x", "Antes")) } }));
    const b = await run(ctxFor({ files: { "1": file(entry("uc-x", "Despues")) } }));
    expect([a.collections[0]!.sourceId, b.collections[0]!.sourceId]).toEqual(["uc-x", "uc-x"]);
    expect(b.collections[0]!.name).toBe("Despues");
    const sp = await run(ctxFor({ files: { "1": file(entry(" a", "S")) } }));
    expect(sp.collections).toEqual([]); // no space in sourceId
    expect(sp.skipped.invalid).toBe(1);
  });

  it("skips and counts invalid or repeated ids; deleted ones still count as deleted", async () => {
    const del = ["user-collections.d", { value: JSON.stringify({ id: "d", name: "D", added: [1] }), is_deleted: true }];
    const bad = ["", "x".repeat(65), "tab	here", "é", 5, null];
    const snap = await run(ctxFor({ files: { "1": file(...bad.map((id) => entry(id, "N")), entry("ok", "A"), entry("ok", "B"), del) } }));
    expect(snap.collections.map((x) => [x.sourceId, x.name])).toEqual([["ok", "A"]]);
    expect(snap.skipped.invalid).toBe(bad.length + 1);
    expect(snap.skipped.deleted).toBe(1);
  });
});

describe("importCollections: account selection", () => {
  const OK = "[]";
  it("uses the connected account, searched in every steam-root, and never falls back", async () => {
    const f2 = P(ROOT2, "userdata", "22222222", ...FILE);
    const mk = (files: Record<string, string>, steamId: string) => ctxFor({ roots: [STEAM_ROOT, ROOT2], files, steamId });
    const snap = await run(mk({ [f2]: OK, "11111111": OK }, steamIdOf(22222222)));
    expect(snap.accountSource).toBe("connected");
    const e = await fail(run(mk({ "11111111": OK }, steamIdOf(22222222))));
    expect(e.code).toBe("scan.root-unreadable");
    expect(e.details.messageKey).toBe("connectors.steam.collections.accountNotFound");
  });

  it("without a connected account: one folder works; 0, non-numeric and too large folders are ignored", async () => {
    const d = (n: string) => P(STEAM_ROOT, "userdata", n, ...FILE);
    const ctx = ctxFor({ files: { "11111111": OK, [d("0")]: OK, [d("abc")]: OK, [d("4294967296")]: OK } });
    expect((await run(ctx)).accountSource).toBe("single-folder");
    const reads = (ctx.fs as MemoryFiles).reads;
    expect(reads.length).toBeGreaterThan(0);
    for (const r of reads) expect(r.toLowerCase().startsWith(P(STEAM_ROOT, "userdata").toLowerCase())).toBe(true); // never outside userdata
  });

  it("none is not-found and several is ambiguous (scan.root-unreadable, 422 keys)", async () => {
    const none = await fail(run(ctxFor({ dirs: [P(STEAM_ROOT, "userdata", "5") + SEP] })));
    expect([none.code, none.details.messageKey]).toEqual(["scan.root-unreadable", "connectors.steam.collections.notFound"]);
    const many = await fail(run(ctxFor({ files: { "1": OK, "2": OK } })));
    expect([many.code, many.details.messageKey]).toEqual(["scan.root-unreadable", "connectors.steam.collections.ambiguous"]);
  });

  it("a junction folder is skipped and counted without account, and is not-found with one", async () => {
    const junction = P(STEAM_ROOT, "userdata", "2");
    const files = { "1": OK, "2": OK };
    const ctx = ctxFor({ files, escaping: [junction] });
    expect((await run(ctx)).accountSource).toBe("single-folder");
    expect(ctx.logs.some((l) => (l.fields as { escapedFolders?: number })?.escapedFolders === 1)).toBe(true);
    const e = await fail(run(ctxFor({ files: { "2": OK }, escaping: [junction], steamId: steamIdOf(2) })));
    expect(e.details.messageKey).toBe("connectors.steam.collections.notFound"); // unreadable is not absent: no mirror deletion
    // a junction at userdata itself
    expect(PathEscapesRootsError).toBeDefined();
    const e2 = await fail(run(ctxFor({ files: { "2": OK }, escaping: [P(STEAM_ROOT, "userdata")] })));
    expect(e2.details.messageKey).toBe("connectors.steam.collections.notFound");
  });

  it("an unusable SteamID is not-found, not a fallback", async () => {
    for (const steamId of ["12345", steamIdOf(0), String(76561197960265728n + 4294967296n)]) {
      const e = await fail(run(ctxFor({ files: { "1": OK }, steamId })));
      expect(e.details.messageKey).toBe("connectors.steam.collections.notFound");
    }
  });
});

describe("importCollections: nothing from the file reaches errors or logs (ADR 87 point 13, ALTO)", () => {
  const SECRET_NAME = "Nombre Secreto Inventado";
  const cut = JSON.stringify([["user-collections.x", { value: JSON.stringify({ id: "x", name: SECRET_NAME }) }]]).slice(0, -12);

  it("outer JSON cut right after a name: fixed message, no cause, no text in the log", async () => {
    const ctx = ctxFor({ files: { "11111111": cut }, steamId: steamIdOf(11111111) });
    const e = await fail(run(ctx));
    expect(e.code).toBe("store.unexpected-response");
    expect(e.cause).toBeUndefined();
    expect(e.details.cause).toBeUndefined();
    const all = JSON.stringify([e.message, e.details, e.stack, ctx.logs]);
    for (const s of [SECRET_NAME, "Secreto", "Unexpected", "position", "11111111", steamIdOf(11111111)]) expect(all).not.toContain(s);
  });

  it("inner value cut: counted invalid, rest survives, no text in the log", async () => {
    const text = JSON.stringify([
      ["user-collections.x", { value: `{"id":"x","name":"${SECRET_NAME}` }],
      ["user-collections.y", { value: JSON.stringify({ id: "y", name: "Ok", added: [1] }) }],
    ]);
    const ctx = ctxFor({ files: { "11111111": text } });
    const snap = await run(ctx);
    expect(snap.skipped.invalid).toBe(1);
    expect(snap.collections.map((x) => x.name)).toEqual(["Ok"]);
    const all = JSON.stringify(ctx.logs);
    for (const s of [SECRET_NAME, "Ok", "11111111", "250900", STEAM_ROOT]) expect(all).not.toContain(s);
  });

  it("the success log has counters only", async () => {
    const ctx = ctxFor({ files: { "11111111": fixtureText }, steamId: steamIdOf(11111111) });
    await run(ctx);
    const all = JSON.stringify(ctx.logs);
    for (const s of ["RPG", "constructor", "Pendientes", "250900", "620", "11111111", "Steam\\\\", steamIdOf(11111111)]) expect(all).not.toContain(s);
    for (const l of ctx.logs) for (const v of Object.values((l.fields ?? {}) as Record<string, unknown>)) expect(["number", "string"]).toContain(typeof v);
  });
});
