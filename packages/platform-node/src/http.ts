// Minimal HttpClient (ADR 73): GET only, HTTPS, exact declared hosts, no redirects, bounded body.
import { ConnectorError, type ConnectorLogger, type HttpClient } from "@ludiary/contracts";

export const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;

export interface HttpClientOptions {
  /** Bare lower-case hosts the connector declared in apiHosts. */
  hosts: readonly string[];
  signal: AbortSignal;
  log: ConnectorLogger;
  /** Only for tests; defaults to the global fetch of Node. */
  fetch?: typeof fetch;
  maxBytes?: number;
}

const unexpected = (msg: string) => new ConnectorError("store.unexpected-response", msg);

async function readLimited(res: Response, maxBytes: number): Promise<string> {
  const declared = Number(res.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) {
    await res.body?.cancel().catch(() => undefined);
    throw unexpected("Response is larger than the allowed size");
  }
  if (!res.body) return "";
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw unexpected("Response is larger than the allowed size");
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

export function createHttpClient(opts: HttpClientOptions): HttpClient {
  const doFetch = opts.fetch ?? fetch;
  const maxBytes = opts.maxBytes ?? MAX_RESPONSE_BYTES;
  return {
    async request(req) {
      // shortcut: GET only; POST with a json/form body arrives with the account slice.
      if (req.method !== "GET") throw new ConnectorError("internal", "HttpClient only supports GET");
      let url: URL;
      try {
        url = new URL(req.url);
      } catch {
        throw new ConnectorError("internal", "Invalid URL");
      }
      if (url.protocol !== "https:" || !opts.hosts.includes(url.hostname) || url.username !== "" || url.password !== "" || (url.port !== "" && url.port !== "443")) {
        throw new ConnectorError("internal", "URL is not allowed for this connector");
      }
      for (const [k, v] of Object.entries(req.query ?? {})) url.searchParams.append(k, typeof v === "object" ? v.reveal() : String(v));
      const headers: Record<string, string> = { accept: "application/json" };
      const started = Date.now();
      let res: Response;
      try {
        // "manual": a redirect is never followed, and it is recognised by its status instead of by undici's error text.
        res = await doFetch(url, { method: "GET", headers, redirect: "manual", signal: opts.signal });
      } catch (e) {
        const timeout = opts.signal.aborted;
        opts.log.debug("HTTP request failed", { method: "GET", host: url.hostname, path: url.pathname, ms: Date.now() - started, timeout });
        throw new ConnectorError(timeout ? "network.timeout" : "network.unavailable", timeout ? "Request timed out" : "Network unavailable", { cause: e });
      }
      if (res.type === "opaqueredirect" || (res.status >= 300 && res.status < 400)) {
        await res.body?.cancel().catch(() => undefined);
        opts.log.debug("HTTP redirect refused", { method: "GET", host: url.hostname, path: url.pathname, status: res.status });
        throw unexpected("Unexpected redirect");
      }
      let text: string;
      try {
        text = await readLimited(res, maxBytes);
      } catch (e) {
        if (e instanceof ConnectorError) throw e;
        const timeout = opts.signal.aborted;
        throw new ConnectorError(timeout ? "network.timeout" : "network.unavailable", timeout ? "Request timed out" : "Network unavailable", { cause: e });
      }
      opts.log.debug("HTTP request", { method: "GET", host: url.hostname, path: url.pathname, status: res.status, ms: Date.now() - started });
      const outHeaders: Record<string, string> = {};
      res.headers.forEach((v, k) => (outHeaders[k] = v));
      return {
        status: res.status,
        headers: outHeaders,
        text: async () => text,
        json: async () => {
          try {
            return JSON.parse(text) as unknown;
          } catch {
            throw unexpected("Response is not JSON");
          }
        },
      };
    },
  };
}
