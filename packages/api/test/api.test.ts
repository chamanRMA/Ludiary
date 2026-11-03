import { randomBytes } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { createLocalServer, type LocalServer, type LocalServerDeps } from "../src/server";
import { SessionStore } from "../src/sessions";
import { spaCsp, type WebAsset } from "../src/web";
import { FakeCoreError, PRICE_ROUTES, WIZARD_ROUTES, fakeCore, send } from "./helpers";

const KEY = randomBytes(32);
const HEADER = "x-ludiary-origin-key";

let server: LocalServer | null = null;
afterEach(async () => {
  await server?.close();
  server = null;
});

async function start(over: Partial<LocalServerDeps> = {}) {
  const sessions = over.sessions ?? new SessionStore();
  const core = fakeCore();
  server = createLocalServer({
    appId: "Ludiary", version: "test", launcherKey: KEY, sessions, t: (k) => k, getStatus: () => ({}),
    onShutdownRequested: () => {}, core, webAssets: new Map(), mediaHosts: [], ...over,
  });
  const port = await server.listen(0);
  return { port, core, sessions };
}

/** Redeems a link the way the browser does and returns the cookie and the origin key from the page. */
async function login(port: number) {
  const url = new URL(server!.createOpenUrl());
  const res = await send(port, url.pathname + url.search, { headers: { host: url.host } });
  const cookie = String(res.headers["set-cookie"]).split(";")[0]!;
  const originKey = /name="ludiary-origin-key" content="([^"]+)"/.exec(res.text)![1]!;
  return { cookie, originKey, auth: { cookie, [HEADER]: originKey } };
}

describe("origin key (ADR 67)", () => {
  it("opens the library with cookie plus key", async () => {
    const { port } = await start();
    const { auth } = await login(port);
    expect((await send(port, "/api/library", { headers: auth })).status).toBe(200);
  });

  it("answers 401 origin_key_required without key, with a wrong key and with another session's key", async () => {
    const { port } = await start();
    const a = await login(port);
    const b = await login(port);
    const cases: Record<string, string>[] = [
      { cookie: a.cookie },
      { cookie: a.cookie, [HEADER]: "x".repeat(43) },
      { cookie: a.cookie, [HEADER]: b.originKey },
      { cookie: a.cookie, [HEADER]: "" },
      { cookie: a.cookie, [HEADER]: "y".repeat(5000) },
    ];
    for (const headers of cases) {
      const res = await send(port, "/api/library", { headers });
      expect(res.status).toBe(401);
      expect(res.json()).toEqual({ error: "origin_key_required" });
    }
  });

  it("never accepts the key in the query, the body or a cookie", async () => {
    const { port } = await start();
    const { cookie, originKey } = await login(port);
    const q = await send(port, `/api/library?originKey=${originKey}&key=${originKey}`, { headers: { cookie } });
    expect(q.status).toBe(401);
    expect(q.json()).toEqual({ error: "origin_key_required" });
    const body = await send(port, "/api/onboarding/reset", { method: "POST", body: { originKey }, headers: { cookie } });
    expect(body.json()).toEqual({ error: "origin_key_required" });
    for (const name of ["ludiary.originKey", "originKey", "ludiary_origin_key"]) {
      const c = await send(port, "/api/library", { headers: { cookie: `${cookie}; ${name}=${originKey}` } });
      expect(c.json()).toEqual({ error: "origin_key_required" });
    }
  });

  it("refuses the key without a session cookie", async () => {
    const { port } = await start();
    const { originKey } = await login(port);
    const res = await send(port, "/api/library", { headers: { [HEADER]: originKey } });
    expect(res.status).toBe(401);
    expect(res.json()).toEqual({ error: "session_required" });
  });

  it("accepts the real session even with a planted cookie of the same name first", async () => {
    const { port } = await start();
    const { cookie, originKey } = await login(port);
    const res = await send(port, "/api/library", { headers: { cookie: `ludiary_session=planted; ${cookie}`, [HEADER]: originKey } });
    expect(res.status).toBe(200);
  });

  it("revokes cookie and key together when the sessions are revoked", async () => {
    const { port, sessions } = await start();
    const { auth } = await login(port);
    sessions.revokeAll();
    const res = await send(port, "/api/library", { headers: auth });
    expect(res.status).toBe(401);
    expect(res.json()).toEqual({ error: "session_required" });
  });

  it("does not survive a new server (key kept only in memory, cookie of the old one)", async () => {
    const first = await start();
    const { auth } = await login(first.port);
    await server!.close();
    const second = await start();
    const res = await send(second.port, "/api/library", { headers: auth });
    expect(res.status).toBe(401);
  });

  it("stores only a hash: the key is not in the session store", async () => {
    const store = new SessionStore();
    const link = store.createOpenLink();
    const redeemed = store.redeemOpenLink(link)!;
    expect(redeemed.originKey).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(JSON.stringify([...(store as unknown as { sessions: Map<string, unknown> }).sessions.values()])).not.toContain(redeemed.originKey);
    expect(store.authorize([redeemed.session], redeemed.originKey)).toBe("ok");
    expect(store.authorize([redeemed.session], undefined)).toBe("no-key");
    expect(store.authorize(["nope"], redeemed.originKey)).toBe("no-session");
  });
});

