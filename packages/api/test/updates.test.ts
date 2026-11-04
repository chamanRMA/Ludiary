// ADR 90 point 10 and point 14 ("API"): the four write routes need the session and the origin key; unsupported answers 409.
import { randomBytes } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import type { UpdateStatusDto } from "@ludiary/api-contract";
import type { UpdatesFacade } from "../src/core";
import { createLocalServer, type LocalServer } from "../src/server";
import { launcherProof, proofsEqual, serverProof } from "../src/proofs";
import { SessionStore } from "../src/sessions";
import { FakeCoreError, fakeCore, send } from "./helpers";

const HEADER = "x-ludiary-origin-key";
const status: UpdateStatusDto = { mode: "notify", current: "0.2.0", state: "up-to-date", noticeSeen: true, lastCheckAt: 5 };

let server: LocalServer | null = null;
afterEach(async () => {
  await server?.close();
  server = null;
});

async function start(updates?: UpdatesFacade) {
  server = createLocalServer({
    appId: "Ludiary", version: "test", launcherKey: randomBytes(32), sessions: new SessionStore(), t: (k) => k, getStatus: () => ({}),
    onShutdownRequested: () => {}, core: fakeCore(), ...(updates ? { updates } : {}), webAssets: new Map(), mediaHosts: [],
  });
  const port = await server.listen(0);
  const url = new URL(server.createOpenUrl());
  const res = await send(port, url.pathname + url.search, { headers: { host: url.host } });
  const cookie = String(res.headers["set-cookie"]).split(";")[0]!;
  const key = /name="ludiary-origin-key" content="([^"]+)"/.exec(res.text)![1]!;
  return { port, cookie, auth: { cookie, [HEADER]: key } };
}

const WRITES: [string, string, unknown][] = [
  ["PUT", "/api/updates/settings", { mode: "off" }],
  ["POST", "/api/updates/check", {}],
  ["POST", "/api/updates/download", {}],
  ["POST", "/api/updates/restart", {}],
];

function facade(over: Partial<UpdatesFacade> = {}): UpdatesFacade & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    status: async () => status,
    setSettings: async (p) => (calls.push(`settings ${JSON.stringify(p)}`), status),
    checkNow: async () => void calls.push("check"),
    download: async (retryBad) => void calls.push(`download ${retryBad}`),
    restart: async () => void calls.push("restart"),
    ...over,
  };
}

describe("update routes", () => {
  it("reading needs the session; every write needs the session AND the origin key", async () => {
    const f = facade();
    const { port, cookie, auth } = await start(f);
    expect((await send(port, "/api/updates")).status).toBe(401);
    expect((await send(port, "/api/updates", { headers: { cookie } })).json()).toEqual(status);
    for (const [method, path, body] of WRITES) {
      expect((await send(port, path, { method, body })).status, `${method} ${path} without anything`).toBe(401);
      const cookieOnly = await send(port, path, { method, headers: { cookie }, body });
      expect(cookieOnly.status, `${method} ${path} with the cookie only`).toBe(401);
      expect(cookieOnly.json()).toEqual({ error: "origin_key_required" });
    }
    expect(f.calls).toEqual([]);
    for (const [method, path, body] of WRITES) expect([200, 202]).toContain((await send(port, path, { method, headers: auth, body })).status);
    expect(f.calls).toEqual(['settings {"mode":"off"}', "check", "download false", "restart"]);
  });

  it("passes retryBad and rejects unknown fields and modes", async () => {
    const f = facade();
    const { port, auth } = await start(f);
    await send(port, "/api/updates/download", { method: "POST", headers: auth, body: { retryBad: true } });
    expect(f.calls).toEqual(["download true"]);
    for (const [path, method, body] of [
      ["/api/updates/settings", "PUT", { mode: "sometimes" }],
      ["/api/updates/settings", "PUT", {}],
      ["/api/updates/settings", "PUT", { mode: "auto", url: "https://evil.example" }],
      ["/api/updates/download", "POST", { url: "https://evil.example" }],
      ["/api/updates/check", "POST", { x: 1 }],
    ] as const) {
      expect((await send(port, path, { method, headers: auth, body })).status, `${method} ${path} ${JSON.stringify(body)}`).toBe(400);
    }
  });

  it("without an updater (Docker) everything answers 409 update.unsupported", async () => {
    const { port, auth } = await start();
    expect((await send(port, "/api/updates", { headers: auth })).status).toBe(409);
    for (const [method, path, body] of WRITES) {
      const res = await send(port, path, { method, headers: auth, body });
      expect(res.status, `${method} ${path}`).toBe(409);
      expect(res.json()).toMatchObject({ error: "update.unsupported", detail: { key: "core.errors.update.unsupported" } });
    }
  });

  it("maps the updater errors: too soon 429, no space 507, a failed check 502, not ready 409", async () => {
    const fail = (code: string) => async () => {
      throw new FakeCoreError(code, `core.errors.${code}`);
    };
    const { port, auth } = await start(facade({ checkNow: fail("update.too-soon"), download: fail("update.no-space"), restart: fail("update.not-ready") }));
    expect((await send(port, "/api/updates/check", { method: "POST", headers: auth, body: {} })).status).toBe(429);
    expect((await send(port, "/api/updates/download", { method: "POST", headers: auth, body: {} })).status).toBe(507);
    expect((await send(port, "/api/updates/restart", { method: "POST", headers: auth, body: {} })).status).toBe(409);
    const { port: p2, auth: a2 } = await start(facade({ checkNow: fail("update.check-failed") }));
    expect((await send(p2, "/api/updates/check", { method: "POST", headers: a2, body: {} })).status).toBe(502);
  });
});

describe("launcher action `version` (ADR 90 point 18, A3)", () => {
  it("answers the server version with the signed proof of the protocol", async () => {
    const key = randomBytes(32);
    server = createLocalServer({ appId: "Ludiary", version: "0.3.0", launcherKey: key, sessions: new SessionStore(), t: (k) => k, getStatus: () => ({}), onShutdownRequested: () => {}, core: fakeCore(), webAssets: new Map(), mediaHosts: [] });
    const port = await server.listen(0);
    const { nonce } = (await send(port, "/api/launcher/challenge", { method: "POST", body: {} })).json() as { nonce: string };
    const res = await send(port, "/api/launcher/version", { method: "POST", body: { nonce, proof: launcherProof(key, "version", port, nonce) } });
    const body = res.json() as { result: string; proof: string };
    expect(body.result).toBe("0.3.0");
    expect(proofsEqual(body.proof, serverProof(key, "version", port, nonce, "0.3.0"))).toBe(true);
    // A proof made for another action does not work for this one.
    const { nonce: n2 } = (await send(port, "/api/launcher/challenge", { method: "POST", body: {} })).json() as { nonce: string };
    expect((await send(port, "/api/launcher/version", { method: "POST", body: { nonce: n2, proof: launcherProof(key, "open-link", port, n2) } })).status).toBe(401);
  });
});
