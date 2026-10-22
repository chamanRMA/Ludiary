import { randomBytes } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { createLocalServer, type LocalServer, type LocalServerDeps } from "../src/server";
import { SessionStore } from "../src/sessions";
import type { WebAsset } from "../src/web";
import { FakeCoreError, WIZARD_ROUTES, fakeCore, send } from "./helpers";

const HEADER = "x-ludiary-origin-key";
let server: LocalServer | null = null;
afterEach(async () => {
  await server?.close();
  server = null;
});

async function start(over: Partial<LocalServerDeps> & { core?: ReturnType<typeof fakeCore> } = {}) {
  const core = over.core ?? fakeCore();
  server = createLocalServer({
    appId: "Ludiary", version: "test", launcherKey: randomBytes(32), sessions: new SessionStore(), t: (k) => k,
    getStatus: () => ({}), onShutdownRequested: () => {}, webAssets: new Map(), mediaHosts: [], ...over, core,
  });
  const port = await server.listen(0);
  const url = new URL(server.createOpenUrl());
  const res = await send(port, url.pathname + url.search, { headers: { host: url.host } });
  const cookie = String(res.headers["set-cookie"]).split(";")[0]!;
  const key = /name="ludiary-origin-key" content="([^"]+)"/.exec(res.text)![1]!;
  const auth = { cookie, [HEADER]: key };
  const post = (path: string, body: unknown, host?: string) =>
    send(port, path, { method: "POST", headers: host ? { ...auth, host } : auth, body });
  return { port, core, cookie, auth, post };
}