describe("access levels (ADR 67, 72)", () => {
  it("lets the public routes through and keeps /api/status on cookie only", async () => {
    const { port } = await start();
    expect((await send(port, "/api/health")).status).toBe(200);
    expect((await send(port, "/open.js")).status).toBe(200);
    expect((await send(port, "/api/status")).status).toBe(401);
    const { cookie } = await login(port);
    expect((await send(port, "/api/status", { headers: { cookie } })).status).toBe(200);
  });

  it("requires session+key on a route that declares nothing", async () => {
    const { port } = await start();
    const { cookie } = await login(port);
    // Every route of the slice, with the cookie only.
    const routes: [string, string][] = [
      ["GET", "/api/library"], ["GET", "/api/games/g1"], ["POST", "/api/games/g1/launch"], ["POST", "/api/sync"],
      ["GET", "/api/stores"], ["GET", "/api/onboarding"], ["POST", "/api/onboarding/complete"],
      ["POST", "/api/onboarding/reset"], ["GET", "/api/settings"], ["PATCH", "/api/settings"],
      ["PATCH", "/api/games/g1"], ["GET", "/api/collections"], ["POST", "/api/collections"], ["PATCH", "/api/collections/c1"], ["DELETE", "/api/collections/c1"],
      ["PATCH", "/api/scan-roots/r1"], ["DELETE", "/api/scan-roots/r1"], ["POST", "/api/scan-roots/pick"],
      ...WIZARD_ROUTES,
      ...PRICE_ROUTES,
    ];
    for (const [method, path] of routes) {
      const res = await send(port, path, { method, headers: { cookie }, ...(method === "GET" || method === "DELETE" ? {} : { body: {} }) });
      expect(res.status, `${method} ${path}`).toBe(401);
      expect(res.json()).toEqual({ error: "origin_key_required" });
    }
  });

  it("answers an unknown API route with 404 JSON and no authentication", async () => {
    const { port } = await start();
    const res = await send(port, "/api/nothing");
    expect(res.status).toBe(404);
    expect(res.json()).toEqual({ error: "not_found" });
  });
});

describe("/open and /open.js (ADR 67, 72)", () => {
  it("answers 200 with the key in a meta tag, no redirect, strict CSP and no key in the URL", async () => {
    const { port } = await start();
    const url = new URL(server!.createOpenUrl());
    const res = await send(port, url.pathname + url.search, { headers: { host: url.host } });
    expect(res.status).toBe(200);
    expect(res.headers["location"]).toBeUndefined();
    expect(res.headers["content-security-policy"]).toBe(
      "default-src 'none'; script-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
    );
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(res.text).toMatch(/<meta name="ludiary-origin-key" content="[A-Za-z0-9_-]{43}">/);
    expect(res.text).toContain('<script src="/open.js"></script>');
    expect(res.text).toContain("<noscript>web.open.noscript</noscript>");
    expect(res.text).not.toMatch(/<script>/); // no inline script
    expect(url.href).not.toMatch(/key/i);
  });

  it("answers 403 with a translated page, not JSON, for a used or invalid link", async () => {
    const { port } = await start();
    const url = new URL(server!.createOpenUrl());
    await send(port, url.pathname + url.search, { headers: { host: url.host } });
    for (const path of [url.pathname + url.search, "/open?t=bad", "/open"]) {
      const res = await send(port, path, { headers: { host: url.host } });
      expect(res.status).toBe(403);
      expect(String(res.headers["content-type"])).toContain("text/html");
      expect(res.text).toContain("web.open.invalid.title");
      expect(res.headers["set-cookie"]).toBeUndefined();
    }
  });

  it("serves a static /open.js built from the appId, without secrets", async () => {
    const { port } = await start();
    const res = await send(port, "/open.js");
    expect(res.status).toBe(200);
    expect(String(res.headers["content-type"])).toContain("javascript");
    expect(res.headers["content-security-policy"]).toContain("script-src 'self'");
    expect(res.text).toContain('localStorage.setItem("ludiary.originKey"');
    expect(res.text).toContain('location.replace("/")');
    expect(res.text).toContain('meta[name=\\"ludiary-origin-key\\"]');
    await login(port);
    expect((await send(port, "/open.js")).text).toBe(res.text); // identical after a login: nothing secret in it
  });
});

