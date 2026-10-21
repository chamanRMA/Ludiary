import { randomBytes } from "node:crypto";
import { request } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { launcherProof, serverProof } from "../src/proofs";
import { createLocalServer, type LocalServer } from "../src/server";
import { OPEN_LINK_TTL_MS, SESSION_ABSOLUTE_MS, SESSION_IDLE_MS, SessionStore } from "../src/sessions";

const KEY = randomBytes(32);

interface Res {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  json: () => Record<string, unknown>;
}

// node:http instead of fetch: fetch does not let us forge the Host header.
function send(
  port: number,
  path: string,
  opts: { method?: string; headers?: Record<string, string>; body?: unknown } = {},
): Promise<Res> {
  return new Promise((resolve, reject) => {
    const payload = opts.body === undefined ? undefined : JSON.stringify(opts.body);
    const headers: Record<string, string> = { host: `127.0.0.1:${port}`, ...opts.headers };
    if (payload !== undefined) headers["content-type"] = "application/json";
    const req = request({ host: "127.0.0.1", port, path, method: opts.method ?? "GET", headers }, (res) => {
      let text = "";
      res.setEncoding("utf8");
      res.on("data", (c: string) => (text += c));
      res.on("end", () => resolve({ status: res.statusCode ?? 0, headers: res.headers, json: () => JSON.parse(text) }));
    });
    req.on("error", reject);
    req.end(payload);
  });
}

let server: LocalServer | null = null;
let shutdowns = 0;
afterEach(async () => {
  await server?.close();
  server = null;
  shutdowns = 0;
});

async function start(sessions = new SessionStore()): Promise<number> {
  server = createLocalServer({
    appId: "Ludiary",
    version: "test",
    launcherKey: KEY,
    sessions,
    t: (key) => key,
    getStatus: () => ({}),
    onShutdownRequested: () => shutdowns++,
  });
  return server.listen(0);
}

async function challenge(port: number): Promise<string> {
  return (await send(port, "/api/launcher/challenge", { method: "POST", body: {} })).json()["nonce"] as string;
}

describe("local server guards (ADR 23)", () => {
  it("rejects a foreign Host header (DNS rebinding)", async () => {
    const port = await start();
    expect((await send(port, "/api/health", { headers: { host: `evil.example:${port}` } })).status).toBe(421);
    expect((await send(port, "/api/health", { headers: { host: `localhost:${port}` } })).status).toBe(421);
    expect((await send(port, "/api/health")).status).toBe(200);
  });

  it("refuses the launcher protocol to any browser request (any Origin)", async () => {
    const port = await start();
    for (const origin of ["https://evil.example", `http://127.0.0.1:${port}`]) {
      expect((await send(port, "/api/launcher/challenge", { method: "POST", body: {}, headers: { origin } })).status).toBe(403);
    }
  });

  it("redeems an open link only once, for an HttpOnly SameSite=Strict cookie", async () => {
    const port = await start();
    const url = new URL(server!.createOpenUrl());
    const first = await send(port, url.pathname + url.search);
    expect(first.status).toBe(302);
    const cookie = String(first.headers["set-cookie"]);
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/SameSite=Strict/);
    expect((await send(port, url.pathname + url.search)).status).toBe(403);
    const session = cookie.split(";")[0]!;
    expect((await send(port, "/", { headers: { cookie: session } })).status).toBe(200);
    expect((await send(port, "/")).status).toBe(401);
    expect((await send(port, "/api/status")).status).toBe(401);
  });
});

describe("launcher protocol (ADR 63)", () => {
  it("answers a correct proof with a result the launcher can verify", async () => {
    const port = await start();
    const nonce = await challenge(port);
    const res = await send(port, "/api/launcher/open-link", { method: "POST", body: { nonce, proof: launcherProof(KEY, "open-link", port, nonce) } });
    expect(res.status).toBe(200);
    const { result, proof } = res.json() as { result: string; proof: string };
    expect(result).toMatch(new RegExp(`^http://127\\.0\\.0\\.1:${port}/open\\?t=`));
    expect(proof).toBe(serverProof(KEY, "open-link", port, nonce, result));
  });

  it("rejects a wrong key, a reused nonce, another port's proof and unknown actions with the same 401", async () => {
    const port = await start();
    const other = randomBytes(32);
    let nonce = await challenge(port);
    expect((await send(port, "/api/launcher/open-link", { method: "POST", body: { nonce, proof: launcherProof(other, "open-link", port, nonce) } })).status).toBe(401);
    // The failed attempt consumed the nonce: even the right proof is refused now.
    expect((await send(port, "/api/launcher/open-link", { method: "POST", body: { nonce, proof: launcherProof(KEY, "open-link", port, nonce) } })).status).toBe(401);
    nonce = await challenge(port);
    expect((await send(port, "/api/launcher/open-link", { method: "POST", body: { nonce, proof: launcherProof(KEY, "open-link", port + 1, nonce) } })).status).toBe(401);
    nonce = await challenge(port);
    expect((await send(port, "/api/launcher/open-link", { method: "POST", body: { nonce, proof: launcherProof(KEY, "shutdown", port, nonce) } })).status).toBe(401);
    nonce = await challenge(port);
    expect((await send(port, "/api/launcher/exec", { method: "POST", body: { nonce, proof: "x" } })).status).toBe(401);
  });

  it("shuts down only with a valid proof", async () => {
    const port = await start();
    expect((await send(port, "/api/launcher/shutdown", { method: "POST", body: {} })).status).toBe(401);
    await new Promise((r) => setImmediate(r));
    expect(shutdowns).toBe(0);
    const nonce = await challenge(port);
    expect((await send(port, "/api/launcher/shutdown", { method: "POST", body: { nonce, proof: launcherProof(KEY, "shutdown", port, nonce) } })).status).toBe(200);
    await new Promise((r) => setImmediate(r));
    expect(shutdowns).toBe(1);
  });
});

describe("session store (ADR 29, 54)", () => {
  it("expires open links after 60 s and sessions after 30 idle days", () => {
    let now = 1_000_000;
    const store = new SessionStore(() => now);

    const late = store.createOpenLink();
    now += OPEN_LINK_TTL_MS + 1;
    expect(store.redeemOpenLink(late)).toBeNull();

    const session = store.redeemOpenLink(store.createOpenLink());
    expect(session).not.toBeNull();
    now += SESSION_IDLE_MS - 1;
    expect(store.touch(session!)).toBe(true); // renews the idle window
    now += SESSION_IDLE_MS + 1;
    expect(store.touch(session!)).toBe(false);
  });

  it("ends a session after 90 days even if it is used every day", () => {
    let now = 1_000_000;
    const store = new SessionStore(() => now);
    const session = store.redeemOpenLink(store.createOpenLink())!;
    const day = 24 * 3600_000;
    for (let d = 1; d <= 90; d++) {
      now += day;
      expect(store.touch(session)).toBe(true);
    }
    now += day;
    expect(store.touch(session)).toBe(false);
    expect(SESSION_ABSOLUTE_MS).toBe(90 * day);
  });
});
