// HttpClient (ADR 73, 74): GET and POST, HTTPS, exact declared hosts, no redirects, bounded body.
import { ConnectorError, type ConnectorLogger, type HttpClient, type Secret } from "@ludiary/contracts";

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

const HEADER_NAME = /^[a-z0-9-]{1,64}$/;
const FORBIDDEN_HEADERS = new Set(["host", "cookie", "content-length", "connection", "transfer-encoding"]);
const reveal = (v: string | number | Secret): string => (typeof v === "object" ? v.reveal() : String(v));

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
      const method = req.method;
      if (method !== "GET" && method !== "POST") throw new ConnectorError("internal", "Unsupported HTTP method");
      if (method === "GET" && req.body !== undefined) throw new ConnectorError("internal", "A GET request cannot have a body");
      let url: URL;
      try {
        url = new URL(req.url);
      } catch {
        throw new ConnectorError("internal", "Invalid URL");
      }
      if (url.protocol !== "https:" || !opts.hosts.includes(url.hostname) || url.username !== "" || url.password !== "" || (url.port !== "" && url.port !== "443")) {
        throw new ConnectorError("internal", "URL is not allowed for this connector");
      }
      for (const [k, v] of Object.entries(req.query ?? {})) url.searchParams.append(k, reveal(v));
      const headers: Record<string, string> = { accept: "application/json" };
      for (const [k, v] of Object.entries(req.headers ?? {})) {
        const value = reveal(v);
        if (!HEADER_NAME.test(k) || FORBIDDEN_HEADERS.has(k) || /[\r\n]/.test(value)) throw new ConnectorError("internal", "Header is not allowed");
        headers[k] = value;
      }
      let body: string | undefined;
      if (req.body !== undefined) {
        if ("form" in req.body) {
          body = new URLSearchParams(Object.entries(req.body.form).map(([k, v]) => [k, reveal(v)] as [string, string])).toString();
          headers["content-type"] = "application/x-www-form-urlencoded";
        } else {
          body = JSON.stringify(req.body.json);
          if (body === undefined) throw new ConnectorError("internal", "The JSON body cannot be serialized");
          headers["content-type"] = "application/json";
        }
      }
      const started = Date.now();
      let res: Response;
      try {
        // "manual": a redirect is never followed, and it is recognised by its status instead of by undici's error text.
        res = await doFetch(url, { method, headers, redirect: "manual", signal: opts.signal, ...(body !== undefined ? { body } : {}) });
      } catch (e) {
        const timeout = opts.signal.aborted;
        opts.log.debug("HTTP request failed", { method, host: url.hostname, path: url.pathname, ms: Date.now() - started, timeout });
        throw new ConnectorError(timeout ? "network.timeout" : "network.unavailable", timeout ? "Request timed out" : "Network unavailable", { cause: e });
      }
      if (res.type === "opaqueredirect" || (res.status >= 300 && res.status < 400)) {
        await res.body?.cancel().catch(() => undefined);
        opts.log.debug("HTTP redirect refused", { method, host: url.hostname, path: url.pathname, status: res.status });
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
      opts.log.debug("HTTP request", { method, host: url.hostname, path: url.pathname, status: res.status, ms: Date.now() - started });
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
