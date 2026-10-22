// Test double of the HttpClient (ADR 73): records requests and answers with canned responses. No network.
import { ConnectorError, type HttpClient } from "@ludiary/contracts";

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

/** A handler that throws (e.g. a ConnectorError) simulates a transport failure. */
export function fakeHttp(handler: (req: Req) => FakeHttpAnswer | Promise<FakeHttpAnswer>): FakeHttp {
  const requests: Req[] = [];
  return {
    requests,
    async request(req) {
      requests.push(req);
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
