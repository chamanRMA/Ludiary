// Answer of GET /repos/<repo>/releases/latest (ADR 90 point 3 and point 18, B3). The body is untrusted: only what is checked here is used.
import { isVersion } from "./version";

export const MANIFEST_ASSET = "ludiary-update.json";
export const SIGNATURE_ASSET = "ludiary-update.json.sig";
export const MAX_SMALL_ASSET_BYTES = 64 * 1024;

export interface ReleaseAsset {
  name: string;
  size: number;
  url: string;
}
export interface LatestRelease {
  version: string;
  assets: readonly ReleaseAsset[];
}
export type ReleaseResult = { ok: true; release: LatestRelease } | { ok: false };

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** `downloadBase` is only overridden by the test variant with a local feed (ADR 65). */
export function parseLatestRelease(body: unknown, repo: string, downloadBase = `https://github.com/${repo}/releases/download`): ReleaseResult {
  const bad: ReleaseResult = { ok: false };
  if (!isObject(body) || body["draft"] !== false || body["prerelease"] !== false) return bad;
  const tag = body["tag_name"];
  if (typeof tag !== "string" || !tag.startsWith("v") || !isVersion(tag.slice(1))) return bad;
  const version = tag.slice(1);
  if (!Array.isArray(body["assets"])) return bad;
  const assets: ReleaseAsset[] = [];
  for (const a of body["assets"]) {
    if (!isObject(a) || a["state"] !== "uploaded" || typeof a["name"] !== "string" || typeof a["size"] !== "number" || typeof a["browser_download_url"] !== "string") continue;
    // B3: the download URL must be exactly this repository, this tag and this asset name.
    if (a["browser_download_url"] !== `${downloadBase}/${tag}/${a["name"]}`) continue;
    assets.push({ name: a["name"], size: a["size"], url: a["browser_download_url"] });
  }
  for (const n of [MANIFEST_ASSET, SIGNATURE_ASSET]) {
    const a = assets.find((x) => x.name === n);
    if (!a || a.size < 1 || a.size > MAX_SMALL_ASSET_BYTES) return bad;
  }
  return { ok: true, release: { version, assets } };
}
