// Price links, cache and follow list in the database (ADR 86 point 8, point 15 M7).
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type Database from "better-sqlite3";
import type { LibraryEntry, LibraryPlan, PriceLinkRecord, SyncStateRecord } from "@ludiary/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createRepositories, MIGRATIONS, migrate, openDatabase, type Repositories } from "../src";

let dir = "";
let sqlite: Database.Database;
let repos: Repositories;
beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), "ludiary-prices-"));
  sqlite = openDatabase(join(dir, "ludiary.sqlite"), undefined);
  await migrate(sqlite, { backupDir: join(dir, "backups") });
  let n = 0;
  repos = createRepositories(sqlite);
  await repos.identity.ensure(() => `id-${++n}`, 1);
});
afterEach(() => {
  sqlite.close();
  rmSync(dir, { recursive: true, force: true });
});

const sync: SyncStateRecord = { store: "gog", operation: "library", lastAttemptAt: 1, lastSuccessAt: 1, status: "idle", error: null, nextAllowedAt: 2 };
const entry = (id: string): LibraryEntry => ({ storeGameId: id, kind: "game", title: `Game ${id}`, normalizedTitle: `game ${id}`, storePlaytimeMinutes: null, storeLastPlayedAt: null });
const plan = (p: Partial<LibraryPlan>): LibraryPlan => ({ store: "gog", at: 1, create: [], update: [], disown: [], retire: [], kindChanges: [], dlcLinks: [], sync, ...p });
const seed = () => repos.library.applyLibraryPlan(plan({ create: [1, 2].map((i) => ({ canonicalId: `c${i}`, propertyId: `p${i}`, entry: entry(String(i)) })) }));
const link = (over: Partial<PriceLinkRecord> = {}): PriceLinkRecord => ({ canonicalGameId: "c1", service: "itad", serviceGameId: "uuid-1", status: "found", source: "steam", inputsHash: "h", lookedUpAt: 5, ...over });
const rows = (t: string) => (sqlite.prepare(`SELECT count(*) AS n FROM ${t}`).get() as { n: number }).n;

describe("migration 0007_prices", () => {
  it("adds the tables on top of 0006_collection_source with data, keeping it, and foreign_key_check is clean", async () => {
    const old = openDatabase(join(dir, "old.sqlite"), undefined);
    await migrate(old, { backupDir: join(dir, "b"), migrations: MIGRATIONS.slice(0, 6) });
    old.exec("INSERT INTO users (id, created_at) VALUES ('u', 1)");
    old.exec("INSERT INTO canonical_games (id, user_id, title, normalized_title, created_at, updated_at) VALUES ('c', 'u', 'T', 't', 1, 1)");
    const res = await migrate(old, { backupDir: join(dir, "b") });
    expect(res.applied).toEqual(["0007_prices", "0008_watch_media", "0009_watch_origin"]);
    expect(res.backupFile).toBeTruthy();
    expect(old.prepare("SELECT id FROM canonical_games").all()).toEqual([{ id: "c" }]);
    expect(old.pragma("foreign_key_check")).toEqual([]);
    for (const t of ["price_links", "price_snapshots", "price_watch"]) {
      const fks = old.prepare(`PRAGMA foreign_key_list(${t})`).all() as { table: string }[];
      expect(fks.some((f) => f.table === "users"), t).toBe(true);
    }
    old.close();
  });
});

