// Signed update manifest (ADR 90 point 4 and point 18, M1/B4). The same rules are implemented in Go
// (apps/desktop/launcher) and both run the vectors in test/fixtures/update-vectors/.
import { createPublicKey, verify } from "node:crypto";
import { compareVersions, isVersion } from "./version";

/** What is signed is this prefix plus the exact bytes of the manifest, so a signature is useless in any other context. */
export const SIGNATURE_CONTEXT = "ludiary-update-v1\n";
export const MIN_INSTALLER_BYTES = 1024 * 1024;
export const MAX_INSTALLER_BYTES = 256 * 1024 * 1024;

/** keyId -> Ed25519 public key as raw 32 bytes in base64 (single source: apps/desktop/update-keys.json). */
export type UpdateKeys = Readonly<Record<string, string>>;

export interface UpdateFile {
  name: string;
  size: number;
  sha256: string;
}
export interface UpdateManifest {
  schema: 1;
  product: "ludiary";
  channel: "stable";
  version: string;
  publishedAt: string;
  files: Record<string, UpdateFile>;
}

export type ManifestRejection = "signature" | "key" | "schema" | "format" | "version" | "not-newer" | "bad-version" | "target" | "file" | "asset";
export type ManifestResult = { ok: true; manifest: UpdateManifest; file: UpdateFile } | { ok: false; reason: ManifestRejection };

export interface VerifyManifestInput {
  manifest: Uint8Array;
  /** Content of ludiary-update.json.sig. */
  signature: string;
  keys: UpdateKeys;
  /** Version in the release tag (without the `v`); null skips the comparison (the launcher has no tag). */
  tagVersion: string | null;
  current: string;
  badVersions: readonly string[];
  target: string;
  /** Assets of the release: the installer must be there with the same size. Absent: not checked (Go has no list). */
  assets?: readonly { name: string; size: number }[];
}

const SIG_LINE = /^ludiary-sig-v1 ([A-Za-z0-9._-]{1,32}) ([A-Za-z0-9+/]{86}==)\r?\n?$/;
const HEX64 = /^[0-9a-f]{64}$/;
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

function publicKeyOf(rawBase64: string) {
  const raw = Buffer.from(rawBase64, "base64");
  if (raw.length !== 32) return null;
  return createPublicKey({ key: { kty: "OKP", crv: "Ed25519", x: raw.toString("base64url") }, format: "jwk" });
}

export function verifyManifest(i: VerifyManifestInput): ManifestResult {
  const fail = (reason: ManifestRejection): ManifestResult => ({ ok: false, reason });
  const line = SIG_LINE.exec(i.signature);
  if (!line) return fail("signature");
  const rawKey = Object.hasOwn(i.keys, line[1]!) ? i.keys[line[1]!] : undefined;
  if (rawKey === undefined) return fail("key");
  let valid = false;
  try {
    const key = publicKeyOf(rawKey);
    valid = key !== null && verify(null, Buffer.concat([Buffer.from(SIGNATURE_CONTEXT), i.manifest]), key, Buffer.from(line[2]!, "base64"));
  } catch {
    valid = false;
  }
  if (!valid) return fail("signature");

  let m: unknown;
  try {
    m = JSON.parse(Buffer.from(i.manifest).toString("utf8"));
  } catch {
    return fail("format");
  }
  if (!isObject(m)) return fail("format");
  if (m["schema"] !== 1) return fail("schema");
  if (m["product"] !== "ludiary" || m["channel"] !== "stable") return fail("format");
  // Same rule as the Go side: a key that differs from a known one only in case is refused (Go would read it, JavaScript not).
  const variant = (o: Record<string, unknown>, known: string[]) => Object.keys(o).some((k) => known.some((n) => k !== n && k.toLowerCase() === n.toLowerCase()));
  if (variant(m, ["schema", "product", "channel", "version", "publishedAt", "files"])) return fail("format");
  if (isObject(m["files"]) && Object.values(m["files"]).some((f) => isObject(f) && variant(f, ["name", "size", "sha256"]))) return fail("format");
  const version = m["version"];
  if (!isVersion(version) || typeof m["publishedAt"] !== "string" || !isObject(m["files"])) return fail("format");
  if (i.tagVersion !== null && version !== i.tagVersion) return fail("version");
  if (compareVersions(version, i.current) <= 0) return fail("not-newer");
  if (i.badVersions.includes(version)) return fail("bad-version");
  const file = Object.hasOwn(m["files"], i.target) ? m["files"][i.target] : undefined;
  if (!isObject(file)) return fail("target");
  const { name, size, sha256 } = file;
  if (name !== `Ludiary-Setup-${version}.exe` || typeof size !== "number" || !Number.isInteger(size) || typeof sha256 !== "string" || !HEX64.test(sha256)) return fail("file");
  if (size < MIN_INSTALLER_BYTES || size > MAX_INSTALLER_BYTES) return fail("file");
  if (i.assets && !i.assets.some((a) => a.name === name && a.size === size)) return fail("asset");
  return { ok: true, manifest: m as unknown as UpdateManifest, file: { name, size, sha256 } };
}
