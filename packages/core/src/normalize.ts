// Title normalization and the conservative matching rules of ADR 20 and 51.
import type { ExternalIds } from "@ludiary/contracts";

/**
 * ADR 51 steps, in order: NFKC, lower case, drop trade marks, drop diacritics, '&' -> 'and', non letter/number -> space,
 * collapse spaces. One deliberate reorder: NFKC turns U+2122 into the letters "TM", so the trade marks are dropped
 * before it (otherwise "Game(TM)" would become "gametm").
 */
export function normalizeTitle(title: string): string {
  return title
    .replace(/[™®©]/g, "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[™®©]/g, "")
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .replace(/&/g, " and ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/** Edition marks (ADR 51), already normalized ("director's cut" -> "director s cut"). Whole words only. */
export const EDITION_MARKS: readonly string[] = [
  "game of the year",
  "goty",
  "definitive",
  "deluxe",
  "complete",
  "ultimate",
  "gold",
  "enhanced",
  "remastered",
  "director s cut",
  "directors cut",
  "anniversary",
  "edition",
];

const MARK_RE = new RegExp(`(?<=^| )(?:${EDITION_MARKS.map((m) => m.replace(/ /g, " ")).join("|")})(?= |$)`, "g");

export function stripEditionMarks(normalized: string): string {
  return normalized.replace(MARK_RE, " ").replace(/ +/g, " ").trim();
}
export function hasEditionMark(normalized: string): boolean {
  return stripEditionMarks(normalized) !== normalized;
}

const NUMERAL = /^(?:\d+|x{0,2}(?:ix|iv|v?i{0,3}))$/;
/** A sequel number ("2", "iii"): ADR 51 says a title that differs only by a trailing number is not touched. */
function isSequelSuffix(rest: string): boolean {
  const words = rest.split(" ").filter(Boolean);
  return words.length > 0 && words.every((w) => NUMERAL.test(w) && w !== "");
}

export type TitleVerdict = "same" | "edition-doubt" | "distinct";

/** Compares two normalized titles. No fuzzy similarity on purpose (ADR 51). */
export function compareTitles(a: string, b: string): TitleVerdict {
  if (a === "" || b === "") return "distinct";
  if (a === b) return hasEditionMark(a) ? "edition-doubt" : "same";
  const sa = stripEditionMarks(a);
  const sb = stripEditionMarks(b);
  if (sa === "" || sb === "") return "distinct";
  if (sa === sb) return "edition-doubt";
  const [short, long] = sa.length <= sb.length ? [sa, sb] : [sb, sa];
  if (long.startsWith(`${short} `) && !isSequelSuffix(long.slice(short.length + 1))) return "edition-doubt";
  return "distinct";
}

export interface MatchCandidate {
  store: string;
  normalizedTitle: string;
  externalIds?: ExternalIds | undefined;
}

/**
 * Automatic matching verdict (ADR 20, 51, 72):
 * 'same-store' never merges (two properties of the same store are different products);
 * a common external id merges; same normalized title without edition marks merges; doubtful editions are flagged.
 */
export type MatchVerdict = "same-store" | "merge" | "possible-duplicate" | "distinct";
export function matchProperties(a: MatchCandidate, b: MatchCandidate): MatchVerdict {
  if (a.store === b.store) return "same-store";
  if (a.externalIds && b.externalIds) {
    for (const k of Object.keys(a.externalIds) as (keyof ExternalIds)[]) {
      const x = a.externalIds[k];
      if (x !== undefined && x !== "" && x === b.externalIds[k]) return "merge";
    }
  }
  const v = compareTitles(a.normalizedTitle, b.normalizedTitle);
  return v === "same" ? "merge" : v === "edition-doubt" ? "possible-duplicate" : "distinct";
}
