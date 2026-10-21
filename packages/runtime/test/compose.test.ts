import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createLocalServer, SessionStore, type LocalServer } from "@ludiary/api";
import { createSteamConnector } from "@ludiary/connector-steam";
import type { FolderPicker, PlatformInfo, ProcessLauncher, StoreConnector } from "@ludiary/contracts";
import { createSqliteInstanceLock, DatabaseTooNewError, MIGRATIONS, migrate, openDatabase } from "@ludiary/db";
import { translate } from "@ludiary/i18n";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { composeCore, FatalError, migrateDatabase } from "../src/compose";
import { createConnectors, unionMediaHosts, unionUriSchemes } from "../src/connectors";
import { EXIT, type RuntimeDeps } from "../src/deps";
import { loadWebAssets } from "../src/web-assets";

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), "../../../connectors/steam/fixtures/tree");
const noLog = () => {};
const HEADER = "x-ludiary-origin-key";

let dir = "";
let server: LocalServer | null = null;
const opened: { close(): unknown }[] = [];
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "ludiary-compose-"));
});
afterEach(async () => {
  await server?.close();
  server = null;
  for (const db of opened.splice(0)) {
    try {
      db.close();
    } catch {
      /* already closed by the test */
    }
  }
  rmSync(dir, { recursive: true, force: true });
});

const platform = (): PlatformInfo => ({
  os: "windows",
  arch: "x64",
  dataDir: dir,
  installDir: dir,
  systemLocale: "es-ES",
  openUrl: async () => {},
});

function fakeDeps(over: Partial<RuntimeDeps> = {}): RuntimeDeps {
  return {
    version: "test",
    platform: platform(),
    env: {},
    createKeyStore: () => {
      throw new Error("not used");
    },
    selfCommand: { command: "x", args: [] },
    ...over,
  };
}

async function openMigrated() {
  const sqlite = openDatabase(join(dir, "ludiary.db"), undefined);
  opened.push(sqlite);
  await migrateDatabase(sqlite, join(dir, "backups"), noLog);
  return sqlite;
}

