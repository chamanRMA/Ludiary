// Favorites, tags and collections in the database (ADR 85 points 4, 6, 9, 12).
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type Database from "better-sqlite3";
import type { CollectionMirrorInput, Label, LibraryEntry, LibraryPlan, SyncStateRecord } from "@ludiary/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRepositories, MIGRATIONS, migrate, openDatabase, type Repositories } from "../src";

let dir = "";
let sqlite: Database.Database;
let repos: Repositories;
const warn = vi.fn();
let n = 0;
const newId = () => `id-${++n}`;

beforeEach(async () => {
  n = 0;
  warn.mockClear();
  dir = mkdtempSync(join(tmpdir(), "ludiary-userdata-"));
  sqlite = openDatabase(join(dir, "ludiary.sqlite"), undefined);
  await migrate(sqlite, { backupDir: join(dir, "backups") });
  repos = createRepositories(sqlite, { warn });
  await repos.identity.ensure(newId, 1);
});
afterEach(() => {
  sqlite.close();
  rmSync(dir, { recursive: true, force: true });
});

const sync = (at: number): SyncStateRecord => ({ store: "gog", operation: "library", lastAttemptAt: at, lastSuccessAt: at, status: "idle", error: null, nextAllowedAt: at + 1 });
const game = (id: string, title: string): LibraryEntry => ({ storeGameId: id, kind: "game", title, normalizedTitle: title.toLowerCase(), storePlaytimeMinutes: null, storeLastPlayedAt: null });
const plan = (at: number, p: Partial<LibraryPlan>): LibraryPlan => ({ store: "gog", at, create: [], update: [], disown: [], retire: [], kindChanges: [], dlcLinks: [], sync: sync(at), ...p });
/** Games 1..count: canonical `c<i>`, property `p<i>`, store id `<i>`. */
const seed = (count: number) =>
  repos.library.applyLibraryPlan(plan(10, { create: Array.from({ length: count }, (_, i) => ({ canonicalId: `c${i + 1}`, propertyId: `p${i + 1}`, entry: game(String(i + 1), `Game ${i + 1}`) })) }));
const label = (name: string): Label => ({ name, key: name.normalize("NFKC").toLowerCase() });
const count = (table: string) => (sqlite.prepare(`SELECT count(*) AS n FROM ${table}`).get() as { n: number }).n;
const tagNames = (id: string) => repos.library.getGame(id).then((g) => g?.tags);
const at = 100;

describe("migration 0004_user_data", () => {
  it("adds the tables to a database with data, keeping it, and every key to a game cascades", async () => {
    const other = openDatabase(join(dir, "old.sqlite"), undefined);
    await migrate(other, { backupDir: join(dir, "b2"), migrations: MIGRATIONS.slice(0, 4) });
    other.exec("INSERT INTO users (id, created_at) VALUES ('u', 1)");
    other.exec("INSERT INTO canonical_games (id, user_id, title, normalized_title, created_at, updated_at) VALUES ('c', 'u', 'T', 't', 1, 1)");
    await migrate(other, { backupDir: join(dir, "b2") });
    expect(other.prepare("SELECT id FROM canonical_games").all()).toEqual([{ id: "c" }]);
    for (const t of ["user_game_data", "game_tags", "collection_games"]) {
      const fks = other.prepare(`PRAGMA foreign_key_list(${t})`).all() as { table: string; on_delete: string }[];
      expect(fks.filter((f) => f.table !== "users").every((f) => f.on_delete === "CASCADE"), t).toBe(true);
    }
    other.close();
  });
});