describe("static files (ADR 72, point 6)", () => {
  const assets = new Map<string, WebAsset>([
    ["/index.html", { body: "<!doctype html><title>spa</title>", type: "text/html; charset=utf-8" }],
    ["/assets/app-abc.js", { body: "console.log(1)", type: "text/javascript; charset=utf-8" }],
    ["/favicon.svg", { body: new Uint8Array([60, 115, 118, 103, 62]), type: "image/svg+xml" }],
  ]);

  it("serves '/' and a deep link as index.html with the SPA headers", async () => {
    const { port } = await start({ webAssets: assets, mediaHosts: ["shared.steamstatic.com"] });
    for (const path of ["/", "/game/12", "/settings?x=1", "/index.html"]) {
      const res = await send(port, path);
      expect(res.status, path).toBe(200);
      expect(res.text).toContain("<title>spa</title>");
      expect(res.headers["cache-control"]).toBe("no-store");
      expect(res.headers["referrer-policy"]).toBe("no-referrer");
      expect(res.headers["content-security-policy"]).toContain("img-src 'self' data: https://shared.steamstatic.com;");
    }
  });

  it("serves /assets/* with immutable cache and other files with no-store", async () => {
    const { port } = await start({ webAssets: assets });
    const js = await send(port, "/assets/app-abc.js");
    expect(js.headers["cache-control"]).toBe("public, max-age=31536000, immutable");
    expect(js.headers["content-type"]).toBe("text/javascript; charset=utf-8");
    const icon = await send(port, "/favicon.svg");
    expect(icon.text).toBe("<svg>");
    expect(icon.headers["cache-control"]).toBe("no-store");
  });

  it("does not fall back to index.html for /api/, /open, /assets/ or non-GET", async () => {
    const { port } = await start({ webAssets: assets });
    for (const path of ["/api/unknown", "/open/x", "/assets/missing.js"]) {
      const res = await send(port, path);
      expect(res.status, path).toBe(404);
      expect(res.json()).toEqual({ error: "not_found" });
    }
    expect((await send(port, "/game/1", { method: "POST", body: {} })).status).toBe(404);
  });

  it("serves only what is in the map: traversal attempts are 404 or the SPA, never a file", async () => {
    const { port } = await start({ webAssets: new Map([["/assets/a.js", assets.get("/assets/app-abc.js")!]]) });
    for (const path of ["/assets/../package.json", "/assets/%2e%2e/package.json", "/assets//a.js", "/../etc/passwd"]) {
      const res = await send(port, path);
      expect(res.text, path).not.toContain("console.log");
      expect(res.status, path).toBe(404);
    }
  });

  it("shows a translated page asking to reinstall when the map is empty, and keeps the API working", async () => {
    const { port } = await start();
    const res = await send(port, "/");
    expect(res.status).toBe(503);
    expect(res.text).toContain("web.missing.title");
    expect(res.text).toContain("web.missing.body");
    expect((await send(port, "/api/health")).status).toBe(200);
    expect((await send(port, "/api/missing")).status).toBe(404);
  });

  it("builds the CSP from the union of mediaHosts, without duplicates, and rejects hostile values", () => {
    expect(spaCsp(["a.example", "b.example", "a.example"])).toContain("img-src 'self' data: https://a.example https://b.example;");
    expect(spaCsp([])).toContain("img-src 'self' data:;");
    expect(spaCsp([])).toContain("script-src 'self'; style-src 'self'");
    expect(spaCsp([])).not.toContain("unsafe");
    for (const bad of ["x.example; script-src *", "https://x.example", "x.example/", "", "*.example", "a b"]) {
      expect(() => spaCsp([bad]), bad).toThrow();
    }
    expect(() => createLocalServer({ ...minimal(), mediaHosts: ["bad host"] })).toThrow();
  });
});

function minimal(): LocalServerDeps {
  return {
    appId: "Ludiary", version: "t", launcherKey: KEY, sessions: new SessionStore(), t: (k) => k, getStatus: () => ({}),
    onShutdownRequested: () => {}, core: fakeCore(), webAssets: new Map(), mediaHosts: [],
  };
}