describe("composition with doubles: runtime -> api -> core -> db -> Steam connector (ADR 72)", () => {
  async function start(picks: (string | null)[]) {
    const launched: string[] = [];
    const launcher = (schemes: readonly string[]): ProcessLauncher => ({
      kinds: ["uri"],
      openUri: async (uri) => {
        if (!schemes.includes(uri.split(":")[0]!)) throw new Error("scheme not allowed");
        launched.push(uri);
      },
      exec: async () => {
        throw new Error("no exec");
      },
    });
    const queue = [...picks];
    const folderPicker: FolderPicker = { pick: async () => queue.shift() ?? null };
    const web = join(dir, "web");
    mkdirSync(join(web, "assets"), { recursive: true });
    writeFileSync(join(web, "index.html"), "<!doctype html><title>spa</title>");
    writeFileSync(join(web, "assets", "app-abc.js"), "console.log(1)");
    const deps = fakeDeps({ createProcessLauncher: launcher, folderPicker, webDir: web });
    const sqlite = await openMigrated();
    const { core, facade, connectors } = await composeCore(deps, sqlite, noLog);
    const sessions = new SessionStore();
    server = createLocalServer({
      appId: "Ludiary",
      version: "test",
      launcherKey: Buffer.alloc(32, 3),
      sessions,
      t: (k) => translate("en", k),
      getStatus: () => ({}),
      onShutdownRequested: () => {},
      core: facade,
      webAssets: loadWebAssets(web, noLog),
      mediaHosts: unionMediaHosts(connectors),
    });
    const port = await server.listen(0);
    return { port, core, launched };
  }

  async function login(port: number) {
    const open = new URL(server!.createOpenUrl("ip"));
    const res = await fetch(open);
    const cookie = res.headers.get("set-cookie")!.split(";")[0]!;
    const key = /name="ludiary-origin-key" content="([^"]+)"/.exec(await res.text())![1]!;
    const headers = { cookie, [HEADER]: key, "content-type": "application/json" };
    const call = (path: string, method = "GET", body?: unknown) =>
      fetch(`http://127.0.0.1:${port}${path}`, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { call, headers };
  }

  it("scans a Steam library chosen with the folder picker and launches by id only", async () => {
    const { port, core, launched } = await start([join(FIXTURES, "D", "SteamLibrary"), join(FIXTURES, "E", "Juegos Ñandú", "SteamLibrary")]);
    const { call } = await login(port);

    expect(await (await call("/api/library")).json()).toEqual([]);
    expect((await call("/api/onboarding/complete", "POST", { detection: "manual-only" })).status).toBe(204);
    await core.whenIdle();

    for (let i = 0; i < 2; i++) {
      expect((await call("/api/scan-roots/pick", "POST", {})).status).toBe(201);
      await core.whenIdle();
    }

    const library = (await (await call("/api/library")).json()) as { id: string; title: string; installed: boolean; coverUrl?: string; stores: string[] }[];
    expect(library.map((g) => g.title).sort()).toEqual(["Portal 2", "ŌKAMI HD / 大神 絶景版"]); // non-ASCII title and path
    for (const g of library) {
      expect(g.installed).toBe(true);
      expect(g.stores).toEqual(["steam"]);
      expect(g.coverUrl).toMatch(/^https:\/\/shared\.akamai\.steamstatic\.com\//);
    }
    const portal2 = library.find((g) => g.title === "Portal 2")!;
    const detail = (await (await call(`/api/games/${portal2.id}`)).json()) as { properties: { actions: string[]; installPath?: string }[] };
    expect(detail.properties[0]!.actions).toEqual(["play"]);

    // Extra fields in the launch request are refused: a launch is by id only (invariant 3).
    expect((await call(`/api/games/${portal2.id}/launch`, "POST", { uri: "steam://rungameid/1" })).status).toBe(400);
    expect((await call(`/api/games/${portal2.id}/launch`, "POST", { command: "calc.exe" })).status).toBe(400);
    expect(launched).toEqual([]);

    const ok = await call(`/api/games/${portal2.id}/launch`, "POST", {});
    expect(ok.status).toBe(202);
    expect(await ok.json()).toEqual({ status: "started" });
    expect(launched).toEqual(["steam://rungameid/620"]);

    const unknown = await call("/api/games/does-not-exist/launch", "POST", {});
    expect(unknown.status).toBe(404);
    expect(await unknown.json()).toEqual({ error: "not-found", detail: { code: "not-found", key: "core.errors.not-found" } });
  });

  it("reports the scan state per store, with the Steam manifest facts", async () => {
    const { port } = await start([]);
    const { call } = await login(port);
    const stores = (await (await call("/api/stores")).json()) as { store: string; access: string; mode: string; connection: string }[];
    expect(stores).toHaveLength(1);
    expect(stores[0]).toMatchObject({ store: "steam", access: "official-api", mode: "installed-only" });
    const cancelled = await call("/api/scan-roots/pick", "POST", {});
    expect(cancelled.status).toBe(200);
    expect(await cancelled.json()).toEqual({ cancelled: true });
  });

  it("serves index.html and /assets/* from memory, and the 'reinstall' page when web/ is missing", async () => {
    const { port } = await start([]);
    const { headers } = await login(port);
    const root = await fetch(`http://127.0.0.1:${port}/`, { headers });
    expect(root.status).toBe(200);
    expect(await root.text()).toContain("<title>spa</title>");
    const csp = root.headers.get("content-security-policy")!;
    expect(csp).toContain("img-src 'self' data: https://shared.akamai.steamstatic.com");
    const js = await fetch(`http://127.0.0.1:${port}/assets/app-abc.js`);
    expect(js.headers.get("cache-control")).toContain("immutable");
    expect(js.headers.get("content-type")).toContain("text/javascript");
  });

  it("starts without web/: the API works and / explains the reinstall", async () => {
    const sqlite = await openMigrated();
    const { facade, connectors } = await composeCore(fakeDeps(), sqlite, noLog);
    server = createLocalServer({
      appId: "Ludiary", version: "test", launcherKey: Buffer.alloc(32, 3), sessions: new SessionStore(), t: (k) => translate("en", k),
      getStatus: () => ({}), onShutdownRequested: () => {}, core: facade,
      webAssets: loadWebAssets(join(dir, "does-not-exist"), noLog), mediaHosts: unionMediaHosts(connectors),
    });
    const port = await server.listen(0);
    const res = await fetch(`http://127.0.0.1:${port}/`);
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(await res.text()).toContain(translate("en", "web.missing.title"));
  });
});