describe("updateGame", () => {
  it("favorite on writes a row and off deletes it", async () => {
    await seed(1);
    await repos.userData.updateGame("c1", { favorite: true }, at);
    expect((await repos.library.getGame("c1"))?.favorite).toBe(true);
    expect(count("user_game_data")).toBe(1);
    await repos.userData.updateGame("c1", { favorite: false }, at);
    expect((await repos.library.getGame("c1"))?.favorite).toBe(false);
    expect(count("user_game_data")).toBe(0);
  });

  it("reuses a tag by key with its first spelling, orders by key and deletes tags left without games", async () => {
    await seed(3);
    await repos.userData.updateGame("c1", { tags: [label("Cooperativo"), label("RPG")] }, at);
    await repos.userData.updateGame("c2", { tags: [label("cooperativo")] }, at);
    expect(await tagNames("c1")).toEqual(["Cooperativo", "RPG"]);
    expect(await tagNames("c2")).toEqual(["Cooperativo"]);
    expect(count("tags")).toBe(2);
    await repos.userData.updateGame("c1", { tags: [label("cooperativo")] }, at);
    expect(count("tags")).toBe(1); // RPG lost its last game
    await repos.userData.updateGame("c1", { tags: [] }, at);
    await repos.userData.updateGame("c2", { tags: [] }, at);
    expect(count("tags")).toBe(0);
    expect(count("game_tags")).toBe(0);
  });

  it("puts a game at the end of each new collection and keeps the position of those it stays in", async () => {
    await seed(3);
    const a = await repos.userData.createCollection(label("Pendientes"), at);
    const b = await repos.userData.createCollection(label("Amigos"), at);
    await repos.userData.updateGame("c1", { collectionIds: [a.id] }, at);
    await repos.userData.updateGame("c2", { collectionIds: [a.id, b.id] }, at);
    await repos.userData.updateGame("c3", { collectionIds: [a.id] }, at);
    await repos.userData.updateGame("c1", { collectionIds: [a.id, b.id] }, at); // stays in a (position 1), joins b after c2
    expect((await repos.userData.listCollections()).map((c) => [c.name, c.gameIds])).toEqual([
      ["Pendientes", ["c1", "c2", "c3"]],
      ["Amigos", ["c2", "c1"]],
    ]);
    await repos.userData.updateGame("c2", { collectionIds: [b.id] }, at); // a now has a gap at 2
    await repos.userData.updateGame("c2", { collectionIds: [a.id, b.id] }, at);
    expect((await repos.userData.listCollections())[0]!.gameIds).toEqual(["c1", "c3", "c2"]);
    expect((await repos.library.getGame("c1"))?.collections).toEqual([{ id: a.id, name: "Pendientes", source: null }, { id: b.id, name: "Amigos", source: null }]);
  });

  it("is not-found, changing nothing, when the game is not shown or a collection does not exist", async () => {
    await seed(1);
    await expect(repos.userData.updateGame("nope", { favorite: true }, at)).rejects.toMatchObject({ code: "not-found" });
    await expect(repos.userData.updateGame("c1", { favorite: true, tags: [label("x")], collectionIds: ["gone"] }, at)).rejects.toMatchObject({ code: "not-found" });
    expect(count("user_game_data") + count("tags") + count("game_tags")).toBe(0);
    await repos.library.applyLibraryPlan(plan(20, { disown: ["p1"], retire: ["p1"] }));
    await expect(repos.userData.updateGame("c1", { favorite: true }, at)).rejects.toMatchObject({ code: "not-found" });
  });

  it("lets a game left above 20 tags by a merge shrink, but never grow", async () => {
    await seed(1);
    const set = (n: number) => Array.from({ length: n }, (_, i) => label(`t${i}`));
    await repos.userData.updateGame("c1", { tags: set(20) }, at);
    await expect(repos.userData.updateGame("c1", { tags: set(21) }, at)).rejects.toMatchObject({ code: "limit-reached", params: { max: 20 } });
    // A merge can leave 25: simulate it with rows.
    for (let i = 20; i < 25; i++) {
      sqlite.prepare("INSERT INTO tags (id, user_id, name, name_key, created_at) VALUES (?, (SELECT id FROM users), ?, ?, 1)").run(`m${i}`, `t${i}`, `t${i}`);
      sqlite.prepare("INSERT INTO game_tags (canonical_game_id, tag_id, user_id) VALUES ('c1', ?, (SELECT id FROM users))").run(`m${i}`);
    }
    await expect(repos.userData.updateGame("c1", { tags: set(26) }, at)).rejects.toMatchObject({ code: "limit-reached" });
    await repos.userData.updateGame("c1", { tags: set(24) }, at);
    expect((await repos.library.getGame("c1"))?.tags).toHaveLength(24);
  });

  it("refuses more tags than the limits allow", async () => {
    await seed(1);
    await expect(repos.userData.updateGame("c1", { tags: Array.from({ length: 21 }, (_, i) => label(`t${i}`)) }, at)).rejects.toMatchObject({ code: "limit-reached", params: { max: 20 } });
    const insert = sqlite.prepare("INSERT INTO tags (id, user_id, name, name_key, created_at) VALUES (?, (SELECT id FROM users), ?, ?, 1)");
    for (let i = 0; i < 1000; i++) insert.run(`x${i}`, `x${i}`, `x${i}`);
    await expect(repos.userData.updateGame("c1", { tags: [label("new")] }, at)).rejects.toMatchObject({ code: "limit-reached", params: { max: 1000 } });
  });
});

