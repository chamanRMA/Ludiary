import { randomBytes } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { createLocalServer, type LocalServer } from "../src/server";
import { SessionStore } from "../src/sessions";
import { FakeCoreError, fakeCore, send } from "./helpers";

const HEADER = "x-ludiary-origin-key";
const ID = "ludiary-20261103T123456789Z-0a1b2c3d-manual.sqlite";
const state = { periodic: false, folder: null, folderIsDefault: true, lastBackupAt: null, lastError: null, lastRestore: null, copies: [] };

let server: LocalServer | null = null;
afterEach(async () => {
  await server?.close();
  server = null;
});

async function start(over: Parameters<typeof fakeCore>[0] = {}, withRestart = true) {
  const core = fakeCore({
    getBackups: async () => state,
    createBackup: async () => ({ id: ID, kind: "manual", createdAt: 1, sizeBytes: 5, foreign: false }),
    pickBackupFolder: async () => null,
    restoreBackup: async () => undefined,
    ...over,
  });
  const restarts: string[] = [];
  server = createLocalServer({
    appId: "Ludiary", version: "test", launcherKey: randomBytes(32), sessions: new SessionStore(), t: (k) => k, getStatus: () => ({}),
    onShutdownRequested: () => {}, ...(withRestart ? { onRestartRequested: () => void restarts.push("restart") } : {}), core, webAssets: new Map(), mediaHosts: [],
  });
  const port = await server.listen(0);
  const url = new URL(server.createOpenUrl());
  const res = await send(port, url.pathname + url.search, { headers: { host: url.host } });
  const cookie = String(res.headers["set-cookie"]).split(";")[0]!;
  const key = /name="ludiary-origin-key" content="([^"]+)"/.exec(res.text)![1]!;
  return { port, core, restarts, cookie, auth: { cookie, [HEADER]: key } };
}

const ROUTES: [string, string, unknown?][] = [
  ["GET", "/api/backups"],
  ["POST", "/api/backups", {}],
  ["POST", "/api/backups/folder/pick", {}],
  ["POST", "/api/backups/restore", { id: ID }],
];

describe("backup routes (ADR 89 point 8)", () => {
  it("refuse a request without cookie (401) and with the cookie only (401 origin_key_required)", async () => {
    const { port, cookie } = await start();
    for (const [method, path, body] of ROUTES) {
      const none = await send(port, path, { method, ...(body ? { body } : {}) });
      expect(none.status, `${method} ${path}`).toBe(401);
      const cookieOnly = await send(port, path, { method, headers: { cookie }, ...(body ? { body } : {}) });
      expect(cookieOnly.status, `${method} ${path}`).toBe(401);
      expect(cookieOnly.json()).toEqual({ error: "origin_key_required" });
    }
  });

  it("answers the list, a manual copy and a cancelled dialog", async () => {
    const { port, auth } = await start();
    expect((await send(port, "/api/backups", { headers: auth })).json()).toEqual(state);
    const made = await send(port, "/api/backups", { method: "POST", headers: auth, body: {} });
    expect(made.status).toBe(201);
    expect(made.json()).toMatchObject({ id: ID, kind: "manual" });
    const picked = await send(port, "/api/backups/folder/pick", { method: "POST", headers: auth, body: {} });
    expect(picked.json()).toEqual({ cancelled: true });
  });

  it("rejects an id that does not match the pattern and extra properties (400) without calling the core", async () => {
    const { port, auth, core, restarts } = await start();
    for (const body of [{ id: "..\\..\\x.sqlite" }, { id: "C:\\Windows\\x.sqlite" }, { id: ID + "x" }, { id: ID, path: "C:\\x" }, {}, { id: 7 }]) {
      const res = await send(port, "/api/backups/restore", { method: "POST", headers: auth, body });
      expect(res.status, JSON.stringify(body)).toBe(400);
    }
    expect(core.calls.some((c) => c[0] === "restoreBackup")).toBe(false);
    expect(restarts).toEqual([]);
  });

  it("answers 202 and asks for the restart only after the response (onResponse)", async () => {
    const prepared: string[] = [];
    const { port, auth, restarts } = await start({ restoreBackup: async (id) => void prepared.push(id) });
    const res = await send(port, "/api/backups/restore", { method: "POST", headers: auth, body: { id: ID } });
    expect(res.status).toBe(202);
    expect(res.json()).toEqual({ restarting: true });
    await new Promise((r) => setTimeout(r, 20));
    expect(restarts).toEqual(["restart"]);
    expect(prepared).toEqual([ID]);
  });

  it("without a way to restart it answers action-unavailable and prepares nothing", async () => {
    const prepared: string[] = [];
    const { port, auth } = await start({ restoreBackup: async (id) => void prepared.push(id) }, false);
    const res = await send(port, "/api/backups/restore", { method: "POST", headers: auth, body: { id: ID } });
    expect(res.status).toBe(422);
    expect(res.json()).toMatchObject({ error: "action-unavailable" });
    expect(prepared).toEqual([]);
  });

  it("does not restart when the preparation fails, and maps the errors to their HTTP status", async () => {
    const cases: [string, number][] = [["backup.busy", 409], ["backup.not-found", 404], ["backup.corrupt", 422], ["backup.not-ludiary", 422], ["backup.folder-unavailable", 503], ["backup.write-failed", 500]];
    for (const [code, status] of cases) {
      const { port, auth, restarts } = await start({
        restoreBackup: async () => {
          throw new FakeCoreError(code, `core.errors.${code}`);
        },
      });
      const res = await send(port, "/api/backups/restore", { method: "POST", headers: auth, body: { id: ID } });
      expect(res.status, code).toBe(status);
      expect(res.json()).toMatchObject({ error: code, detail: { key: `core.errors.${code}` } });
      await new Promise((r) => setTimeout(r, 10));
      expect(restarts, code).toEqual([]);
      await server?.close();
      server = null;
    }
  });
});