describe("connector registration (ADR 40 rule 11, ADR 72)", () => {
  const launcherOf = (kinds: ("uri" | "exec")[]) => (): ProcessLauncher => ({ kinds, openUri: async () => {}, exec: async () => {} });

  it("refuses a connector with another contractVersion, with a clear fatal error", async () => {
    const bad = { ...createSteamConnector(), contractVersion: 2 } as unknown as StoreConnector;
    const sqlite = await openMigrated();
    const error = await composeCore(fakeDeps({ connectors: [bad] }), sqlite, noLog).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(FatalError);
    expect((error as FatalError).exitCode).toBe(EXIT.error);
    expect((error as FatalError).message).toMatch(/connector 'steam' refused.*contractVersion/);
    sqlite.close();
  });

  it("refuses a connector whose launch kinds the platform cannot run", async () => {
    const base = createSteamConnector();
    const needsExec: StoreConnector = { ...base, capabilities: { ...base.capabilities, launchKinds: ["uri", "exec"] } };
    const sqlite = await openMigrated();
    const error = await composeCore(
      fakeDeps({ connectors: [needsExec], createProcessLauncher: launcherOf(["uri"]) }),
      sqlite,
      noLog,
    ).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(FatalError);
    expect((error as FatalError).message).toContain("launch kind 'exec'");
    sqlite.close();
  });

  it("unions the media hosts and URI schemes of the registered connectors", () => {
    const connectors = createConnectors();
    expect(unionUriSchemes(connectors)).toEqual(["steam"]);
    expect(unionMediaHosts(connectors)).toEqual([
      "shared.akamai.steamstatic.com",
      "shared.cloudflare.steamstatic.com",
      "shared.steamstatic.com",
    ]);
  });
});

describe("database at startup (ADR 64, 72)", () => {
  it("maps a database from a newer version to exit code 14, without touching it", async () => {
    const sqlite = openDatabase(join(dir, "ludiary.db"), undefined);
    opened.push(sqlite);
    await migrate(sqlite, { backupDir: join(dir, "backups") });
    sqlite.prepare("INSERT INTO schema_migrations (id, hash, applied_at) VALUES ('9999_from_the_future', 'x', 1)").run();
    const error = await migrateDatabase(sqlite, join(dir, "backups"), noLog).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(FatalError);
    expect((error as FatalError).exitCode).toBe(EXIT.databaseTooNew);
    expect((error as FatalError).message).toContain("newer version");
    // db's own error type, as the contract says
    await expect(migrate(sqlite, { backupDir: join(dir, "backups") })).rejects.toBeInstanceOf(DatabaseTooNewError);
    sqlite.close();
  });

  it("maps any other migration failure to exit code 12 too", async () => {
    const sqlite = openDatabase(join(dir, "ludiary.db"), undefined);
    opened.push(sqlite);
    sqlite.exec("CREATE TABLE schema_migrations (id TEXT PRIMARY KEY NOT NULL, hash TEXT NOT NULL, applied_at INTEGER NOT NULL)");
    sqlite.prepare("INSERT INTO schema_migrations (id, hash, applied_at) VALUES (?, 'wrong-hash', 1)").run(MIGRATIONS[0]!.id);
    const error = await migrateDatabase(sqlite, join(dir, "backups"), noLog).catch((e: unknown) => e);
    expect((error as FatalError).exitCode).toBe(EXIT.database);
    sqlite.close();
  });

  it("uses the instance lock of the db package: a second holder is refused", async () => {
    const file = join(dir, "instance.lock");
    const release = await createSqliteInstanceLock(file, undefined).acquire();
    expect(release).not.toBeNull();
    expect(await createSqliteInstanceLock(file, undefined).isHeld()).toBe(true);
    release?.();
    expect(await createSqliteInstanceLock(file, undefined).isHeld()).toBe(false);
  });
});

