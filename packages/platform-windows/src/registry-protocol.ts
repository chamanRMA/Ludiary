/** Wire protocol of `ludiary-tray.exe --registry` (ADR 72). Pure: building requests and parsing answers. */

export interface RegistryQuery {
  hive: "HKLM" | "HKCU";
  key: string;
  value: string;
  view?: "32" | "64";
  kind: "value" | "subkeys";
}

export type RegistryErrorCode =
  | "invalid-hive"
  | "invalid-key"
  | "invalid-value"
  | "invalid-view"
  | "invalid-kind"
  | "not-found"
  | "unsupported-type"
  | "access-denied"
  | "failed";

export type RegistryResult = { ok: true; values: string[] } | { ok: false; error: string };

export function buildRegistryRequest(queries: readonly RegistryQuery[]): string {
  return JSON.stringify({ queries });
}

/** Parses the helper answer; throws if it is not a well-formed answer for `expected` queries. */
export function parseRegistryResponse(text: string, expected: number): RegistryResult[] {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("registry helper returned invalid JSON");
  }
  if (typeof data !== "object" || data === null) throw new Error("registry helper returned an unexpected answer");
  const obj = data as { results?: unknown; error?: unknown };
  if (typeof obj.error === "string") throw new Error(`registry helper rejected the request (${obj.error})`);
  if (!Array.isArray(obj.results) || obj.results.length !== expected) {
    throw new Error("registry helper returned an unexpected number of results");
  }
  return obj.results.map((entry: unknown): RegistryResult => {
    const r = entry as { ok?: unknown; values?: unknown; error?: unknown } | null;
    // The helper omits `values` when the list is empty (omitempty).
    if (r && r.ok === true && r.values === undefined) return { ok: true, values: [] };
    if (r && r.ok === true && Array.isArray(r.values) && r.values.every((v) => typeof v === "string")) {
      return { ok: true, values: r.values as string[] };
    }
    if (r && r.ok === false && typeof r.error === "string") return { ok: false, error: r.error };
    // The helper omits `ok` when it is false (omitempty): an entry with only an error is a failure.
    if (r && typeof r.error === "string") return { ok: false, error: r.error };
    throw new Error("registry helper returned a malformed result");
  });
}
