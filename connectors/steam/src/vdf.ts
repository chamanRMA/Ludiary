// Tolerant, bounded parser for Valve text KeyValues (VDF/ACF). Pure, no I/O (ADR 72).
import { ConnectorError, type I18nKey } from "@ludiary/contracts";

export type VdfValue = string | VdfObject;
/** Keys are lower-cased; for duplicate keys the last value wins. */
export type VdfObject = Map<string, VdfValue>;

export const VDF_LIMITS = {
  maxChars: 1024 * 1024,
  maxDepth: 32,
  maxEntries: 100_000,
  maxStringChars: 64 * 1024,
} as const;

const BAD_FILE = "connectors.steam.errors.malformedFile" as I18nKey;

function fail(reason: string): never {
  throw new ConnectorError("store.unexpected-response", `Malformed KeyValues text: ${reason}`, { messageKey: BAD_FILE });
}

type Token = { kind: "str"; value: string; quoted: boolean } | { kind: "open" } | { kind: "close" };

function isSpace(c: string): boolean {
  return c === " " || c === "\t" || c === "\r" || c === "\n" || c === "\f" || c === "\v";
}

function* tokenize(text: string): Generator<Token> {
  const n = text.length;
  let i = 0;
  while (i < n) {
    const c = text[i] as string;
    if (isSpace(c)) {
      i++;
    } else if (c === "/" && text[i + 1] === "/") {
      while (i < n && text[i] !== "\n") i++;
    } else if (c === "{") {
      i++;
      yield { kind: "open" };
    } else if (c === "}") {
      i++;
      yield { kind: "close" };
    } else if (c === '"') {
      i++;
      let out = "";
      let closed = false;
      while (i < n) {
        const d = text[i] as string;
        if (d === '"') {
          i++;
          closed = true;
          break;
        }
        if (d === "\\" && i + 1 < n) {
          const e = text[i + 1] as string;
          if (e === "\\") out += "\\";
          else if (e === '"') out += '"';
          else if (e === "n") out += "\n";
          else if (e === "t") out += "\t";
          else out += "\\" + e; // unknown escape: keep it literally (old files with single backslashes)
          i += 2;
        } else {
          out += d;
          i++;
        }
        if (out.length > VDF_LIMITS.maxStringChars) fail("string too long");
      }
      if (!closed) fail("unterminated string");
      yield { kind: "str", value: out, quoted: true };
    } else {
      const start = i;
      while (i < n) {
        const d = text[i] as string;
        if (isSpace(d) || d === "{" || d === "}" || d === '"') break;
        i++;
      }
      if (i - start > VDF_LIMITS.maxStringChars) fail("token too long");
      yield { kind: "str", value: text.slice(start, i), quoted: false };
    }
  }
}

/** Conditions such as [$WIN32] or [!$X360]. */
function isCondition(t: Token): boolean {
  return t.kind === "str" && !t.quoted && t.value.startsWith("[") && t.value.endsWith("]");
}

/** Parses a whole document into a root object. Throws ConnectorError 'store.unexpected-response'. */
export function parseVdf(input: string): VdfObject {
  if (typeof input !== "string") fail("not text");
  if (input.length > VDF_LIMITS.maxChars) fail("input too large");
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;

  const root: VdfObject = new Map();
  // Iterative: the stack is bounded by maxDepth and no recursion is used.
  const stack: VdfObject[] = [root];
  let pendingKey: string | undefined;
  let entries = 0;
  let skipCondition = false;

  for (const tok of tokenize(text)) {
    const current = stack[stack.length - 1] as VdfObject;
    if (skipCondition) {
      skipCondition = false;
      if (isCondition(tok)) continue;
    }
    if (pendingKey === undefined) {
      if (tok.kind === "str") {
        pendingKey = tok.value.toLowerCase();
      } else if (tok.kind === "close") {
        if (stack.length === 1) fail("unbalanced closing brace");
        stack.pop();
        skipCondition = true;
      } else {
        fail("unexpected opening brace");
      }
    } else {
      if (++entries > VDF_LIMITS.maxEntries) fail("too many entries");
      if (tok.kind === "str") {
        current.set(pendingKey, tok.value);
        skipCondition = true;
      } else if (tok.kind === "open") {
        if (stack.length > VDF_LIMITS.maxDepth) fail("nesting too deep");
        const child: VdfObject = new Map();
        current.set(pendingKey, child);
        stack.push(child);
      } else {
        fail("missing value");
      }
      pendingKey = undefined;
    }
  }
  if (pendingKey !== undefined) fail("key without value");
  if (stack.length !== 1) fail("unclosed brace");
  return root;
}

export function vdfString(obj: VdfObject | undefined, key: string): string | undefined {
  const v = obj?.get(key.toLowerCase());
  return typeof v === "string" ? v : undefined;
}

export function vdfObject(obj: VdfObject | undefined, key: string): VdfObject | undefined {
  const v = obj?.get(key.toLowerCase());
  return typeof v === "string" || v === undefined ? undefined : v;
}
