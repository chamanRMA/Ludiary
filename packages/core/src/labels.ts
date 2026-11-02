// Names of tags and collections typed by the user (ADR 85 point 5, 12). Pure; the trust boundary for these names.
import { asKey, CoreError } from "./errors";

export const TAG_MAX_LENGTH = 40;
export const COLLECTION_MAX_LENGTH = 60;
/** ADR 85 point 5: what the API lets in. Merges (point 6) may leave a game above the per-game tag limit. */
export const LIMITS = { tagsPerGame: 20, tags: 1000, collections: 200, gamesPerCollection: 10_000 } as const;

// Control, lone surrogates, non-characters, and all of the format category (bidi controls included) except ZWNJ and ZWJ
// (emoji, some scripts) and the tag characters of flag emoji (ADR 85 point 12).
const FORBIDDEN = /[\p{Cc}\p{Cs}\p{Noncharacter_Code_Point}]|(?![\u200C\u200D\u{E0020}-\u{E007F}])\p{Cf}/u;

export interface Label {
  /** What the user typed, cleaned up. Shown as is. */
  name: string;
  /** Identity: two names with the same key are the same tag or collection. */
  key: string;
}

export function normalizeLabel(input: unknown, maxLength: number): Label {
  if (typeof input !== "string") throw new CoreError("invalid-input", "A name must be text");
  const text = input.normalize("NFC");
  if (FORBIDDEN.test(text)) throw new CoreError("invalid-input", "The name has characters that are not allowed");
  const name = text.replace(/\s+/gu, " ").trim();
  if (name === "") throw new CoreError("invalid-input", "The name is empty", { key: asKey("core.errors.label-empty") });
  if ([...name].length > maxLength) {
    throw new CoreError("invalid-input", "The name is too long", { key: asKey("core.errors.label-too-long"), params: { max: maxLength } });
  }
  return { name, key: name.normalize("NFKC").toLowerCase() };
}
