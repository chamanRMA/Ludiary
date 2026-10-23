// Reader of the launcher's `configurations` cache: protobuf records with YAML inside (ADR 80, points 3, 9 and 18 M4).
// The file is untrusted: sizes are capped, parsing is not recursive in protobuf, and the YAML is read with own-property
// checks only.
import { parse } from "yaml";
import { ProtobufError, readFields } from "./protobuf";

export const MAX_CONFIGURATIONS_BYTES = 8 * 1024 * 1024;
export const MAX_RECORDS = 5_000;
export const MAX_YAML_BYTES = 256 * 1024;

const ID_RE = /^[1-9][0-9]{0,9}$/;
const UUID_RE = /^[0-9a-fA-F]{8}-([0-9a-fA-F]{4}-){3}[0-9a-fA-F]{12}$/;
const START_GAME = new TextEncoder().encode("start_game");
// ADR 80, point 18 M4. `core` has no custom tags; no merge keys; duplicate keys are an error.
// logLevel "error": yaml's default warnings go to stderr with fragments of the file.
const YAML_OPTIONS = { schema: "core", merge: false, maxAliasCount: 100, uniqueKeys: true, prettyErrors: false, logLevel: "error" } as const;

export interface CacheEntry {
  readonly id: string;
  /** Raw `thumb_image` value (already resolved through `localizations.default`); not yet validated. */
  readonly thumb: string | null;
}

export interface CacheResult {
  /** Lowercase space_id -> game. */
  readonly bySpace: ReadonlyMap<string, CacheEntry>;
  /** false if the file was malformed or a cap was hit: what was read is still used. */
  readonly complete: boolean;
  readonly stats: { records: number; invalidYaml: number; ambiguousSpace: number; size: number };
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** Own-property walk: never reaches the prototype, so a `__proto__` or `constructor` key is just data. */
export function getIn(root: unknown, path: readonly string[]): unknown {
  let cur = root;
  for (const key of path) {
    if (!isObject(cur) || !Object.hasOwn(cur, key)) return undefined;
    cur = cur[key];
  }
  return cur;
}

function hasStartGame(b: Uint8Array, start: number, end: number): boolean {
  const n = START_GAME.length;
  outer: for (let i = start; i + n <= end; i++) {
    for (let j = 0; j < n; j++) if (b[i + j] !== START_GAME[j]) continue outer;
    return true;
  }
  return false;
}

export function parseConfigurations(bytes: Uint8Array): CacheResult {
  const bySpace = new Map<string, CacheEntry>();
  const stats = { records: 0, invalidYaml: 0, ambiguousSpace: 0, size: bytes.length };
  let complete = true;
  const decoder = new TextDecoder("utf-8");

  const readRecord = (start: number, end: number): void => {
    let id: number | undefined;
    let yamlStart = -1;
    let yamlEnd = -1;
    for (const f of readFields(bytes, start, end)) {
      if (f.num === 1 && f.wire === 0 && id === undefined) id = f.value;
      else if (f.num === 3 && f.wire === 2 && yamlStart < 0) [yamlStart, yamlEnd] = [f.start, f.end];
    }
    // Records without start_game are dropped before any parsing (a byte search).
    if (id === undefined || yamlStart < 0 || !hasStartGame(bytes, yamlStart, yamlEnd)) return;
    if (yamlEnd - yamlStart > MAX_YAML_BYTES) {
      complete = false;
      stats.invalidYaml++;
      return;
    }
    let doc: unknown;
    try {
      doc = parse(decoder.decode(bytes.subarray(yamlStart, yamlEnd)).replace(/\t/g, " "), YAML_OPTIONS);
    } catch {
      // Includes a stack overflow on absurd nesting: skip the record, keep going.
      complete = false;
      stats.invalidYaml++;
      return;
    }
    const root = getIn(doc, ["root"]);
    const spaceId = getIn(root, ["space_id"]);
    if (!Object.hasOwn(isObject(root) ? root : {}, "start_game") || getIn(root, ["is_ulc"]) === true) return;
    if (typeof spaceId !== "string" || !UUID_RE.test(spaceId) || !ID_RE.test(String(id))) return;
    let thumb = getIn(root, ["thumb_image"]);
    const localized = typeof thumb === "string" ? getIn(doc, ["localizations", "default", thumb]) : undefined;
    if (typeof localized === "string") thumb = localized;
    const entry: CacheEntry = { id: String(id), thumb: typeof thumb === "string" ? thumb : null };
    const key = spaceId.toLowerCase();
    const prev = bySpace.get(key);
    if (prev !== undefined) {
      stats.ambiguousSpace++;
      if (Number(prev.id) <= id) return;
    }
    bySpace.set(key, entry);
  };

  try {
    for (const f of readFields(bytes, 0, bytes.length)) {
      if (f.num !== 1 || f.wire !== 2) continue;
      if (stats.records >= MAX_RECORDS) {
        complete = false;
        break;
      }
      stats.records++;
      readRecord(f.start, f.end);
    }
  } catch (e) {
    if (!(e instanceof ProtobufError)) throw e;
    complete = false;
  }
  return { bySpace, complete, stats };
}