describe("loadWebAssets (ADR 72 point 6)", () => {
  const write = (rel: string, body: string | Buffer) => {
    const file = join(dir, "web", rel);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, body);
  };

  it("maps URL paths to body, type and cache policy; /assets/* is immutable", () => {
    write("index.html", "<html>");
    write("assets/index-1.js", "x");
    write("assets/style.css", "y");
    write("assets/fonts/inter.woff2", Buffer.from([1, 2, 3]));
    write("logo.svg", "<svg/>");
    write("theme-init.js", "z");
    const assets = loadWebAssets(join(dir, "web"), noLog);
    expect([...assets.keys()].sort()).toEqual([
      "/assets/fonts/inter.woff2",
      "/assets/index-1.js",
      "/assets/style.css",
      "/index.html",
      "/logo.svg",
      "/theme-init.js",
    ]);
    expect(assets.get("/index.html")).toMatchObject({ type: "text/html; charset=utf-8", immutable: false });
    expect(assets.get("/assets/index-1.js")).toMatchObject({ type: "text/javascript; charset=utf-8", immutable: true });
    expect(assets.get("/assets/fonts/inter.woff2")).toMatchObject({ type: "font/woff2", immutable: true });
    expect(assets.get("/logo.svg")?.type).toBe("image/svg+xml");
  });

  it("does not serve unknown extensions or links", () => {
    write("index.html", "<html>");
    write("assets/secret.env", "KEY=1");
    write("assets/app.js.map", "{}");
    mkdirSync(join(dir, "outside"));
    writeFileSync(join(dir, "outside", "leak.js"), "leak");
    try {
      symlinkSync(join(dir, "outside", "leak.js"), join(dir, "web", "assets", "link.js"));
    } catch {
      /* creating links may need privileges on Windows: the rest of the test still holds */
    }
    const assets = loadWebAssets(join(dir, "web"), noLog);
    expect([...assets.keys()]).toEqual(["/index.html"]);
  });

  it("gives an empty map, and logs, when the folder is missing, has no index.html or is not configured", () => {
    const logs: string[] = [];
    const log = (_level: string, msg: string) => void logs.push(msg);
    expect(loadWebAssets(join(dir, "nope"), log).size).toBe(0);
    expect(loadWebAssets(undefined, log).size).toBe(0);
    write("assets/a.js", "x");
    expect(loadWebAssets(join(dir, "web"), log).size).toBe(0);
    expect(logs.filter((m) => /web/i.test(m)).length).toBeGreaterThanOrEqual(3);
  });
});

describe("folders leaving force (ADR 72)", () => {
  it("retires the games of a folder that is disabled, and brings them back when it is enabled again", async () => {
    const fixture = join(FIXTURES, "D", "SteamLibrary");
    const sqlite = await openMigrated();
    const folderPicker: FolderPicker = { pick: async () => fixture };
    const { core } = await composeCore(fakeDeps({ folderPicker }), sqlite, noLog);
    await core.completeOnboarding("manual-only");
    await core.whenIdle();
    const root = await core.pickScanRoot();
    await core.whenIdle();
    expect((await core.listLibrary()).map((g) => g.title)).toEqual(["Portal 2"]);
    await core.setScanRootEnabled(root!.id, false);
    await core.whenIdle();
    expect(await core.listLibrary()).toEqual([]);
    await core.setScanRootEnabled(root!.id, true);
    await core.whenIdle();
    expect((await core.listLibrary()).map((g) => g.title)).toEqual(["Portal 2"]);
  });
});