describe("routes against the fake facade (ADR 72, point 5)", () => {
  it("GET /api/library and /api/games/:id", async () => {
    const { port, core } = await start();
    const { auth } = await login(port);
    const lib = await send(port, "/api/library", { headers: auth });
    expect(lib.json()).toEqual([expect.objectContaining({ id: "g1", title: "Game One" })]);
    const game = await send(port, "/api/games/g1", { headers: auth });
    expect(game.status).toBe(200);
    expect((game.json()["properties"] as unknown[]).length).toBe(1);
    const missing = await send(port, "/api/games/nope", { headers: auth });
    expect(missing.status).toBe(404);
    expect(missing.json()).toEqual({ error: "not-found" });
    expect(core.calls.map((c) => c[0])).toEqual(["listLibrary", "getGame", "getGame"]);
  });

  it("launches by id with 202 and passes propertyId", async () => {
    const { port, core } = await start();
    const { auth } = await login(port);
    const res = await send(port, "/api/games/g1/launch", { method: "POST", headers: auth, body: { propertyId: "p1" } });
    expect(res.status).toBe(202);
    expect(res.json()).toEqual({ status: "started" });
    await send(port, "/api/games/g1/launch", { method: "POST", headers: auth, body: {} });
    expect(core.calls.filter((c) => c[0] === "launch")).toEqual([["launch", "g1", "p1", undefined], ["launch", "g1", undefined, undefined]]);
  });

  it("rejects extra fields in the launch request with 400 and never calls the core (invariant 3)", async () => {
    const { port, core } = await start();
    const { auth } = await login(port);
    const bodies = [
      { uri: "steam://rungameid/1" }, { command: "calc.exe" }, { path: "C:\\x.exe" },
      { propertyId: "p1", command: "calc.exe" }, { propertyId: 5 }, { propertyId: "" }, { propertyId: "x".repeat(65) },
    ];
    for (const body of bodies) {
      const res = await send(port, "/api/games/g1/launch", { method: "POST", headers: auth, body });
      expect(res.status, JSON.stringify(body)).toBe(400);
      expect(res.json()).toEqual({ error: "invalid_request" });
    }
    expect((await send(port, "/api/games/g1/launch", { method: "POST", headers: auth, rawBody: "{bad" })).status).toBe(400);
    expect((await send(port, "/api/games/g1/launch?uri=x", { method: "POST", headers: auth, body: {} })).status).toBe(400);
    expect(core.calls.some((c) => c[0] === "launch")).toBe(false);
  });

  it("maps core errors: unknown game 404, busy 409, launch.rejected 422, unexpected 500 without detail", async () => {
    const core = fakeCore({
      launch: async (id) => {
        if (id === "ghost") throw new FakeCoreError("not-found", "errors.core.not-found");
        if (id === "busy") throw new FakeCoreError("busy", "errors.core.busy");
        if (id === "rej") throw new FakeCoreError("launch.rejected", "errors.launch.rejected", { store: "steam" });
        if (id === "inv") throw new FakeCoreError("invalid-input", "errors.core.invalid-input");
        throw new Error("C:\\Users\\someone\\secret exploded");
      },
    });
    const logged: unknown[] = [];
    const { port } = await start({ core, onInternalError: (e) => logged.push(e) });
    const { auth } = await login(port);
    const call = (id: string) => send(port, `/api/games/${id}/launch`, { method: "POST", headers: auth, body: {} });
    const ghost = await call("ghost");
    expect(ghost.status).toBe(404);
    expect(ghost.json()).toEqual({ error: "not-found", detail: { code: "not-found", key: "errors.core.not-found" } });
    expect((await call("busy")).status).toBe(409);
    expect((await call("inv")).status).toBe(400);
    const rej = await call("rej");
    expect(rej.status).toBe(422);
    expect(rej.json()).toEqual({ error: "launch.rejected", detail: { code: "launch.rejected", key: "errors.launch.rejected", params: { store: "steam" } } });
    const boom = await call("other");
    expect(boom.status).toBe(500);
    expect(boom.json()).toEqual({ error: "internal_error" });
    expect(logged).toHaveLength(1);
  });

  it("POST /api/sync validates the request, answers 202 with the store status", async () => {
    const { port, core } = await start();
    const { auth } = await login(port);
    const ok = await send(port, "/api/sync", { method: "POST", headers: auth, body: { trigger: "open" } });
    expect(ok.status).toBe(202);
    expect(ok.json()).toEqual([expect.objectContaining({ store: "steam", mode: "installed-only" })]);
    await send(port, "/api/sync", { method: "POST", headers: auth, body: { trigger: "manual", operations: ["scan"] } });
    expect(core.calls.filter((c) => c[0] === "requestSync")).toEqual([
      ["requestSync", { trigger: "open" }],
      ["requestSync", { trigger: "manual", operations: ["scan"] }],
    ]);
    for (const body of [{}, { trigger: "auto" }, { trigger: "open", extra: 1 }, { trigger: "open", operations: ["scan", "scan"] }, { trigger: "open", operations: ["x"] }]) {
      expect((await send(port, "/api/sync", { method: "POST", headers: auth, body })).status, JSON.stringify(body)).toBe(400);
    }
  });

  it("GET /api/stores", async () => {
    const { port } = await start();
    const { auth } = await login(port);
    const res = await send(port, "/api/stores", { headers: auth });
    expect(res.status).toBe(200);
    expect(res.json()).toEqual([{ store: "steam", access: "official-api", connection: "disconnected", mode: "installed-only", collections: { status: "idle", lastSuccessAt: 1000, accountVerified: true, favoritesPending: 0 }, sync: [{ operation: "scan", state: "idle" }] }]);
  });

  it("onboarding: get, complete (204, null allowed) and reset (204)", async () => {
    const { port, core } = await start();
    const { auth } = await login(port);
    expect((await send(port, "/api/onboarding", { headers: auth })).json()).toEqual({ completedAt: null, detection: null });
    expect((await send(port, "/api/onboarding/complete", { method: "POST", headers: auth, body: { detection: "auto-and-manual" } })).status).toBe(204);
    expect((await send(port, "/api/onboarding/complete", { method: "POST", headers: auth, body: { detection: null } })).status).toBe(204);
    expect((await send(port, "/api/onboarding/complete", { method: "POST", headers: auth, body: { detection: "bogus" } })).status).toBe(400);
    expect((await send(port, "/api/onboarding/complete", { method: "POST", headers: auth, body: {} })).status).toBe(400);
    expect((await send(port, "/api/onboarding/reset", { method: "POST", headers: auth })).status).toBe(204);
    expect(core.calls.filter((c) => c[0] === "completeOnboarding")).toEqual([["completeOnboarding", "auto-and-manual"], ["completeOnboarding", null]]);
    expect(core.calls.some((c) => c[0] === "resetOnboarding")).toBe(true);
  });

  it("settings: get and patch with validation", async () => {
    const { port, core } = await start();
    const { auth } = await login(port);
    const got = await send(port, "/api/settings", { headers: auth });
    expect(got.status).toBe(200);
    expect(got.json()["scanRoots"]).toHaveLength(1);
    expect(got.json()["storeCollections"]).toEqual({ steam: { enabled: true, unverifiedFavorites: false } }); // ADR 88
    expect(got.json()).not.toHaveProperty("backups"); // optional: absent means not available
    const patched = await send(port, "/api/settings", { method: "PATCH", headers: auth, body: { locale: "es", detection: "later" } });
    expect(patched.status).toBe(200);
    expect(core.calls.find((c) => c[0] === "updateSettings")).toEqual(["updateSettings", { locale: "es", detection: "later" }]);
    const sc = await send(port, "/api/settings", { method: "PATCH", headers: auth, body: { storeCollections: { steam: { enabled: false } } } });
    expect(sc.status).toBe(200);
    expect(core.calls.filter((c) => c[0] === "updateSettings").at(-1)).toEqual(["updateSettings", { storeCollections: { steam: { enabled: false } } }]);
    const before = core.calls.filter((c) => c[0] === "updateSettings").length;
    const bad = [{ locale: "fr" }, { detection: null }, { scanRoots: [] }, { autoUpdate: true }, { storeCollections: { nope: { enabled: true } } }, { storeCollections: { steam: { enabled: "yes" } } }, { storeCollections: { steam: { path: "x" } } }, { storeCollections: [] }];
    expect(before).toBeGreaterThan(0);
    for (const body of bad) {
      expect((await send(port, "/api/settings", { method: "PATCH", headers: auth, body })).status, JSON.stringify(body)).toBe(400);
    }
  });

  it("scan roots: patch returns the root, delete answers 204, errors map", async () => {
    const core = fakeCore({
      removeScanRoot: async (id) => {
        if (id === "disc") throw new FakeCoreError("invalid-input", "errors.scanRoot.notRemovable");
      },
    });
    const { port } = await start({ core });
    const { auth } = await login(port);
    const patched = await send(port, "/api/scan-roots/r1", { method: "PATCH", headers: auth, body: { enabled: false } });
    expect(patched.status).toBe(200);
    expect(patched.json()).toEqual({ id: "r1", origin: "user", path: "D:\\Games", enabled: true });
    expect(core.calls.find((c) => c[0] === "setScanRootEnabled")).toEqual(["setScanRootEnabled", "r1", false]);
    expect((await send(port, "/api/scan-roots/zzz", { method: "PATCH", headers: auth, body: { enabled: true } })).status).toBe(404);
    expect((await send(port, "/api/scan-roots/r1", { method: "PATCH", headers: auth, body: { enabled: "yes" } })).status).toBe(400);
    expect((await send(port, "/api/scan-roots/r1", { method: "PATCH", headers: auth, body: { enabled: true, path: "C:\\" } })).status).toBe(400);
    expect((await send(port, "/api/scan-roots/r1", { method: "DELETE", headers: auth })).status).toBe(204);
    expect((await send(port, "/api/scan-roots/disc", { method: "DELETE", headers: auth })).status).toBe(400);
  });

  it("pick: 201 with the folder, 200 cancelled, 409 busy, extra fields 400", async () => {
    let mode: "root" | "cancel" | "busy" = "root";
    const core = fakeCore({
      pickScanRoot: async () => {
        if (mode === "busy") throw new FakeCoreError("busy", "errors.core.busy");
        return mode === "cancel" ? null : { id: "r2", origin: "user" as const, path: "E:\\Juegos", enabled: true };
      },
    });
    const { port } = await start({ core });
    const { auth } = await login(port);
    const pick = (body: unknown = {}) => send(port, "/api/scan-roots/pick", { method: "POST", headers: auth, body });
    const created = await pick();
    expect(created.status).toBe(201);
    expect(created.json()).toMatchObject({ id: "r2", path: "E:\\Juegos" });
    mode = "cancel";
    const cancelled = await pick();
    expect(cancelled.status).toBe(200);
    expect(cancelled.json()).toEqual({ cancelled: true });
    mode = "busy";
    expect((await pick()).status).toBe(409);
    expect((await pick({ path: "C:\\" })).status).toBe(400);
  });
});

