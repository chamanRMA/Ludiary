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
    expect(res.applied).toEqual(["0007_prices"]);
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
    const w = (id: string, game: string) => ({ id, service: "itad" as const, serviceGameId: game, title: "T", type: null, addedAt: 1 });
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
    await repos.prices.addWatch({ id: "w", service: "itad", serviceGameId: "g", title: "T", type: "game", addedAt: 1 }, 500);
    await repos.prices.clearService("itad");
    expect([...(await repos.prices.getLinks("itad", ["c1", "c2"])).keys()]).toEqual(["c2"]);
    expect(rows("price_snapshots")).toBe(0);
    expect(rows("price_watch")).toBe(1);
  });
});