describe("collections", () => {
  it("creates in order, refuses a repeated key and the 201st, renames to its own key and deletes without touching games or tags", async () => {
    await seed(1);
    const a = await repos.userData.createCollection(label("Pendientes"), at);
    await expect(repos.userData.createCollection(label("PENDIENTES"), at)).rejects.toMatchObject({ code: "name-taken" });
    const b = await repos.userData.createCollection(label("Amigos"), at);
    expect((await repos.userData.renameCollection(a.id, label("PENDIENTES"), at)).name).toBe("PENDIENTES");
    await expect(repos.userData.renameCollection(a.id, label("amigos"), at)).rejects.toMatchObject({ code: "name-taken" });
    await expect(repos.userData.renameCollection("gone", label("x"), at)).rejects.toMatchObject({ code: "not-found" });
    expect((await repos.userData.listCollections()).map((c) => c.id)).toEqual([a.id, b.id]);
    await repos.userData.updateGame("c1", { tags: [label("t")], collectionIds: [a.id] }, at);
    await repos.userData.deleteCollection(a.id);
    await repos.userData.deleteCollection(a.id); // twice is fine
    expect(count("collection_games")).toBe(0);
    expect((await repos.library.getGame("c1"))?.tags).toEqual(["t"]);
    for (let i = 0; i < 199; i++) await repos.userData.createCollection(label(`c${i}`), at);
    await expect(repos.userData.createCollection(label("one more"), at)).rejects.toMatchObject({ code: "limit-reached", params: { max: 200 } });
  });

  it("keeps the data of a game that goes away and comes back, and hides it from the collection meanwhile", async () => {
    await seed(2);
    const a = await repos.userData.createCollection(label("A"), at);
    await repos.userData.updateGame("c1", { favorite: true, tags: [label("t")], collectionIds: [a.id] }, at);
    await repos.userData.updateGame("c2", { collectionIds: [a.id] }, at);
    await repos.library.applyLibraryPlan(plan(20, { disown: ["p1"], retire: ["p1"] }));
    expect((await repos.userData.listCollections())[0]!.gameIds).toEqual(["c2"]);
    expect((await repos.library.listLibrary()).map((g) => g.id)).toEqual(["c2"]);
    expect(count("tags")).toBe(1); // a tag of a game that is not shown stays
    await repos.library.applyLibraryPlan(plan(30, { update: [{ propertyId: "p1", entry: game("1", "Game 1") }] }));
    const back = await repos.library.getGame("c1");
    expect([back?.favorite, back?.tags, back?.collections.length]).toEqual([true, ["t"], 1]);
    expect((await repos.userData.listCollections())[0]!.gameIds).toEqual(["c1", "c2"]);
  });
});

