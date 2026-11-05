// ADR 92 point 3 and 7: POST /api/logs/export is session+key, text/plain and absent without the dependency.
import { randomBytes } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { createLocalServer, type LocalServer } from "../src/server";
import { SessionStore } from "../src/sessions";
import { fakeCore, send } from "./helpers";

let server: LocalServer | null = null;
afterEach(async () => {
  await server?.close();
  server = null;
});

async function start(withExport: boolean) {
  server = createLocalServer({
    appId: "Ludiary", version: "test", launcherKey: randomBytes(32), sessions: new SessionStore(), t: (k) => k, getStatus: () => ({}),
    onShutdownRequested: () => {}, core: fakeCore(), webAssets: new Map(), mediaHosts: [],
    ...(withExport ? { exportLogs: async () => ({ filename: "ludiary-logs-test.txt", body: "hello" }) } : {}),
  });
  const port = await server.listen(0);
  const url = new URL(server.createOpenUrl());
  const res = await send(port, url.pathname + url.search, { headers: { host: url.host } });
  const cookie = String(res.headers["set-cookie"]).split(";")[0]!;
  const key = /name="ludiary-origin-key" content="([^"]+)"/.exec(res.text)![1]!;
  return { port, cookie, auth: { cookie, "x-ludiary-origin-key": key } };
}

describe("POST /api/logs/export", () => {
  it("needs the origin key", async () => {
    const { port, cookie } = await start(true);
    const res = await send(port, "/api/logs/export", { method: "POST", headers: { cookie }, body: {} });
    expect(res.status).toBe(401);
    expect(res.json()).toEqual({ error: "origin_key_required" });
  });

  it("answers the text file as an attachment", async () => {
    const { port, auth } = await start(true);
    const res = await send(port, "/api/logs/export", { method: "POST", headers: auth, body: {} });
    expect(res.status).toBe(200);
    expect(res.text).toBe("hello");
    expect(res.headers["content-type"]).toBe("text/plain; charset=utf-8");
    expect(res.headers["content-disposition"]).toBe('attachment; filename="ludiary-logs-test.txt"');
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
  });

  it("answers 409 action-unavailable without the dependency", async () => {
    const { port, auth } = await start(false);
    const res = await send(port, "/api/logs/export", { method: "POST", headers: auth, body: {} });
    expect(res.status).toBe(409);
    expect(res.json()).toMatchObject({ error: "action-unavailable" });
  });
});
