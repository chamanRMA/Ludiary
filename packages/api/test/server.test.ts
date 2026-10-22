import { randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { connect, type AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { launcherProof, serverProof } from "../src/proofs";
import { createLocalServer, type LocalServer, type LocalServerDeps } from "../src/server";
import { fakeCore, send } from "./helpers";
import { OPEN_LINK_TTL_MS, SESSION_ABSOLUTE_MS, SESSION_IDLE_MS, SessionStore } from "../src/sessions";

const KEY = randomBytes(32);

const minimalDeps = (): LocalServerDeps => ({
  appId: "Ludiary", version: "t", launcherKey: KEY, sessions: new SessionStore(), t: (k) => k, getStatus: () => ({}),
  onShutdownRequested: () => {}, core: fakeCore(), webAssets: new Map(), mediaHosts: [],
});

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
    core: fakeCore(),
    webAssets: new Map(),
    mediaHosts: [],
  });
  return server.listen(0);
}

async function challenge(port: number): Promise<string> {
  return (await send(port, "/api/launcher/challenge", { method: "POST", body: {} })).json()["nonce"] as string;
}

describe("local server guards (ADR 23)", () => {
  it("accepts only ludiary.localhost and 127.0.0.1 on the current port as Host (DNS rebinding, ADR 66)", async () => {
    const port = await start();
    for (const host of [`ludiary.localhost:${port}`, `127.0.0.1:${port}`]) {
      expect((await send(port, "/api/health", { headers: { host } })).status).toBe(200);
    }
    for (const host of [
      `evil.example:${port}`,
      `localhost:${port}`,
      `foo.localhost:${port}`,
      `ludiary.localhost:${port + 1}`,
      `ludiary.localhost.evil.example:${port}`,
      `[::1]:${port}`,
      `LUDIARY.LOCALHOST:${port}`,
      `ludiary.localhost.:${port}`,
      `ludiary.localhost:0${port}`,
      `xn--ludiary-.localhost:${port}`,
    ]) {
      expect((await send(port, "/api/health", { headers: { host } })).status, host).toBe(421);
    }
  });

  it("rejects a request with an empty or missing Host header", async () => {
    const port = await start();
    // Raw socket: node:http would fill in its own Host otherwise.
    const raw = (text: string) =>
      new Promise<number>((resolve, reject) => {
        const socket = connect(port, "127.0.0.1", () => socket.end(text));
        let data = "";
        socket.on("data", (c) => (data += c));
        socket.on("end", () => resolve(Number(data.split(" ")[1])));
        socket.on("error", reject);
      });
    expect(await raw("GET /api/health HTTP/1.0\r\n\r\n")).toBe(421);
    expect(await raw("GET /api/health HTTP/1.1\r\nHost: \r\nConnection: close\r\n\r\n")).not.toBe(200);
  });

  it("gives a browser-session cookie (no Max-Age) to the 127.0.0.1 plan B, and a 90-day one to the name", async () => {
    const port = await start();
    const byName = new URL(server!.createOpenUrl());
    const byIp = new URL(server!.createOpenUrl("ip"));
    const nameCookie = String((await send(port, byName.pathname + byName.search, { headers: { host: byName.host } })).headers["set-cookie"]);
    const ipCookie = String((await send(port, byIp.pathname + byIp.search, { headers: { host: byIp.host } })).headers["set-cookie"]);
    expect(nameCookie).toMatch(/Max-Age=7776000/);
    expect(ipCookie).not.toMatch(/Max-Age/);
  });

  it("frees both loopback addresses on close()", async () => {
    const port = await start();
    const hadIpv6 = server!.ipv6;
    await server!.close();
    server = null;
    for (const host of hadIpv6 ? ["127.0.0.1", "::1"] : ["127.0.0.1"]) {
      const probe = createServer();
      await new Promise<void>((resolve, reject) => {
        probe.once("error", reject);
        probe.listen({ host, port, ipv6Only: host === "::1" }, () => resolve());
      });
      await new Promise((r) => probe.close(r));
    }
  });

  it("accepts only our own two origins on browser routes", async () => {
    const port = await start();
    for (const origin of [`http://ludiary.localhost:${port}`, `http://127.0.0.1:${port}`]) {
      expect((await send(port, "/api/health", { headers: { origin } })).status).toBe(200);
    }
    for (const origin of [
      `http://foo.localhost:${port}`,
      `http://localhost:${port}`,
      `http://ludiary.localhost:${port + 1}`,
      `https://ludiary.localhost:${port}`,
      "null",
    ]) {
      expect((await send(port, "/api/health", { headers: { origin } })).status, origin).toBe(403);
    }
  });

  it("serves the same app on [::1], with the same Host check", async (ctx) => {
    const port = await start();
    if (!server!.ipv6) return ctx.skip(); // machine without IPv6 loopback
    expect((await send(port, "/api/health", { via: "::1", headers: { host: `ludiary.localhost:${port}` } })).status).toBe(200);
    expect((await send(port, "/api/health", { via: "::1", headers: { host: `evil.example:${port}` } })).status).toBe(421);
  });

  it("refuses to start if another program holds the port on either loopback address", async () => {
    for (const taken of ["::1", "127.0.0.1"] as const) {
      const squatter = createServer();
      try {
        await new Promise<void>((resolve, reject) => {
          squatter.once("error", reject);
          squatter.listen({ host: taken, port: 0, ipv6Only: taken === "::1" }, () => resolve());
        });
      } catch {
        if (taken === "::1") continue; // no IPv6 loopback here
        throw new Error("could not open the test socket");
      }
      const port = (squatter.address() as AddressInfo).port;
      const candidate = createLocalServer(minimalDeps());
      await expect(candidate.listen(port), taken).rejects.toMatchObject({ code: "EADDRINUSE" });
      await new Promise((r) => squatter.close(r));
      const again = createLocalServer(minimalDeps());
      expect(await again.listen(port)).toBe(port); // the failed attempt released what it had opened
      await again.close();
    }
  });

  it("finds the real session even if a planted cookie with the same name comes first", async () => {
    const port = await start();
    const url = new URL(server!.createOpenUrl());
    const real = String((await send(port, url.pathname + url.search)).headers["set-cookie"]).split(";")[0]!;
    for (const cookie of [`ludiary_session=planted; ${real}`, `${real}; ludiary_session=planted`]) {
      expect((await send(port, "/api/status", { headers: { cookie } })).status).toBe(200);
    }
  });

  it("refuses the launcher protocol to any browser request (any Origin)", async () => {
    const port = await start();
    for (const origin of ["https://evil.example", `http://127.0.0.1:${port}`, `http://ludiary.localhost:${port}`]) {
      expect((await send(port, "/api/launcher/challenge", { method: "POST", body: {}, headers: { origin } })).status).toBe(403);
    }
  });

  it("mints links for the name and for the IP address, both redeemable (ADR 66)", async () => {
    const port = await start();
    const byName = new URL(server!.createOpenUrl());
    const byIp = new URL(server!.createOpenUrl("ip"));
    expect(byName.host).toBe(`ludiary.localhost:${port}`);
    expect(byIp.host).toBe(`127.0.0.1:${port}`);
    expect((await send(port, byName.pathname + byName.search, { headers: { host: byName.host } })).status).toBe(200);
    expect((await send(port, byIp.pathname + byIp.search, { headers: { host: byIp.host } })).status).toBe(200);
  });

  it("redeems an open link only once, for an HttpOnly SameSite=Strict cookie", async () => {
    const port = await start();
    const url = new URL(server!.createOpenUrl());
    const first = await send(port, url.pathname + url.search);
    expect(first.status).toBe(200); // ADR 67: no redirect
    const cookie = String(first.headers["set-cookie"]);
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/SameSite=Strict/);
    expect((await send(port, url.pathname + url.search)).status).toBe(403);
    const session = cookie.split(";")[0]!;
    expect((await send(port, "/api/status", { headers: { cookie: session } })).status).toBe(200);
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
    expect(result).toMatch(new RegExp(`^http://ludiary\\.localhost:${port}/open\\?t=[A-Za-z0-9_-]{43}$`));
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

    const session = store.redeemOpenLink(store.createOpenLink())?.session;
    expect(session).toBeDefined();
    now += SESSION_IDLE_MS - 1;
    expect(store.touch(session!)).toBe(true); // renews the idle window
    now += SESSION_IDLE_MS + 1;
    expect(store.touch(session!)).toBe(false);
  });

  it("ends a session after 90 days even if it is used every day", () => {
    let now = 1_000_000;
    const store = new SessionStore(() => now);
    const session = store.redeemOpenLink(store.createOpenLink())!.session;
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
