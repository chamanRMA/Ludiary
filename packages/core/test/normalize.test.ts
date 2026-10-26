import { describe, expect, it } from "vitest";
import { normalizeTitle } from "@ludiary/contracts";
import { compareTitles, hasEditionMark, matchProperties, stripEditionMarks } from "../src";

describe("normalizeTitle (ADR 51)", () => {
  it.each([
    ["The Witcher® 3: Wild Hunt", "the witcher 3 wild hunt"],
    ["Game™", "game"],
    ["Café  Ñandú", "cafe nandu"],
    ["Ｆｕｌｌ　Ｗｉｄｔｈ", "full width"],
    ["Ratchet & Clank", "ratchet and clank"],
    ["Half-Life: Alyx", "half life alyx"],
    ["  Dark   Souls ©  ", "dark souls"],
    ["Director's Cut", "director s cut"],
    ["Ünïcödé — Test!", "unicode test"],
    ["日本語 タイトル 2", "日本語 タイトル 2"],
    ["™®©", ""],
  ])("%s -> %s", (input, expected) => {
    expect(normalizeTitle(input)).toBe(expected);
  });

  it("is idempotent", () => {
    const once = normalizeTitle("Ratchet & Clank™: Rift Apart");
    expect(normalizeTitle(once)).toBe(once);
  });
});

describe("edition marks", () => {
  it("detects whole-word marks only", () => {
    expect(hasEditionMark("foo deluxe edition")).toBe(true);
    expect(hasEditionMark("foo game of the year edition")).toBe(true);
    expect(hasEditionMark("foo director s cut")).toBe(true);
    expect(hasEditionMark("golden axe")).toBe(false);
    expect(hasEditionMark("completely different")).toBe(false);
  });
  it("strips them", () => {
    expect(stripEditionMarks("foo ultimate edition")).toBe("foo");
    expect(stripEditionMarks("gold edition foo")).toBe("foo");
  });
});

describe("compareTitles", () => {
  it("merges identical titles without marks", () => {
    expect(compareTitles("portal 2", "portal 2")).toBe("same");
  });
  it("flags editions instead of merging", () => {
    expect(compareTitles("foo", "foo deluxe edition")).toBe("edition-doubt");
    expect(compareTitles("foo goty", "foo")).toBe("edition-doubt");
    expect(compareTitles("foo deluxe", "foo deluxe")).toBe("edition-doubt");
  });
  it("flags added subtitles", () => {
    expect(compareTitles("portal", "portal stories mel")).toBe("edition-doubt");
  });
  it("does not touch sequels", () => {
    expect(compareTitles("left 4 dead", "left 4 dead 2")).toBe("distinct");
    expect(compareTitles("final fantasy", "final fantasy vii")).toBe("distinct");
    expect(compareTitles("portal", "portal 2")).toBe("distinct");
  });
  it("is not fuzzy", () => {
    expect(compareTitles("doom", "doon")).toBe("distinct");
    expect(compareTitles("", "")).toBe("distinct");
  });
});

describe("matchProperties", () => {
  const a = { store: "steam", normalizedTitle: "portal 2" };
  it("never merges two properties of the same store", () => {
    expect(matchProperties(a, { store: "steam", normalizedTitle: "portal 2" })).toBe("same-store");
    expect(matchProperties({ ...a, externalIds: { igdb: "1" } }, { store: "steam", normalizedTitle: "x", externalIds: { igdb: "1" } })).toBe("same-store");
  });
  it("merges across stores by identical title or common external id", () => {
    expect(matchProperties(a, { store: "gog", normalizedTitle: "portal 2" })).toBe("merge");
    expect(matchProperties({ ...a, externalIds: { igdb: "9" } }, { store: "epic", normalizedTitle: "other", externalIds: { igdb: "9" } })).toBe("merge");
  });
  it("marks doubtful editions", () => {
    expect(matchProperties(a, { store: "gog", normalizedTitle: "portal 2 deluxe edition" })).toBe("possible-duplicate");
    expect(matchProperties(a, { store: "gog", normalizedTitle: "portal 3" })).toBe("distinct");
  });
});