describe("migration 0008_watch_media (ADR 86 point 17)", () => {
  it("keeps the follow list of 0007_prices, leaves the new columns null and limits their length", async () => {
    const old = openDatabase(join(dir, "old2.sqlite"), undefined);
    await migrate(old, { backupDir: join(dir, "b2"), migrations: MIGRATIONS.slice(0, 7) });
    old.exec("INSERT INTO users (id, created_at) VALUES ('u', 1)");
    old.exec("INSERT INTO price_watch (id, user_id, service, service_game_id, title, type, added_at) VALUES ('w', 'u', 'itad', 'g', 'T', NULL, 1)");
    expect((await migrate(old, { backupDir: join(dir, "b2"), migrations: MIGRATIONS.slice(0, 8) })).applied).toEqual(["0008_watch_media"]);
    expect(old.prepare("SELECT id, title, cover_url, cover_fallback_url FROM price_watch").all()).toEqual([{ id: "w", title: "T", cover_url: null, cover_fallback_url: null }]);
    expect(old.pragma("foreign_key_check")).toEqual([]);
    const put = (col: string, len: number) => old.prepare(`INSERT INTO price_watch (id, user_id, service, service_game_id, title, added_at, ${col}) VALUES (?, 'u', 'itad', ?, 'T', 1, ?)`).run(`x${col}${len}`, `g${col}${len}`, "h".repeat(len));
    put("cover_url", 2048);
    put("cover_fallback_url", 2048);
    expect(() => put("cover_url", 2049)).toThrow(/CHECK/);
    expect(() => put("cover_fallback_url", 2049)).toThrow(/CHECK/);
    old.close();
  });
  it("saves and reads the covers of a followed item", async () => {
    await repos.prices.addWatch({ id: "w1", service: "itad", serviceGameId: "g1", title: "T", type: null, coverUrl: "https://a.example/c", coverFallbackUrl: "https://a.example/h", addedAt: 1, origin: "manual", originStoreGameId: null }, 5);
    await repos.prices.addWatch({ id: "w2", service: "itad", serviceGameId: "g2", title: "T", type: null, addedAt: 2, origin: "manual", originStoreGameId: null }, 5);
    expect(await repos.prices.listWatch("itad")).toEqual([
      { id: "w1", service: "itad", serviceGameId: "g1", title: "T", type: null, coverUrl: "https://a.example/c", coverFallbackUrl: "https://a.example/h", addedAt: 1, origin: "manual", originStoreGameId: null },
      { id: "w2", service: "itad", serviceGameId: "g2", title: "T", type: null, addedAt: 2, origin: "manual", originStoreGameId: null },
    ]);
  });
});

describe("migration 0009_watch_origin (ADR 91 point 6)", () => {
  it("keeps the rows of 0008_watch_media as manual and checks origin and its pair", async () => {
    const old = openDatabase(join(dir, "old3.sqlite"), undefined);
    await migrate(old, { backupDir: join(dir, "b3"), migrations: MIGRATIONS.slice(0, 8) });
    old.exec("INSERT INTO users (id, created_at) VALUES ('u', 1)");
    old.exec("INSERT INTO price_watch (id, user_id, service, service_game_id, title, type, added_at, cover_url) VALUES ('w', 'u', 'itad', 'g', 'T', NULL, 1, 'https://a.example/c')");
    expect((await migrate(old, { backupDir: join(dir, "b3") })).applied).toEqual(["0009_watch_origin"]);
    expect(old.prepare("SELECT id, cover_url, origin, origin_store_game_id FROM price_watch").all()).toEqual([{ id: "w", cover_url: "https://a.example/c", origin: "manual", origin_store_game_id: null }]);
    expect(old.pragma("foreign_key_check")).toEqual([]);
    const put = (id: string, origin: string, osg: string | null) =>
      old.prepare("INSERT INTO price_watch (id, user_id, service, service_game_id, title, added_at, origin, origin_store_game_id) VALUES (?, 'u', 'itad', ?, 'T', 1, ?, ?)").run(id, `g-${id}`, origin, osg);
    put("a", "steam", "10");
    put("b", "gog", "20");
    expect(() => put("c", "epic", "1")).toThrow(/CHECK/);
    expect(() => put("d", "steam", null)).toThrow(/CHECK/);
    expect(() => put("e", "manual", "1")).toThrow(/CHECK/);
    old.close();
  });
});

