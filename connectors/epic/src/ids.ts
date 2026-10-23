// storeGameId of an Epic property: <namespace>:<catalogItemId>:<appName> (ADR 78, point 6; assumption E6).
export const STORE_ID_RE = /^[A-Za-z0-9_-]{1,64}:[0-9a-f]{32}:[A-Za-z0-9._-]{1,60}$/;
const NS_RE = /^[A-Za-z0-9_-]{1,64}$/;
const CAT_RE = /^[0-9a-fA-F]{32}$/;
const APP_RE = /^[A-Za-z0-9._-]{1,60}$/;

/** Builds the id from raw values; lower-cases the catalog id and a hexadecimal namespace so both sources agree. null if malformed. */
export function buildStoreId(namespace: unknown, catalogItemId: unknown, appName: unknown): string | null {
  if (typeof namespace !== "string" || typeof catalogItemId !== "string" || typeof appName !== "string") return null;
  if (!NS_RE.test(namespace) || !CAT_RE.test(catalogItemId) || !APP_RE.test(appName)) return null;
  const ns = /^[0-9a-fA-F]{32}$/.test(namespace) ? namespace.toLowerCase() : namespace;
  const id = `${ns}:${catalogItemId.toLowerCase()}:${appName}`;
  return STORE_ID_RE.test(id) ? id : null;
}

/** Splits a validated id into its three segments. They need no encoding because of the pattern. */
export function splitStoreId(id: string): { namespace: string; catalogItemId: string; appName: string } {
  const [namespace, catalogItemId, appName] = id.split(":") as [string, string, string];
  return { namespace, catalogItemId, appName };
}

/** Removes control characters, trims and caps the length. "" if nothing is left. */
// eslint-disable-next-line no-control-regex
export const cleanText = (s: string, max: number): string => s.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max);

export const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
