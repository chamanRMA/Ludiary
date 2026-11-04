// Download client of the updater (ADR 90 point 6). Not the connectors' HttpClient: that one rejects redirects and caps the body.
// HTTPS on 443 only; the first hop must be on GitHub and the redirects only go to its asset CDN, checked at every hop.
// It never sends Authorization or cookies, and only the headers the caller names from a short list.
import { createHash } from "node:crypto";
import { once } from "node:events";
import { createWriteStream, renameSync, rmSync } from "node:fs";

export const FIRST_HOSTS = ["api.github.com", "github.com"] as const;
/** GH5: the CDN host is not documented by GitHub; if it changes the download fails with `redirect` and this list grows. */
export const CDN_HOSTS = ["release-assets.githubusercontent.com", "objects.githubusercontent.com"] as const;
const MAX_REDIRECTS = 2;
const ALLOWED_HEADERS = new Set(["accept", "user-agent", "if-none-match", "x-github-api-version"]);

export type UpdateNetErrorCode = "bad-url" | "redirect" | "network" | "timeout" | "too-large" | "size-mismatch" | "hash-mismatch" | "status";
export class UpdateNetError extends Error {
  constructor(
    readonly code: UpdateNetErrorCode,
    readonly status?: number,
  ) {
    super(code);
  }
}

export interface NetResponse {
  status: number;
  headers: { get(name: string): string | null };
  body: ReadableStream<Uint8Array> | null;
}
export interface UpdateDownloaderOptions {
  /** Only for tests. */
  fetch?: (url: string, init: { headers: Record<string, string>; redirect: "manual"; signal: AbortSignal }) => Promise<NetResponse>;
  firstHosts?: readonly string[];
  cdnHosts?: readonly string[];
  /** Exact origins also accepted for the first hop. Only the test variant (ADR 65) passes one: a local feed over http. */
  extraOrigins?: readonly string[];
}
export interface GetOptions {
  headers?: Record<string, string>;
  maxBytes: number;
  timeoutMs: number;
  /** false (the API call): a redirect is returned as a status, not followed. */
  followRedirects: boolean;
  signal?: AbortSignal;
}
export interface GetResult {
  status: number;
  headers: { get(name: string): string | null };
  body: Buffer;
}
export interface DownloadOptions {
  headers?: Record<string, string>;
  /** Final path; the bytes go to `<dest>.part` first. */
  dest: string;
  size: number;
  sha256: string;
  timeoutMs: number;
  signal?: AbortSignal;
  onProgress?: (received: number) => void;
}
export interface UpdateDownloader {
  get(url: string, o: GetOptions): Promise<GetResult>;
  download(url: string, o: DownloadOptions): Promise<void>;
}

export function createUpdateDownloader(opts: UpdateDownloaderOptions = {}): UpdateDownloader {
  const doFetch = opts.fetch ?? ((url, init) => fetch(url, init));
  const first = opts.firstHosts ?? FIRST_HOSTS;
  const cdn = opts.cdnHosts ?? CDN_HOSTS;

  function checkUrl(raw: string, hop: number): void {
    let u: URL;
    try {
      u = new URL(raw);
    } catch {
      throw new UpdateNetError("bad-url");
    }
    if (hop === 0 && opts.extraOrigins?.includes(u.origin)) return;
    if (u.protocol !== "https:" || (u.port !== "" && u.port !== "443") || u.username !== "" || u.password !== "") throw new UpdateNetError("bad-url");
    if (!(hop === 0 ? first : cdn).includes(u.hostname)) throw new UpdateNetError(hop === 0 ? "bad-url" : "redirect");
  }

  /** Follows the permitted redirects and returns the first response that is not one. The caller owns the body. */
  async function open(url: string, o: { headers?: Record<string, string>; follow: boolean; signal: AbortSignal }): Promise<NetResponse> {
    const headers: Record<string, string> = {};
    for (const [k, v] of Object.entries(o.headers ?? {})) if (ALLOWED_HEADERS.has(k.toLowerCase())) headers[k] = v;
    let current = url;
    for (let hop = 0; ; hop++) {
      checkUrl(current, hop);
      let res: NetResponse;
      try {
        res = await doFetch(current, { headers, redirect: "manual", signal: o.signal });
      } catch {
        throw new UpdateNetError(o.signal.aborted ? "timeout" : "network");
      }
      if (![301, 302, 303, 307, 308].includes(res.status) || !o.follow) return res;
      await res.body?.cancel().catch(() => undefined);
      const location = res.headers.get("location");
      if (!location || hop >= MAX_REDIRECTS) throw new UpdateNetError("redirect");
      try {
        current = new URL(location, current).href;
      } catch {
        throw new UpdateNetError("bad-url");
      }
    }
  }

  const deadline = (ms: number, outer?: AbortSignal) => (outer ? AbortSignal.any([AbortSignal.timeout(ms), outer]) : AbortSignal.timeout(ms));

  async function* chunks(res: NetResponse, max: number, signal: AbortSignal): AsyncGenerator<Uint8Array> {
    if (!res.body) return;
    const reader = res.body.getReader();
    let total = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read().catch(() => {
          throw new UpdateNetError(signal.aborted ? "timeout" : "network");
        });
        if (done) return;
        total += value.byteLength;
        if (total > max) throw new UpdateNetError("too-large");
        yield value;
      }
    } finally {
      await reader.cancel().catch(() => undefined);
    }
  }

  return {
    async get(url, o) {
      const signal = deadline(o.timeoutMs, o.signal);
      const res = await open(url, { ...(o.headers ? { headers: o.headers } : {}), follow: o.followRedirects, signal });
      const declared = Number(res.headers.get("content-length"));
      if (Number.isFinite(declared) && declared > o.maxBytes) {
        await res.body?.cancel().catch(() => undefined);
        throw new UpdateNetError("too-large");
      }
      const parts: Buffer[] = [];
      for await (const c of chunks(res, o.maxBytes, signal)) parts.push(Buffer.from(c));
      return { status: res.status, headers: res.headers, body: Buffer.concat(parts) };
    },

    async download(url, o) {
      const signal = deadline(o.timeoutMs, o.signal);
      const part = `${o.dest}.part`;
      try {
        const res = await open(url, { ...(o.headers ? { headers: o.headers } : {}), follow: true, signal });
        if (res.status !== 200) {
          await res.body?.cancel().catch(() => undefined);
          throw new UpdateNetError("status", res.status);
        }
        const declared = res.headers.get("content-length");
        if (declared !== null && Number(declared) !== o.size) throw new UpdateNetError("size-mismatch");
        const hash = createHash("sha256");
        const out = createWriteStream(part, { flags: "w" });
        let received = 0;
        try {
          // The cap is the size of the signed manifest: one byte more aborts.
          for await (const c of chunks(res, o.size, signal)) {
            hash.update(c);
            received += c.byteLength;
            if (!out.write(c)) await once(out, "drain");
            o.onProgress?.(received);
          }
        } finally {
          out.end();
          await once(out, "close").catch(() => undefined);
        }
        if (received !== o.size) throw new UpdateNetError("size-mismatch");
        if (hash.digest("hex") !== o.sha256) throw new UpdateNetError("hash-mismatch");
        renameSync(part, o.dest);
      } catch (e) {
        rmSync(part, { force: true });
        throw e;
      }
    },
  };
}
