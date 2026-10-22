// Test double of the HttpClient (ADR 73, 74): records requests and answers with canned responses. No network.
import { ConnectorError, type HttpClient, type Secret } from "@ludiary/contracts";

type Req = Parameters<HttpClient["request"]>[0];
export interface FakeHttpAnswer {
  status: number;
  headers?: Readonly<Record<string, string>>;
  /** Serialised with JSON.stringify unless it is a string (use a string for a body that is not JSON). */
  body?: unknown;
}
export interface FakeHttp extends HttpClient {
  readonly requests: Req[];
}
export interface FakeHttpOptions {
  /** If given, a request to any other host is 'internal', like the real client (ADR 73). */
  hosts?: readonly string[];
}

const FORBIDDEN_HEADERS = new Set(["host", "cookie", "content-length", "connection", "transfer-encoding"]);
const reveal = (v: string | number | Secret): string => (typeof v === "object" ? v.reveal() : String(v));

/** Same rules as the real client (ADR 74): a GET with a body and bad headers are 'internal'. */
function checkRequest(req: Req, opts: FakeHttpOptions): void {
  if (req.method === "GET" && req.body !== undefined) throw new ConnectorError("internal", "A GET request cannot have a body");
  for (const [name, value] of Object.entries(req.headers ?? {})) {
    if (!/^[a-z0-9-]{1,64}$/.test(name) || FORBIDDEN_HEADERS.has(name)) throw new ConnectorError("internal", `Header '${name}' is not allowed`);
    if (/[\r\n]/.test(reveal(value))) throw new ConnectorError("internal", `Header '${name}' has CR or LF`);
  }
  const url = new URL(req.url);
  if (url.protocol !== "https:") throw new ConnectorError("internal", "Only https is allowed");
  if (opts.hosts && !opts.hosts.includes(url.hostname)) throw new ConnectorError("internal", "Host is not in apiHosts");
}

/** A handler that throws (e.g. a ConnectorError) simulates a transport failure. */
export function fakeHttp(handler: (req: Req) => FakeHttpAnswer | Promise<FakeHttpAnswer>, opts: FakeHttpOptions = {}): FakeHttp {
  const requests: Req[] = [];
  return {
    requests,
    async request(req) {
      requests.push(req);
      checkRequest(req, opts);
      const a = await handler(req);
      const text = typeof a.body === "string" ? a.body : JSON.stringify(a.body ?? null);
      return {
        status: a.status,
        headers: a.headers ?? {},
        json: async () => {
          try {
            return JSON.parse(text) as unknown;
          } catch {
            throw new ConnectorError("store.unexpected-response", "Response is not JSON");
          }
        },
        text: async () => text,
      };
    },
  };
}

/** What the server would see on the wire: Secrets revealed. For assertions only. */
export function sentForm(req: Req): Record<string, string> {
  const form = req.body && "form" in req.body ? req.body.form : {};
  return Object.fromEntries(Object.entries(form).map(([k, v]) => [k, reveal(v)]));
}
export function sentQuery(req: Req): Record<string, string> {
  return Object.fromEntries(Object.entries(req.query ?? {}).map(([k, v]) => [k, reveal(v)]));
}
export function sentHeaders(req: Req): Record<string, string> {
  return Object.fromEntries(Object.entries(req.headers ?? {}).map(([k, v]) => [k, reveal(v)]));
}
