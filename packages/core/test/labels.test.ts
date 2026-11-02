import { describe, expect, it } from "vitest";
import { COLLECTION_MAX_LENGTH, CoreError, TAG_MAX_LENGTH, normalizeLabel } from "../src";
import { harness, type Harness } from "./helpers";

function seedGame(h: Harness) {
  h.store.canonical.set("c1", { id: "c1", title: "Portal" });
  h.store.properties.set("p1", {
    id: "p1", canonicalGameId: "c1", store: "steam", storeGameId: "1", kind: "game", baseStoreGameId: null,
    title: "Portal", normalizedTitle: "portal", owned: true, removedAt: null, storePlaytimeMinutes: null, storeLastPlayedAt: null,
  });
}

const code = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    return (e as CoreError).code;
  }
  return "none";
};

describe("normalizeLabel (ADR 85 point 5, 12)", () => {
  it("cleans whitespace, keeps what the user wrote and builds a key without case or compatibility forms", () => {
    expect(normalizeLabel("  Co-op \t Fun ".replace("\t", " "), 40)).toEqual({ name: "Co-op Fun", key: "co-op fun" });
    expect(normalizeLabel("ＲＰＧ", 40)).toEqual({ name: "ＲＰＧ", key: "rpg" });
    expect(normalizeLabel("Café", 40).name).toBe("Café"); // NFC
    expect(normalizeLabel("a  b", 40).name).toBe("a b");
  });

  it("does not use the title normalization: C++ is not C", () => {
    expect(normalizeLabel("C++", 40).key).toBe("c++");
    expect(normalizeLabel("C++", 40).key).not.toBe(normalizeLabel("C", 40).key);
  });

  it("counts code points, not UTF-16 units", () => {
    expect(() => normalizeLabel("😀".repeat(40), TAG_MAX_LENGTH)).not.toThrow();
    expect(code(() => normalizeLabel("😀".repeat(41), TAG_MAX_LENGTH))).toBe("invalid-input");
    expect(() => normalizeLabel("a".repeat(COLLECTION_MAX_LENGTH), COLLECTION_MAX_LENGTH)).not.toThrow();
    expect(code(() => normalizeLabel("a".repeat(COLLECTION_MAX_LENGTH + 1), COLLECTION_MAX_LENGTH))).toBe("invalid-input");
  });

  it.each([
    ["not text", 5],
    ["empty", ""],
    ["blank", " 　 "],
    ["control", "a\u0000b"],
    ["newline", "a\nb"],
    ["lone surrogate", "a\ud800b"],
    ["non-character", "a﷐b"],
    ["non-character at the end of a plane", "a\u{1ffff}b"],
    ["bidi override", "a‮b"],
    ["bidi isolate", "a⁦b"],
    ["LRM", "a‎b"],
    ["zero width space", "a​b"],
    ["BOM", "a﻿b"],
  ])("rejects %s", (_n, input) => {
    expect(code(() => normalizeLabel(input, 40))).toBe("invalid-input");
  });

  it("allows ZWJ, ZWNJ and flag tag characters", () => {
    expect(() => normalizeLabel("\u{1F468}\u200D\u{1F469}\u200D\u{1F467}", 40)).not.toThrow();
    expect(() => normalizeLabel("a\u200Cb", 40)).not.toThrow();
    expect(() => normalizeLabel("🏴\u{e0067}\u{e0062}\u{e0065}\u{e006e}\u{e0067}\u{e007f}", 40)).not.toThrow();
  });

  it("carries the limit for the translated message", () => {
    try {
      normalizeLabel("x".repeat(41), 40);
    } catch (e) {
      expect((e as CoreError).params).toEqual({ max: 40 });
    }
  });
});

describe("updateGame in the core", () => {
  it("normalizes and merges repeated tags by key, and dedups collections, before the repository", async () => {
    const h = await harness();
    seedGame(h);
    await h.core.updateGame("c1", { favorite: true, tags: ["Coop", " coop ", "RPG"], collectionIds: ["a", "a"] });
    expect(h.userDataCalls[0]).toEqual([
      "updateGame",
      "c1",
      { favorite: true, tags: [{ name: "Coop", key: "coop" }, { name: "RPG", key: "rpg" }], collectionIds: ["a"] },
      h.clock.now(),
    ]);
  });

  it("refuses more than 20 tags, an empty patch and bad names without touching the repository", async () => {
    const h = await harness();
    seedGame(h);
    const tags = Array.from({ length: 1001 }, (_, i) => `t${i}`);
    await expect(h.core.updateGame("c1", { tags })).rejects.toMatchObject({ code: "limit-reached", params: { max: 1000 } });
    await expect(h.core.updateGame("c1", {})).rejects.toMatchObject({ code: "invalid-input" });
    await expect(h.core.updateGame("c1", { tags: ["a‮b"] })).rejects.toMatchObject({ code: "invalid-input" });
    await expect(h.core.createCollection("")).rejects.toMatchObject({ code: "invalid-input" });
    expect(h.userDataCalls).toEqual([]);
  });

  it("is not-found when the game is not shown", async () => {
    const h = await harness();
    await expect(h.core.updateGame("nope", { favorite: true })).rejects.toMatchObject({ code: "not-found" });
  });
});