describe("favorites, tags and collections (ADR 85)", () => {
  it("PATCH /api/games/:id passes the fields to the core and answers the game", async () => {
    const { port, core } = await start();
    const { auth } = await login(port);
    const res = await send(port, "/api/games/g1", { method: "PATCH", headers: auth, body: { favorite: true, tags: ["Coop"], collectionIds: ["col1"] } });
    expect(res.status).toBe(200);
    expect(res.json()["id"]).toBe("g1");
    expect(core.calls.find((c) => c[0] === "updateGame")).toEqual(["updateGame", "g1", { favorite: true, tags: ["Coop"], collectionIds: ["col1"] }]);
  });

  it("PATCH /api/games/:id rejects an empty body, extra fields, wrong types and too many items with 400, never calling the core", async () => {
    const { port, core } = await start();
    const { auth } = await login(port);
    const bodies: unknown[] = [{}, { favorite: true, path: "x" }, { favorite: "yes" }, { tags: "a" }, { tags: [1] }, { tags: Array(1001).fill("a") }, { tags: ["x".repeat(201)] }, { collectionIds: Array(201).fill("c") }];
    for (const body of bodies) expect((await send(port, "/api/games/g1", { method: "PATCH", headers: auth, body })).status, JSON.stringify(body).slice(0, 40)).toBe(400);
    expect(core.calls.filter((c) => c[0] === "updateGame")).toEqual([]);
  });

  it("maps not-found to 404 and name-taken and limit-reached to 422 with their params", async () => {
    const core = fakeCore({
      updateGame: async () => { throw new FakeCoreError("not-found", "core.errors.not-found"); },
      createCollection: async () => { throw new FakeCoreError("name-taken", "core.errors.name-taken"); },
      renameCollection: async () => { throw new FakeCoreError("limit-reached", "core.errors.limit-reached", { max: 200 }); },
    });
    const { port } = await start({ core });
    const { auth } = await login(port);
    expect((await send(port, "/api/games/g1", { method: "PATCH", headers: auth, body: { favorite: true } })).status).toBe(404);
    const taken = await send(port, "/api/collections", { method: "POST", headers: auth, body: { name: "A" } });
    expect([taken.status, taken.json()["error"]]).toEqual([422, "name-taken"]);
    const full = await send(port, "/api/collections/c1", { method: "PATCH", headers: auth, body: { name: "A" } });
    expect([full.status, full.json()["detail"]]).toEqual([422, { code: "limit-reached", key: "core.errors.limit-reached", params: { max: 200 } }]);
  });

  it("collections: list, create 201, rename 200, delete 204, strict bodies", async () => {
    const { port, core } = await start();
    const { auth } = await login(port);
    expect((await send(port, "/api/collections", { headers: auth })).json()).toEqual([{ id: "col1", name: "Pending", source: null, gameIds: ["g1"] }, { id: "col2", name: "Co-op", source: "steam", gameIds: ["g1"] }]);
    const created = await send(port, "/api/collections", { method: "POST", headers: auth, body: { name: "Pending" } });
    expect([created.status, created.json()]).toEqual([201, { id: "col1", name: "Pending", source: null, gameIds: [] }]);
    expect((await send(port, "/api/collections/col1", { method: "PATCH", headers: auth, body: { name: "Renamed" } })).json()["name"]).toBe("Renamed");
    expect((await send(port, "/api/collections/col1", { method: "DELETE", headers: auth })).status).toBe(204);
    for (const body of [{}, { name: 5 }, { name: "A", gameIds: [] }]) {
      expect((await send(port, "/api/collections", { method: "POST", headers: auth, body })).status).toBe(400);
      expect((await send(port, "/api/collections/col1", { method: "PATCH", headers: auth, body })).status).toBe(400);
    }
    expect(core.calls.filter((c) => c[0] === "createCollection" || c[0] === "renameCollection")).toHaveLength(2);
  });
});

