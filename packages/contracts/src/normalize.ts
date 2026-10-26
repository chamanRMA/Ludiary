// Title normalization shared by the core and the connectors (ADR 51, 83 point 13 M2). Pure.

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