describe("reading without a query per game", () => {
  it("runs the same number of statements for 3 games as for 40", async () => {
    const statements = async () => {
      const spy = vi.spyOn(sqlite, "prepare");
      await repos.library.listLibrary();
      const calls = spy.mock.calls.length;
      spy.mockRestore();
      return calls;
    };
    await seed(3);
    await repos.userData.updateGame("c1", { favorite: true, tags: [label("t")] }, at);
    const few = await statements();
    await repos.library.applyLibraryPlan(plan(15, { create: Array.from({ length: 37 }, (_, i) => ({ canonicalId: `d${i}`, propertyId: `q${i}`, entry: game(`x${i}`, `Extra ${i}`) })) }));
    for (let i = 0; i < 37; i += 2) await repos.userData.updateGame(`d${i}`, { favorite: true, tags: [label(`t${i}`)] }, at);
    expect(await statements()).toBe(few);
  });
});

describe("a game that becomes DLC (ADR 83 M1, ADR 85 point 6.2, 12)", () => {
  const dlcEntry = (id: string, title: string, base: string | null): LibraryEntry => ({ ...game(id, title), kind: "dlc", baseStoreGameId: base });

  it("moves favorite, tags and collections to the base game, keeping the lower position", async () => {
    await seed(2);
    const a = await repos.userData.createCollection(label("A"), at);
    await repos.userData.updateGame("c2", { favorite: true, tags: [label("x"), label("shared")], collectionIds: [a.id] }, at);
    await repos.userData.updateGame("c1", { tags: [label("y"), label("shared")], collectionIds: [a.id] }, at);
    await repos.library.applyLibraryPlan(plan(20, { update: [{ propertyId: "p2", entry: dlcEntry("2", "Game 2", "1") }], kindChanges: [{ propertyId: "p2", kind: "dlc", canonicalId: "c1" }] }));
    const base = await repos.library.getGame("c1");
    expect([base?.favorite, base?.tags]).toEqual([true, ["shared", "x", "y"]]);
    expect((await repos.userData.listCollections())[0]).toMatchObject({ gameIds: ["c1"] });
    expect(sqlite.prepare("SELECT position FROM collection_games").all()).toEqual([{ position: 1 }]);
    expect(count("canonical_games")).toBe(1);
    expect(warn).not.toHaveBeenCalled();
  });

  it("deletes the data, counting it in the log without names, when the DLC has no base game, and the tags left without games", async () => {
    await seed(2);
    const a = await repos.userData.createCollection(label("Secret name"), at);
    await repos.userData.updateGame("c2", { favorite: true, tags: [label("only-here")], collectionIds: [a.id] }, at);
    await repos.userData.updateGame("c1", { tags: [label("kept")] }, at);
    await repos.library.applyLibraryPlan(plan(20, { update: [{ propertyId: "p2", entry: dlcEntry("2", "Game 2", null) }], kindChanges: [{ propertyId: "p2", kind: "dlc", canonicalId: null }] }));
    expect(count("canonical_games")).toBe(1);
    expect([count("user_game_data"), count("collection_games"), count("collections")]).toEqual([0, 0, 1]);
    expect(sqlite.prepare("SELECT name FROM tags").all()).toEqual([{ name: "kept" }]);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]![1]).toEqual({ userDataDropped: 1 });
    expect(JSON.stringify(warn.mock.calls)).not.toMatch(/only-here|Secret/);
  });
});

describe("mergeUserData", () => {
  it("unites favorite, tags and collections, with the lower position where both were", async () => {
    await seed(2);
    const a = await repos.userData.createCollection(label("A"), at);
    const b = await repos.userData.createCollection(label("B"), at);
    await repos.userData.updateGame("c1", { tags: [label("x")], collectionIds: [a.id] }, at);
    await repos.userData.updateGame("c2", { favorite: true, tags: [label("x"), label("y")], collectionIds: [a.id, b.id] }, at);
    await repos.userData.mergeUserData("c2", "c1", at);
    const to = await repos.library.getGame("c1");
    expect([to?.favorite, to?.tags, to?.collections.map((c) => c.name)]).toEqual([true, ["x", "y"], ["A", "B"]]);
    expect(sqlite.prepare("SELECT collection_id AS c, position AS p FROM collection_games WHERE canonical_game_id = 'c1' ORDER BY c").all()).toEqual([{ c: a.id, p: 1 }, { c: b.id, p: 1 }].sort((x, y) => (x.c < y.c ? -1 : 1))); // ids are random UUIDs
  });
});