describe("collections of a store as a mirror (ADR 88)", () => {
  it("the import route no longer exists", async () => {
    const { port } = await start();
    const { auth } = await login(port);
    expect((await send(port, "/api/collections/import", { method: "POST", headers: auth, body: { store: "steam" } })).status).toBe(404);
  });

  it("renaming or deleting a mirror is 422 with the managed key; the game page and the list carry the source", async () => {
    const managed = async () => { throw new FakeCoreError("collection-managed", "core.errors.collectionManaged"); };
    const { port } = await start({ core: fakeCore({ renameCollection: managed, deleteCollection: managed }) });
    const { auth } = await login(port);
    const rename = await send(port, "/api/collections/col2", { method: "PATCH", headers: auth, body: { name: "A" } });
    expect([rename.status, rename.json()["error"], (rename.json()["detail"] as { key: string }).key]).toEqual([422, "collection-managed", "core.errors.collectionManaged"]);
    expect((await send(port, "/api/collections/col2", { method: "DELETE", headers: auth })).status).toBe(422);
    const game = await send(port, "/api/games/g1", { headers: auth });
    expect(game.json()["collections"]).toEqual([{ id: "col1", name: "Pending", source: null }, { id: "col2", name: "Co-op", source: "steam" }]);
  });
});

describe("revoke all browser sessions (ADR 54, 67)", () => {
  it("needs cookie plus origin key and signs out every session, the caller's included", async () => {
    const { port } = await start();
    const a = await login(port);
    const b = await login(port);
    expect((await send(port, "/api/sessions/revoke", { method: "POST", body: {}, headers: { cookie: a.cookie } })).status).toBe(401);
    expect((await send(port, "/api/library", { headers: b.auth })).status).toBe(200); // the refused call revoked nothing
    expect((await send(port, "/api/sessions/revoke", { method: "POST", body: {}, headers: a.auth })).status).toBe(204);
    for (const s of [a, b]) {
      const res = await send(port, "/api/library", { headers: s.auth });
      expect(res.status).toBe(401);
      expect(res.json()).toEqual({ error: "session_required" });
    }
  });
});

