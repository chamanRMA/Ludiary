import { ConnectorError, type ConnectorLogger, type Secret } from "@ludiary/contracts";
import { describe, expect, it, vi } from "vitest";
import { createHttpClient } from "../src";

const URL_OK = "https://api.example.com/path/v1/";

function setup(over: { fetch?: typeof fetch; maxBytes?: number; signal?: AbortSignal } = {}) {
  const logs: string[] = [];
  const log: ConnectorLogger = {
    debug: (m, f) => void logs.push(`${m} ${JSON.stringify(f ?? {})}`),
    info: (m, f) => void logs.push(`${m} ${JSON.stringify(f ?? {})}`),
    warn: (m, f) => void logs.push(`${m} ${JSON.stringify(f ?? {})}`),
  };
  const f = over.fetch ?? vi.fn(async () => new Response('{"a":1}', { status: 200, headers: { "x-k": "v" } }));
  const client = createHttpClient({
    hosts: ["api.example.com"],
    signal: over.signal ?? new AbortController().signal,
    log,
    fetch: f as typeof fetch,
    ...(over.maxBytes ? { maxBytes: over.maxBytes } : {}),
  });
  return { client, f: f as ReturnType<typeof vi.fn>, logs };
}
const get = (client: ReturnType<typeof setup>["client"], url = URL_OK, extra: object = {}) => client.request({ method: "GET", url, ...extra });
const codeOf = async (p: Promise<unknown>) => ((await p.catch((e: unknown) => e)) as ConnectorError).code;