describe("applyWishlistImport (ADR 91 point 5 and 13 c)", () => {
  const w = (id: string, game: string, origin: "manual" | "steam" | "gog" = "steam", osg: string | null = origin === "manual" ? null : `o-${id}`) => ({ id, service: "itad" as const, serviceGameId: game, title: "T", type: null, addedAt: 1, origin, originStoreGameId: osg });
  const ids = async () => (await repos.prices.listWatch("itad")).map((x) => x.id);

  it("removes, moves the origin id and adds in one go; skips what is already followed", async () => {
    await repos.prices.addWatch(w("m", "g0", "manual"), 10);
    await repos.prices.addWatch(w("s1", "g1"), 10);
    await repos.prices.addWatch(w("s2", "g2"), 10);
    const res = await repos.prices.applyWishlistImport({ remove: ["s1"], rekey: [{ id: "s2", originStoreGameId: "new" }], add: [w("n1", "g3"), w("n2", "g0")] }, 10);
    expect(res).toEqual({ added: 1, removed: 1 });
    expect(await ids()).toEqual(["m", "n1", "s2"]); // same addedAt: by id
    expect((await repos.prices.getWatch("s2"))?.originStoreGameId).toBe("new");
  });

  it("never touches a manual row, even if asked", async () => {
    await repos.prices.addWatch(w("m", "g0", "manual"), 10);
    await repos.prices.applyWishlistImport({ remove: [], rekey: [{ id: "m", originStoreGameId: "x" }], add: [] }, 10);
    expect(await repos.prices.getWatch("m")).toMatchObject({ origin: "manual", originStoreGameId: null });
  });

  it("past the limit nothing is written (rolled back)", async () => {
    await repos.prices.addWatch(w("s1", "g1"), 2);
    await expect(repos.prices.applyWishlistImport({ remove: ["s1"], rekey: [], add: [w("a", "g2"), w("b", "g3"), w("c", "g4")] }, 2)).rejects.toMatchObject({ code: "limit-reached" });
    expect(await ids()).toEqual(["s1"]);
  });
});

describe("CHECK constraints and keys", () => {
  const insertLink = (status: string, source: string | null, service = "itad") =>
    sqlite.prepare("INSERT INTO price_links (user_id, canonical_game_id, service, status, source, inputs_hash, looked_up_at) SELECT id, 'c1', ?, ?, ?, 'h', 1 FROM users").run(service, status, source);

  it("rejects values outside the lists, including a manual source", async () => {
    await seed();
    expect(() => insertLink("manual", null)).toThrow(/CHECK/);
    expect(() => insertLink("found", "manual")).toThrow(/CHECK/);
    expect(() => insertLink("found", "steam", "other")).toThrow(/CHECK/);
    insertLink("found", null);
    const snap = (country: string, shops: string, service = "itad") =>
      sqlite.prepare("INSERT INTO price_snapshots (user_id, service, service_game_id, country, shops, data, fetched_at) SELECT id, ?, 'g', ?, ?, '{}', 1 FROM users").run(service, country, shops);
    expect(() => snap("ESP", "ludiary")).toThrow(/CHECK/);
    expect(() => snap("ES", "some")).toThrow(/CHECK/);
    expect(() => snap("ES", "all", "other")).toThrow(/CHECK/);
    snap("ES", "all");
    expect(() => snap("ES", "all")).toThrow(/UNIQUE|PRIMARY/);
    snap("ES", "ludiary"); // the shops value is part of the key (M4)
    expect(() => sqlite.prepare("INSERT INTO price_watch (id, user_id, service, service_game_id, title, type, added_at) SELECT 'w', id, 'itad', 'g', 'T', 'bundle', 1 FROM users").run()).toThrow(/CHECK/);
  });

  it("the watch list has a unique game per user and a limit", async () => {
    const w = (id: string, game: string) => ({ id, service: "itad" as const, serviceGameId: game, title: "T", type: null, addedAt: 1, origin: "manual" as const, originStoreGameId: null });
    expect(await repos.prices.addWatch(w("w1", "g1"), 2)).toMatchObject({ created: true });
    expect(await repos.prices.addWatch(w("w2", "g1"), 2)).toMatchObject({ created: false, record: { id: "w1" } });
    await repos.prices.addWatch(w("w3", "g2"), 2);
    await expect(repos.prices.addWatch(w("w4", "g3"), 2)).rejects.toMatchObject({ code: "limit-reached", key: "core.errors.limit-reached.watch" });
    expect((await repos.prices.listWatch("itad")).map((x) => x.id)).toEqual(["w1", "w3"]);
    await repos.prices.deleteWatch("w1");
    await repos.prices.deleteWatch("w1");
    expect(await repos.prices.getWatch("w1")).toBeNull();
  });
});

