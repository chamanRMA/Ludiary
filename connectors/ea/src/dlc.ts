// Base game of an EA add-on, deduced from titles of the same response only (ADR 83, points 8 and 13 M2). Pure.
import { normalizeTitle } from "@ludiary/contracts";

const ARABIC = /^\d{1,4}$/;
const ROMAN = /^(?=[ivx]{1,5}$)x{0,3}(?:ix|iv|v?i{0,3})$/; // at most 5 letters and a well-formed numeral

/** "2", "iii": a sequel number, so the title is another game and not an add-on (ADR 51; Battlefield 1 is not DLC of Battlefield). */
const isNumberOnly = (rest: string): boolean => ARABIC.test(rest) || ROMAN.test(rest);

/** A rest that starts with a number ("2 deluxe") is a sequel of the base, not an add-on of it (audit). */
const startsWithNumber = (rest: string): boolean => isNumberOnly(rest.split(" ", 1)[0]!);

/** Compares offer ids: numeric when both are, else text. */
const idLess = (a: string, b: string): boolean => (/^\d+$/.test(a) && /^\d+$/.test(b) ? (a.length !== b.length ? a.length < b.length : a < b) : a < b);

/** Normalized title -> lowest storeGameId among the base games with that title. */
export function indexBaseTitles(bases: Iterable<{ readonly id: string; readonly title: string }>): Map<string, string> {
  const index = new Map<string, string>();
  for (const b of bases) {
    const t = normalizeTitle(b.title);
    const prev = index.get(t);
    if (t !== "" && (prev === undefined || idLess(b.id, prev))) index.set(t, b.id);
  }
  return index;
}

/**
 * Longest base title that is a whole-word prefix of `title` with something else after it, tried word by word
 * (O(words) lookups). If the longest hit leaves only a number, it is a sequel and nothing shorter is tried.
 */
export function inferBaseGame(title: string, index: ReadonlyMap<string, string>): string | undefined {
  const t = normalizeTitle(title);
  for (let end = t.lastIndexOf(" "); end > 0; end = t.lastIndexOf(" ", end - 1)) {
    const id = index.get(t.slice(0, end));
    if (id !== undefined) return startsWithNumber(t.slice(end + 1)) ? undefined : id;
  }
  return undefined;
}