describe("migration 0006_collection_source (ADR 88)", () => {
  it("adds the origin on top of a database that has 0005_user_data, keeps own collections and makes the name unique only among them", async () => {
    const old = openDatabase(join(dir, "v5.sqlite"), undefined);
    await migrate(old, { backupDir: join(dir, "b5"), migrations: MIGRATIONS.slice(0, 5) });
    old.exec("INSERT INTO users (id, created_at) VALUES ('u', 1)");
    old.exec("INSERT INTO collections (id, user_id, name, name_key, position, created_at, updated_at) VALUES ('own', 'u', 'RPG', 'rpg', 1, 1, 1)");
    const res = await migrate(old, { backupDir: join(dir, "b5") });
    expect(res.applied).toEqual(["0006_collection_source"]);
    expect(res.backupFile).toBeTruthy(); // a copy first (ADR 57)
    expect(old.prepare("SELECT id, source_store AS s, source_id AS i FROM collections").all()).toEqual([{ id: "own", s: null, i: null }]);
    const ins = (id: string, key: string, store: string | null, source: string | null) =>
      old.prepare("INSERT INTO collections (id, user_id, name, name_key, position, created_at, updated_at, source_store, source_id) VALUES (?, 'u', 'RPG', ?, 1, 1, 1, ?, ?)").run(id, key, store, source);
    ins("m1", "rpg", "steam", "uc-1"); // a mirror with the same name as the own one
    ins("m2", "rpg", "steam", "uc-2"); // and two mirrors with the same name
    expect(() => ins("o2", "rpg", null, null)).toThrow(/UNIQUE/);
    expect(() => ins("m3", "x", "steam", "uc-1")).toThrow(/UNIQUE/);
    old.close();
  });

  it("changes no table by rebuilding it: the generated SQL is ADD COLUMN and indexes only", () => {
    const sql = MIGRATIONS.find((m) => m.id === "0006_collection_source")!.statements.join("\n");
    expect(sql).not.toMatch(/CREATE TABLE|DROP TABLE|RENAME/i);
    expect(sql.match(/ALTER TABLE `collections` ADD/g)).toHaveLength(2);
  });
});

const input = (over: Partial<CollectionMirrorInput> = {}): CollectionMirrorInput => ({
  collections: [], protectedSourceIds: [], favorites: [], favoritesAllowed: true, accountSource: "connected", blockDeletes: false, emptySnapshot: false, ...over,
});
const mirror = (sourceId: string, name: string, gameIds: string[]) => ({ sourceId, name, key: name.normalize("NFKC").toLowerCase(), gameIds });
const members = (name: string) =>
  (sqlite.prepare("SELECT cg.canonical_game_id AS g FROM collection_games cg JOIN collections c ON c.id = cg.collection_id WHERE c.name = ? ORDER BY cg.position").all(name) as { g: string }[]).map((r) => r.g);
const apply = (i: CollectionMirrorInput, when = at) => repos.userData.applyCollectionMirror("steam", i, when);
const names = () => (sqlite.prepare("SELECT name FROM collections ORDER BY position").all() as { name: string }[]).map((r) => r.name);
/** Everything a quiet pass must not touch: rows, links, settings, favorites. */
const fingerprint = () => JSON.stringify(["collections", "collection_games", "settings", "user_game_data"].map((t) => sqlite.prepare(`SELECT * FROM ${t} ORDER BY 1, 2`).all()));
const setting = (name: string) => repos.settings.get(`collections.steam.${name}`);
const fav = (id: string) => repos.library.getGame(id).then((g) => g?.favorite);