describe("createHttpClient (ADR 73)", () => {
  it("does a GET and returns status, headers, text and json", async () => {
    const { client, f } = setup();
    const r = await get(client);
    expect(r.status).toBe(200);
    expect(r.headers["x-k"]).toBe("v");
    expect(await r.json()).toEqual({ a: 1 });
    expect(await r.text()).toBe('{"a":1}');
    const [url, init] = f.mock.calls[0] as [URL, RequestInit];
    expect(url.href).toBe(URL_OK);
    expect(init).toMatchObject({ method: "GET", redirect: "manual", headers: { accept: "application/json" } });
  });

  it("rejects http:, undeclared host, other port and credentials without calling fetch", async () => {
    const { client, f } = setup();
    for (const url of [
      "http://api.example.com/x",
      "https://other.example.com/x",
      "https://api.example.com.evil.com/x",
      "https://api.example.com:8443/x",
      "https://user:pw@api.example.com/x",
      "https://user@api.example.com/x",
      "ftp://api.example.com/x",
      "not a url",
    ]) {
      expect(await codeOf(get(client, url)), url).toBe("internal");
    }
    expect(f).not.toHaveBeenCalled();
    expect((await get(client, "https://api.example.com:443/x")).status).toBe(200);
  });

  it("a redirect is never followed and is store.unexpected-response", async () => {
    const f = vi.fn(async () => new Response(null, { status: 302, headers: { location: "https://evil.example/" } }));
    expect(await codeOf(get(setup({ fetch: f as unknown as typeof fetch }).client))).toBe("store.unexpected-response");
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("refuses a real redirect from a local server (undici, redirect: manual)", async () => {
    const { createServer } = await import("node:http");
    const server = createServer((_req, res) => res.writeHead(302, { location: "https://evil.example/" }).end());
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    const port = (server.address() as { port: number }).port;
    try {
      // The client only accepts https on 443, so call undici directly with the same options it uses.
      const res = await fetch(`http://127.0.0.1:${port}/`, { redirect: "manual" });
      expect(res.status).toBe(302); // not followed: the status is what the client checks
    } finally {
      server.close();
    }
  });

  it("limits the body by declared length and by streamed bytes", async () => {
    const big = "x".repeat(100);
    const declared = vi.fn(async () => new Response(big, { status: 200, headers: { "content-length": "100" } }));
    expect(await codeOf(get(setup({ fetch: declared as unknown as typeof fetch, maxBytes: 50 }).client))).toBe("store.unexpected-response");
    const streamed = vi.fn(async () => new Response(new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode(big)); c.close(); } })));
    expect(await codeOf(get(setup({ fetch: streamed as unknown as typeof fetch, maxBytes: 50 }).client))).toBe("store.unexpected-response");
    const fits = vi.fn(async () => new Response(big));
    expect(await (await get(setup({ fetch: fits as unknown as typeof fetch, maxBytes: 100 }).client)).text()).toBe(big);
  });

  it("json() of a body that is not JSON is store.unexpected-response; HTTP statuses are not errors", async () => {
    const f = vi.fn(async () => new Response("<html>", { status: 503 }));
    const r = await get(setup({ fetch: f as unknown as typeof fetch }).client);
    expect(r.status).toBe(503);
    expect(await codeOf(r.json())).toBe("store.unexpected-response");
  });

  it("an aborted signal is network.timeout and any other failure is network.unavailable", async () => {
    const ac = new AbortController();
    const f = vi.fn(async () => {
      ac.abort();
      throw new DOMException("aborted", "AbortError");
    });
    expect(await codeOf(get(setup({ fetch: f as unknown as typeof fetch, signal: ac.signal }).client))).toBe("network.timeout");
    const down = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    expect(await codeOf(get(setup({ fetch: down as unknown as typeof fetch }).client))).toBe("network.unavailable");
  });

  it("reveals a Secret only when sending, and the log has no query", async () => {
    const secret: Secret = { reveal: () => "s3cr3t-value", toString: () => "[redacted]", toJSON: () => "[redacted]" };
    const { client, f, logs } = setup();
    await get(client, URL_OK, { query: { key: secret, n: 5, input_json: '{"ids":[620]}' } });
    const url = (f.mock.calls[0] as [URL])[0];
    expect(url.searchParams.get("key")).toBe("s3cr3t-value");
    expect(url.searchParams.get("n")).toBe("5");
    const all = logs.join("\n");
    expect(all).toContain("api.example.com");
    expect(all).toContain("/path/v1/");
    expect(all).toContain('"status":200');
    expect(all).not.toMatch(/s3cr3t|620|input_json|key=/);
  });

  describe("POST and headers (ADR 74)", () => {
    const secret = (v: string): Secret => ({ reveal: () => v, toString: () => "[redacted]", toJSON: () => "[redacted]" });
    const post = (client: ReturnType<typeof setup>["client"], extra: object) => client.request({ method: "POST", url: URL_OK, ...extra });

    it("sends a form as application/x-www-form-urlencoded, revealing Secrets only then", async () => {
      const key = secret("0123456789abcdef0123456789abcdef");
      const { client, f, logs } = setup();
      await post(client, { body: { form: { "openid.mode": "check_authentication", k: key, "a b": "c&d" } } });
      const [, init] = f.mock.calls[0] as [URL, RequestInit];
      expect(init.method).toBe("POST");
      expect(init.body).toBe("openid.mode=check_authentication&k=0123456789abcdef0123456789abcdef&a+b=c%26d");
      expect(init.headers).toMatchObject({ "content-type": "application/x-www-form-urlencoded" });
      expect(JSON.stringify(key)).toBe('"[redacted]"');
      expect(logs.join("\n")).not.toMatch(/0123456789abcdef|check_authentication|openid/);
    });

    it("sends JSON", async () => {
      const { client, f } = setup();
      await post(client, { body: { json: { a: [1, 2] } } });
      const [, init] = f.mock.calls[0] as [URL, RequestInit];
      expect(init.body).toBe('{"a":[1,2]}');
      expect(init.headers).toMatchObject({ "content-type": "application/json", accept: "application/json" });
    });

    it("reveals a Secret header at send time and keeps it out of the log", async () => {
      const { client, f, logs } = setup();
      await get(client, URL_OK, { headers: { "x-webapi-key": secret("0123456789abcdef0123456789abcdef"), "x-n": "1" } });
      const [, init] = f.mock.calls[0] as [URL, RequestInit];
      expect(init.headers).toMatchObject({ "x-webapi-key": "0123456789abcdef0123456789abcdef", "x-n": "1", accept: "application/json" });
      expect(logs.join("\n")).not.toMatch(/0123456789abcdef|x-webapi-key/);
    });

    it("rejects forbidden or malformed headers and a GET with a body without calling fetch", async () => {
      const { client, f } = setup();
      const bad: Record<string, string | Secret>[] = [
        { host: "evil.example" },
        { cookie: "a=b" },
        { "content-length": "1" },
        { connection: "close" },
        { "transfer-encoding": "chunked" },
        { "X-Upper": "1" },
        { "x y": "1" },
        { "": "1" },
        { ["x-a".padEnd(65, "a")]: "1" },
        { "x-a": "line1\r\nx-b: 2" },
        { "x-a": "line1\nline2" },
        { "x-a": secret("a\rb") },
      ];
      for (const headers of bad) expect(await codeOf(get(client, URL_OK, { headers })), JSON.stringify(Object.keys(headers))).toBe("internal");
      expect(await codeOf(get(client, URL_OK, { body: { json: {} } }))).toBe("internal");
      expect(await codeOf(client.request({ method: "PUT" as "GET", url: URL_OK }))).toBe("internal");
      expect(f).not.toHaveBeenCalled();
    });

    it("maxBytes is per client", async () => {
      const big = "x".repeat(100);
      const f = vi.fn(async () => new Response(big));
      expect(await codeOf(post(setup({ fetch: f as unknown as typeof fetch, maxBytes: 99 }).client, { body: { json: {} } }))).toBe("store.unexpected-response");
      expect(await (await post(setup({ fetch: f as unknown as typeof fetch, maxBytes: 16 * 1024 * 1024 }).client, { body: { json: {} } })).text()).toBe(big);
    });
  });
});