describe("PriceRepository", () => {
  it("upserts links, refuses a missing game and cascades with the canonical game", async () => {
    await seed();
    await repos.prices.putLink(link());
    await repos.prices.putLink(link({ status: "not-found", serviceGameId: null, source: null }));
    expect((await repos.prices.getLinks("itad", ["c1", "c2"])).get("c1")).toMatchObject({ status: "not-found" });
    await expect(repos.prices.putLink(link({ canonicalGameId: "nope" }))).rejects.toMatchObject({ code: "not-found" });
    await repos.prices.putLink(link({ status: "found", serviceGameId: "uuid-1" }));
    sqlite.exec("DELETE FROM game_properties WHERE canonical_game_id = 'c1'");
    sqlite.exec("DELETE FROM canonical_games WHERE id = 'c1'");
    expect(rows("price_links")).toBe(0);
    await repos.prices.deleteLink("itad", "c1"); // missing: no error
  });

  it("findOwned returns only found links of shown games", async () => {
    await seed();
    await repos.prices.putLink(link());
    await repos.prices.putLink(link({ canonicalGameId: "c2", serviceGameId: "uuid-2", status: "excluded" }));
    expect([...(await repos.prices.findOwned("itad", ["uuid-1", "uuid-2"]))]).toEqual([["uuid-1", "c1"]]);
    await repos.library.applyLibraryPlan(plan({ retire: ["p1"] }));
    expect((await repos.prices.findOwned("itad", ["uuid-1"])).size).toBe(0);
  });

  it("snapshots are read per country and shops, and keep the data as saved", async () => {
    const data = { deals: [{ shop: { storeId: "steam" as const, name: "Steam" }, amountMinor: 999, regularMinor: 1999, currency: "EUR", cut: 50, voucher: null, url: "https://itad.link/x/", expiresAt: 5 }], historyLow: { amountMinor: 499, currency: "EUR" } };
    await repos.prices.putSnapshots([{ service: "itad", serviceGameId: "g", country: "ES", shops: "ludiary", data, fetchedAt: 7 }]);
    await repos.prices.putSnapshots([{ service: "itad", serviceGameId: "g", country: "ES", shops: "ludiary", data, fetchedAt: 9 }]);
    expect((await repos.prices.getSnapshots("itad", ["g"], "ES", "ludiary")).get("g")).toEqual({ service: "itad", serviceGameId: "g", country: "ES", shops: "ludiary", data, fetchedAt: 9 });
    expect((await repos.prices.getSnapshots("itad", ["g"], "US", "ludiary")).size).toBe(0);
    expect((await repos.prices.getSnapshots("itad", ["g"], "ES", "all")).size).toBe(0);
  });

  it("clearService deletes the cache and the links except excluded, and keeps the follow list", async () => {
    await seed();
    await repos.prices.putLink(link());
    await repos.prices.putLink(link({ canonicalGameId: "c2", serviceGameId: null, status: "excluded", source: null }));
    await repos.prices.putSnapshots([{ service: "itad", serviceGameId: "g", country: "ES", shops: "all", data: { deals: [], historyLow: null }, fetchedAt: 1 }]);
    await repos.prices.addWatch({ id: "w", service: "itad", serviceGameId: "g", title: "T", type: "game", addedAt: 1, origin: "manual", originStoreGameId: null }, 500);
    await repos.prices.clearService("itad");
    expect([...(await repos.prices.getLinks("itad", ["c1", "c2"])).keys()]).toEqual(["c2"]);
    expect(rows("price_snapshots")).toBe(0);
    expect(rows("price_watch")).toBe(1);
  });
});