describe("own collections next to mirrors (ADR 88 point 15)", () => {
  it("an own 'RPG' and a mirror 'RPG' live together; create and rename only look at the own ones", async () => {
    await seed(2);
    await apply(input({ collections: [mirror("uc-1", "RPG", ["c1"])] }));
    const own = await repos.userData.createCollection(label("RPG"), at);
    expect(own).toMatchObject({ name: "RPG", source: null });
    await expect(repos.userData.createCollection(label("rpg"), at)).rejects.toMatchObject({ code: "name-taken" });
    const other = await repos.userData.createCollection(label("Other"), at);
    await expect(repos.userData.renameCollection(other.id, label("RPG"), at)).rejects.toMatchObject({ code: "name-taken" });
    expect((await repos.userData.listCollections()).map((c) => [c.name, c.source])).toEqual([["RPG", "steam"], ["RPG", null], ["Other", null]]);
  });

  it("renaming or deleting a mirror is 'collection-managed' and changes nothing", async () => {
    await seed(1);
    await apply(input({ collections: [mirror("uc-1", "A", ["c1"])] }));
    const id = (await repos.userData.listCollections())[0]!.id;
    const before = fingerprint();
    await expect(repos.userData.renameCollection(id, label("B"), at)).rejects.toMatchObject({ code: "collection-managed", key: "core.errors.collectionManaged" });
    await expect(repos.userData.deleteCollection(id)).rejects.toMatchObject({ code: "collection-managed" });
    expect(fingerprint()).toBe(before);
    await repos.userData.deleteCollection("nope"); // missing: still fine
  });

  it("setting the collections of a game ignores mirror ids without a false 404 and keeps its mirror memberships", async () => {
    await seed(2);
    await apply(input({ collections: [mirror("uc-1", "M", ["c1"])] }));
    const mirrorId = (await repos.userData.listCollections())[0]!.id;
    const own = await repos.userData.createCollection(label("Own"), at);
    await repos.userData.updateGame("c1", { collectionIds: [own.id, mirrorId] }, at);
    expect(members("Own")).toEqual(["c1"]);
    expect(members("M")).toEqual(["c1"]);
    await repos.userData.updateGame("c1", { collectionIds: [] }, at); // removes the own one only
    expect(members("Own")).toEqual([]);
    expect(members("M")).toEqual(["c1"]);
    await repos.userData.updateGame("c2", { collectionIds: [mirrorId] }, at); // asking for a mirror adds nothing
    expect(members("M")).toEqual(["c1"]);
    await expect(repos.userData.updateGame("c2", { collectionIds: [mirrorId, "ghost"] }, at)).rejects.toMatchObject({ code: "not-found" });
    expect((await repos.library.getGame("c1"))?.collections.map((c) => [c.name, c.source])).toEqual([["M", "steam"]]);
  });

  it("200 own collections and 200 mirrors do not get in each other's way", async () => {
    await seed(1);
    const many = () => input({ collections: Array.from({ length: 201 }, (_, i) => mirror(`s${i}`, `S${i}`, ["c1"])) });
    expect(await apply(many())).toMatchObject({ collectionsCreated: 200, limitCollections: 1 });
    for (let i = 0; i < 200; i++) await repos.userData.createCollection(label(`C${i}`), at);
    expect(count("collections")).toBe(400);
    await expect(repos.userData.createCollection(label("one more"), at)).rejects.toMatchObject({ code: "limit-reached" });
    expect(await apply(many(), at + 1)).toMatchObject({ collectionsCreated: 0, limitCollections: 1 });
  });
});