describe("services and prices (ADR 86, point 15 A2)", () => {
  it("every route, the GET ones included, is refused without the origin key and never reaches the core", async () => {
    const { port, core } = await start();
    const { cookie } = await login(port);
    for (const [method, path] of PRICE_ROUTES) {
      const res = await send(port, path, { method, headers: { cookie }, ...(method === "GET" || method === "DELETE" ? {} : { body: {} }) });
      expect(res.status, `${method} ${path}`).toBe(401);
      expect(res.json()).toEqual({ error: "origin_key_required" });
    }
    expect(core.calls).toEqual([]);
  });

  it("answers the happy paths with the documented status codes", async () => {
    const { port, core } = await start();
    const { auth } = await login(port);
    const go = (method: string, path: string, body?: unknown) => send(port, path, { method, headers: auth, ...(body !== undefined ? { body } : {}) });
    expect((await go("GET", "/api/services")).status).toBe(200);
    expect((await go("POST", "/api/services/itad/wizard", {})).status).toBe(201);
    expect(core.calls.find((c) => c[0] === "startServiceWizard")).toEqual(["startServiceWizard", "itad", `http://127.0.0.1:${port}`]);
    expect((await go("DELETE", "/api/services/itad/connection")).status).toBe(204);
    expect((await go("GET", "/api/prices/games/g1")).json()).toMatchObject({ link: "found" });
    expect((await go("GET", "/api/prices")).status).toBe(200);
    expect((await go("POST", "/api/prices/refresh", { canonicalIds: ["g1"], manual: true })).status).toBe(204);
    expect((await go("PUT", "/api/prices/games/g1/exclusion", {})).status).toBe(204);
    expect((await go("DELETE", "/api/prices/games/g1/exclusion")).status).toBe(204);
    expect((await go("POST", "/api/prices/search", { title: "hi" })).json()).toEqual([{ resultId: "r1", title: "Found", type: "game", watched: false }]);
    expect((await go("POST", "/api/prices/watch", { resultId: "r1" })).status).toBe(201);
    expect((await go("DELETE", "/api/prices/watch/w1")).status).toBe(204);
    expect(core.calls.find((c) => c[0] === "setPriceExclusion")).toEqual(["setPriceExclusion", "g1", true]);
  });

  it("the GET routes only call the readers of the core", async () => {
    const { port, core } = await start();
    const { auth } = await login(port);
    for (const path of ["/api/prices/games/g1", "/api/prices", "/api/services"]) await send(port, path, { headers: auth });
    expect(core.calls.map((c) => c[0])).toEqual(["getGamePrices", "getPriceBoard", "listServices"]);
  });

  it("watch answers 200 when the game was already followed", async () => {
    const again = fakeCore({ watchPrice: async () => ({ item: { id: "w1", title: "Found", type: null, prices: null }, created: false }) });
    const { port } = await start({ core: again });
    const { auth } = await login(port);
    expect((await send(port, "/api/prices/watch", { method: "POST", headers: auth, body: { resultId: "r1" } })).status).toBe(200);
  });

  it("rejects extra keys, empty and oversized bodies, a service that is not implemented and a query string with 400, never calling the core", async () => {
    const { port, core } = await start();
    const { auth } = await login(port);
    const go = (method: string, path: string, body?: unknown) => send(port, path, { method, headers: auth, ...(body !== undefined ? { body } : {}) });
    const ids = (n: number) => Array.from({ length: n }, (_, i) => `g${i}`);
    const bad: [string, string, unknown][] = [
      ["POST", "/api/prices/refresh", {}],
      ["POST", "/api/prices/refresh", { manual: true, extra: 1 }],
      ["POST", "/api/prices/refresh", { canonicalIds: ids(201) }],
      ["POST", "/api/prices/refresh", { canonicalIds: ["a", "a"] }],
      ["POST", "/api/prices/search", { title: "a" }],
      ["POST", "/api/prices/search", { title: "x".repeat(101) }],
      ["POST", "/api/prices/search", { title: "ok", extra: 1 }],
      ["POST", "/api/prices/watch", { resultId: "r1", title: "forged" }],
      ["POST", "/api/prices/watch", {}],
      ["POST", "/api/services/rawg/wizard", {}],
      ["POST", "/api/services/itad/wizard", { extra: 1 }],
      ["PUT", "/api/prices/games/g1/exclusion", { extra: 1 }],
      ["PATCH", "/api/settings", { prices: { country: "es" } }],
      ["PATCH", "/api/settings", { prices: { shops: "none" } }],
      ["PATCH", "/api/settings", { prices: { currency: "EUR" } }],
    ];
    for (const [m, p, b] of bad) expect((await go(m, p, b)).status, `${m} ${p} ${JSON.stringify(b)}`).toBe(400);
    expect((await go("GET", "/api/prices?x=1")).status).toBe(400);
    expect(core.calls).toEqual([]);
  });

  it("maps the errors of the price routes: no key 422, unknown game 404, list full 422 with its params", async () => {
    const throwing = fakeCore({
      refreshPrices: async () => { throw new FakeCoreError("action-unavailable", "prices.errors.notConnected"); },
      getGamePrices: async () => { throw new FakeCoreError("not-found", "core.errors.not-found"); },
      watchPrice: async () => { throw new FakeCoreError("limit-reached", "core.errors.limit-reached.watch", { max: 500 }); },
    });
    const { port } = await start({ core: throwing });
    const { auth } = await login(port);
    const r = await send(port, "/api/prices/refresh", { method: "POST", headers: auth, body: { manual: true } });
    expect(r.status).toBe(422);
    expect(r.json()).toMatchObject({ error: "action-unavailable", detail: { key: "prices.errors.notConnected" } });
    expect((await send(port, "/api/prices/games/zz", { headers: auth })).status).toBe(404);
    expect((await send(port, "/api/prices/watch", { method: "POST", headers: auth, body: { resultId: "r1" } })).json()).toMatchObject({ detail: { params: { max: 500 } } });
  });
});