describe("wizard routes (ADR 74, point 5)", () => {
  it("answers 401 without session and without origin key on every wizard route", async () => {
    const { port, core, cookie } = await start();
    for (const [method, path] of WIZARD_ROUTES) {
      const body = method === "POST" ? { body: {} } : {};
      expect((await send(port, path, { method, ...body })).status, `${method} ${path} no session`).toBe(401);
      const res = await send(port, path, { method, headers: { cookie }, ...body });
      expect(res.status, `${method} ${path}`).toBe(401);
      expect(res.json()).toEqual({ error: "origin_key_required" });
    }
    expect(core.calls).toEqual([]);
  });

  it("passes the validated origin to startWizard: from Host, never from the request", async () => {
    const { port, core, post } = await start();
    const viaIp = await post("/api/stores/steam/wizard", {});
    expect(viaIp.status).toBe(201);
    expect(viaIp.json()).toEqual(expect.objectContaining({ wizardId: "w-1" }));
    await post("/api/stores/steam/wizard", {}, `ludiary.localhost:${port}`);
    expect(core.calls).toEqual([
      ["startWizard", "steam", `http://127.0.0.1:${port}`],
      ["startWizard", "steam", `http://ludiary.localhost:${port}`],
    ]);
    expect((await post("/api/stores/steam/wizard", { returnBase: "http://evil.example" })).status).toBe(400);
    expect((await post("/api/stores/steam/wizard", {}, "evil.example")).status).toBe(421);
    expect((await post("/api/stores/steam/wizard", {}, `ludiary.localhost:${port + 1}`)).status).toBe(421);
    expect((await post("/api/stores/nope/wizard", {})).status).toBe(400);
    expect(core.calls.length).toBe(2);
  });

  it("submits fields and continue exactly as received, and rejects extras with 400", async () => {
    const { core, post } = await start();
    expect((await post("/api/wizards/w-1/submit", { stepId: "apikey", input: { kind: "fields", values: { apiKey: "k" } } })).status).toBe(200);
    await post("/api/wizards/w-1/submit", { stepId: "choose", input: { kind: "continue" } });
    expect(core.calls).toEqual([
      ["submitWizard", "w-1", "apikey", { kind: "fields", values: { apiKey: "k" } }],
      ["submitWizard", "w-1", "choose", { kind: "continue" }],
    ]);
    const bad: unknown[] = [
      { stepId: "choose", input: { kind: "continue" }, extra: 1 },
      { stepId: "choose", input: { kind: "callback", query: {} } },
      { stepId: "choose", input: { kind: "continue", x: 1 } },
      { stepId: "Bad Id", input: { kind: "continue" } },
      { stepId: "a", input: { kind: "fields", values: { x: "y".repeat(4097) } } },
      { stepId: "a", input: { kind: "fields", values: { "1bad": "y" } } },
      { stepId: "a", input: { kind: "fields", values: { "bad key": "y" } } },
    ];
    for (const body of bad) expect((await post("/api/wizards/w-1/submit", body)).status, JSON.stringify(body)).toBe(400);
    expect((await post("/api/wizards/w-1/submit?x=1", { stepId: "a", input: { kind: "continue" } })).status).toBe(400);
    expect(core.calls.length).toBe(2);
  });

  it("passes the callback query; refuses extras, more than 32 parameters and bad ids", async () => {
    const { core, post } = await start();
    const query = { "openid.mode": "id_res", "openid.ns": "http://specs.openid.net/auth/2.0" };
    const ok = await post("/api/wizards/w-1/callback", { query });
    expect(ok.status).toBe(200);
    expect(ok.json()).toEqual({ store: "steam", response: { kind: "done" } });
    expect(core.calls).toEqual([["wizardCallback", "w-1", query]]);
    const many = Object.fromEntries(Array.from({ length: 33 }, (_, i) => [`openid.p${i}`, "v"]));
    expect((await post("/api/wizards/w-1/callback", { query: many })).status).toBe(400);
    expect((await post("/api/wizards/w-1/callback", { query, extra: 1 })).status).toBe(400);
    expect((await post("/api/wizards/w-1/callback", { query: { "bad name": "v" } })).status).toBe(400);
    expect((await post("/api/wizards/w-1/callback", { query: { a: "x\u0001" } })).status).toBe(400);
    expect((await post("/api/wizards/w%201/callback", { query })).status).toBe(400);
    expect(core.calls.length).toBe(1);
  });

  it("cancels and disconnects with 204, and maps core errors", async () => {
    const core = fakeCore({
      submitWizard: async () => {
        throw new FakeCoreError("not-found", "errors.notFound");
      },
    });
    const { port, auth, post } = await start({ core });
    expect((await send(port, "/api/wizards/w-1", { method: "DELETE", headers: auth })).status).toBe(204);
    expect((await send(port, "/api/stores/steam/connection", { method: "DELETE", headers: auth })).status).toBe(204);
    expect((await post("/api/wizards/w-1/submit", { stepId: "a", input: { kind: "continue" } })).status).toBe(404);
    expect((await send(port, "/api/stores/nope/connection", { method: "DELETE", headers: auth })).status).toBe(400);
    expect(core.calls).toEqual([["cancelWizard", "w-1"], ["disconnect", "steam"]]);
  });

  it("launches with action and keeps rejecting unknown values and extra fields", async () => {
    const { core, post } = await start();
    expect((await post("/api/games/g1/launch", { action: "install" })).status).toBe(202);
    expect((await post("/api/games/g1/launch", { propertyId: "p1", action: "play" })).status).toBe(202);
    expect((await post("/api/games/g1/launch", { action: "run" })).status).toBe(400);
    expect((await post("/api/games/g1/launch", { action: "play", command: "calc" })).status).toBe(400);
    expect(core.calls).toEqual([["launch", "g1", undefined, "install"], ["launch", "g1", "p1", "play"]]);
  });

  it("serves /connect/return as index.html with no-referrer and a CSP that allows same-origin fetch", async () => {
    const assets = new Map<string, WebAsset>([["/index.html", { body: "<title>spa</title>", type: "text/html; charset=utf-8" }]]);
    const { port } = await start({ webAssets: assets });
    const res = await send(port, "/connect/return?w=w-1&openid.mode=id_res&openid.claimed_id=SECRET");
    expect(res.status).toBe(200);
    expect(res.text).toContain("<title>spa</title>");
    expect(res.text).not.toContain("SECRET");
    expect(res.headers["referrer-policy"]).toBe("no-referrer");
    expect(res.headers["content-security-policy"]).toContain("connect-src 'self'");
    expect(res.headers["cache-control"]).toBe("no-store");
  });
});