describe("findVisibleCanonicals and applyCollectionMirror (ADR 88)", () => {
  it("reads the games that are shown and the DLC in one go, leaving out retired properties", async () => {
    await seed(3);
    await repos.library.applyLibraryPlan(plan(20, { create: [{ canonicalId: null, propertyId: "d1", entry: { ...game("90", "DLC"), kind: "dlc" } }], retire: ["p3"], disown: ["p3"] }));
    const known = await repos.library.findVisibleCanonicals("gog");
    expect([...known.games.entries()].sort()).toEqual([["1", "c1"], ["2", "c2"]]);
    expect([...known.dlc]).toEqual(["90"]);
    expect((await repos.library.findVisibleCanonicals("steam")).games.size).toBe(0);
  });

  it("creates mirrors at the end, renames by source id, adds and removes games, reorders, deletes", async () => {
    await seed(4);
    await repos.userData.createCollection(label("Mine"), at);
    const first = await apply(input({ collections: [mirror("uc-1", "RPG", ["c1", "c2", "c3"]), mirror("uc-2", "Coop", ["c4"]), mirror("uc-9", "Empty", []), mirror("uc-3", "Soon gone", ["c1"])] }));
    expect(first).toMatchObject({ collectionsCreated: 3, gamesAdded: 5, empty: 1 });
    expect(names()).toEqual(["Mine", "RPG", "Coop", "Soon gone"]);
    expect(members("RPG")).toEqual(["c1", "c2", "c3"]);
    const id = (await repos.userData.listCollections()).find((c) => c.name === "RPG")!.id;

    const second = await apply(input({ collections: [mirror("uc-1", "Role playing", ["c3", "c1", "c4"]), mirror("uc-2", "Coop", ["c4"])] }), at + 1);
    expect(second).toMatchObject({ collectionsRenamed: 1, collectionsDeleted: 1, gamesAdded: 1, gamesRemoved: 1, collectionsCreated: 0 });
    expect(names()).toEqual(["Mine", "Role playing", "Coop"]);
    expect(members("Role playing")).toEqual(["c3", "c1", "c4"]);
    expect((await repos.userData.listCollections()).find((c) => c.name === "Role playing")!.id).toBe(id); // the id survives a rename
    expect(members("Mine")).toEqual([]);
  });

  it("never touches own collections, their games, names or positions", async () => {
    await seed(2);
    const own = await repos.userData.createCollection(label("RPG"), at);
    await repos.userData.updateGame("c2", { collectionIds: [own.id] }, at);
    const own1 = JSON.stringify(sqlite.prepare("SELECT * FROM collections WHERE source_store IS NULL").all());
    await apply(input({ collections: [mirror("uc-1", "RPG", ["c1"])] }), at + 5);
    await apply(input({ collections: [], emptySnapshot: false }), at + 6); // Steam deleted its collection
    expect(JSON.stringify(sqlite.prepare("SELECT * FROM collections WHERE source_store IS NULL").all())).toBe(own1);
    expect(sqlite.prepare("SELECT canonical_game_id AS g FROM collection_games WHERE collection_id = ?").all(own.id)).toEqual([{ g: "c2" }]);
  });

  it("a pass without changes writes nothing at all", async () => {
    await seed(3);
    const data = input({ collections: [mirror("uc-1", "A", ["c1", "c2"])], favorites: [{ storeGameId: "1", canonicalId: "c1" }] });
    await apply(data);
    const before = fingerprint();
    const writes = (sqlite.prepare("SELECT total_changes() AS n").get() as { n: number }).n;
    const r = await apply(data, at + 50);
    expect(r).toMatchObject({ collectionsCreated: 0, collectionsRenamed: 0, collectionsDeleted: 0, gamesAdded: 0, gamesRemoved: 0, favoritesAdded: 0 });
    expect(fingerprint()).toBe(before);
    expect((sqlite.prepare("SELECT total_changes() AS n").get() as { n: number }).n).toBe(writes);
  });

  it("writes nothing when the setting is off inside the transaction", async () => {
    await seed(1);
    await repos.settings.set("collections.steam.enabled", false);
    const before = fingerprint();
    const r = await apply(input({ collections: [mirror("uc-1", "A", ["c1"])], favorites: [{ storeGameId: "1", canonicalId: "c1" }] }));
    expect(r.off).toBe(true);
    expect(fingerprint()).toBe(before);
    expect(await setting("mirrorAccountSource")).toBeUndefined();
  });

  it("guards: a blocked pass creates and updates but never deletes; a protected mirror stays", async () => {
    await seed(2);
    await apply(input({ collections: [mirror("uc-1", "Keep", ["c1"]), mirror("uc-2", "Other", ["c2"])] }));
    const blocked = await apply(input({ collections: [mirror("uc-3", "New", ["c2"])], blockDeletes: true }), at + 1);
    expect(blocked).toMatchObject({ collectionsCreated: 1, collectionsDeleted: 0 });
    expect(names()).toEqual(["Keep", "Other", "New"]);
    const empty = await apply(input({ blockDeletes: true, emptySnapshot: true }), at + 2);
    expect(empty).toMatchObject({ emptySnapshotKept: 1, collectionsDeleted: 0 });
    const prot = await apply(input({ collections: [mirror("uc-3", "New", ["c2"])], protectedSourceIds: ["uc-1"] }), at + 3);
    expect(prot).toMatchObject({ collectionsDeleted: 1 }); // uc-2 only
    expect(names()).toEqual(["Keep", "New"]);
  });

  it("favorites: only new ones, never removed; a removed one does not come back, a re-added one does, a late one is marked", async () => {
    await seed(3);
    const f = (...ids: string[]) => ids.map((storeGameId) => ({ storeGameId, canonicalId: storeGameId === "9" ? null : `c${storeGameId}` }));
    await apply(input({ favorites: f("1", "2", "9") }));
    expect([await fav("c1"), await fav("c2")]).toEqual([true, true]);
    expect(await setting("favoritesSeen")).toEqual(["1", "2"]); // "9" is not in the library yet
    await repos.userData.updateGame("c1", { favorite: false }, at);
    await apply(input({ favorites: f("1", "2", "9") }), at + 1);
    expect(await fav("c1")).toBe(false);
    await apply(input({ favorites: f("2") }), at + 2); // c1 is no longer a favorite in Steam
    expect(await setting("favoritesSeen")).toEqual(["2"]);
    await apply(input({ favorites: f("1", "2") }), at + 3);
    expect(await fav("c1")).toBe(true);
    await apply(input({ favorites: [] }), at + 4); // Steam losing favorites never removes them here
    expect(await fav("c1")).toBe(true);
    await apply(input({ favorites: [{ storeGameId: "3", canonicalId: null }] }), at + 5);
    expect(await fav("c3")).toBe(false);
    await apply(input({ favorites: f("3") }), at + 6); // it arrived
    expect(await fav("c3")).toBe(true);
  });

  it("favorites are neither marked nor remembered when they are not allowed, and they are counted", async () => {
    await seed(2);
    const r = await apply(input({ favoritesAllowed: false, accountSource: "single-folder", favorites: [{ storeGameId: "1", canonicalId: "c1" }, { storeGameId: "2", canonicalId: "c2" }] }));
    expect(r).toMatchObject({ favoritesAdded: 0, favoritesPending: 2 });
    expect(await fav("c1")).toBe(false);
    expect(await setting("favoritesSeen")).toBeUndefined();
    expect(await setting("mirrorAccountSource")).toBe("single-folder");
  });

  it("deleteCollectionMirrors removes only that store's mirrors and the account source", async () => {
    await seed(1);
    await repos.userData.createCollection(label("Own"), at);
    await apply(input({ collections: [mirror("uc-1", "M", ["c1"])] }));
    expect(await repos.userData.deleteCollectionMirrors("steam")).toBe(1);
    expect((await repos.userData.listCollections()).map((c) => c.name)).toEqual(["Own"]);
    expect(await setting("mirrorAccountSource")).toBeUndefined();
    expect(count("collection_games")).toBe(0);
  });

  it("a game that disappears inside the transaction is left out and counted", async () => {
    await seed(2);
    const r = await apply(input({ collections: [mirror("uc-1", "A", ["c1", "ghost"])] }));
    expect(r).toMatchObject({ collectionsCreated: 1, gamesAdded: 1, gone: 1 });
  });
});
