import { fakeHttp, sentHeaders, type MemoryVault } from "@ludiary/connector-testkit";
import { ConnectorError } from "@ludiary/contracts";
import { describe, expect, it } from "vitest";
import { createUbisoftConnector } from "../src";
import { APP_ID } from "../src/auth";
import { CDN_ASSETS, GRAPHQL_QUERY } from "../src/library";
import { file, libraryContext, record, REMEMBER, REMEMBER_2, SESSION_ID, space, TICKET, yamlFor } from "./helpers";

const c = createUbisoftConnector();
type Answer = { status: number; body?: unknown; headers?: Record<string, string> };
const PC = [{ type: "PC" }];
const node = (n: number, extra: Record<string, unknown> = {}) => ({ spaceId: space(n), name: `Fake ${n}`, viewer: { meta: { ownedPlatformGroups: [PC] } }, ...extra });
const games = (nodes: unknown[], totalCount = nodes.length): Answer => ({ status: 200, body: { data: { viewer: { ownedGames: { totalCount, nodes } } } } });
const session = (extra: Record<string, unknown> = {}): Answer => ({ status: 200, body: { ticket: TICKET, sessionId: SESSION_ID, ...extra } });
const cache = file(
  record(900001, yamlFor({ space: space(1), thumb: "a1.jpg" })),
  record(900002, yamlFor({ space: space(2), thumb: "bad/../x.jpg" })),
  record(900003, yamlFor({ space: space(3) })),
);

function ubi(o: { sessions?: Answer; graphql?: Answer } = {}) {
  return fakeHttp((r) => (r.url.includes("/v3/profiles/sessions") ? (o.sessions ?? session()) : (o.graphql ?? games([node(1), node(2)]))), { hosts: c.apiHosts });
}
const run = (o: { http?: ReturnType<typeof ubi>; bytes?: Uint8Array | null; noFs?: boolean } = {}) => {
  const http = o.http ?? ubi();
  const ctx = libraryContext({ http, bytes: o.bytes === undefined ? cache : o.bytes, ...(o.noFs ? { noFs: true } : {}) });
  return { http, ctx, result: c.listLibrary!(ctx) };
};
const failure = async (p: Promise<unknown>): Promise<ConnectorError> => {
  const e = await p.then(() => null, (x: unknown) => x);
  expect(e).toBeInstanceOf(ConnectorError);
  return e as ConnectorError;
};

describe("listLibrary (ADR 80, point 9)", () => {
  it("maps owned PC games through the cache, with covers only when the thumb is valid", async () => {
    expect(await run().result).toEqual({
      complete: true,
      entries: [
        { storeGameId: "900001", kind: "game", title: "Fake 1", media: { coverUrl: `${CDN_ASSETS}a1.jpg` } },
        { storeGameId: "900002", kind: "game", title: "Fake 2" },
      ],
    });
    expect(CDN_ASSETS).toBe("https://static3.cdn.ubi.com/orbit/uplay_launcher_3_0/assets/");
  });

  it("sends the exact GraphQL request with Secret headers", async () => {
    const { http, result } = run();
    await result;
    const [s, g] = http.requests;
    expect([g!.method, g!.url, g!.body]).toEqual(["POST", "https://public-ubiservices.ubi.com/v1/profiles/me/uplay/graphql", { json: { operationName: "AllGames", query: GRAPHQL_QUERY } }]);
    expect(sentHeaders(g!)).toEqual({ authorization: `Ubi_v1 t=${TICKET}`, "ubi-appid": APP_ID, "ubi-sessionid": SESSION_ID });
    expect(JSON.stringify(g)).not.toMatch(/Ubi_v1|00000000-0000-4000-8000-000000000001|ubisoft-test-ticket/);
    expect(JSON.stringify(s)).not.toContain(REMEMBER);
  });

  it("saves a rotated ticket BEFORE asking GraphQL; without rotation nothing is saved", async () => {
    const order: string[] = [];
    const http = fakeHttp((r) => {
      order.push(r.url.includes("sessions") ? "sessions" : "graphql");
      return r.url.includes("sessions") ? session({ rememberMeTicket: REMEMBER_2 }) : games([]);
    }, { hosts: c.apiHosts });
    const ctx = libraryContext({ http, bytes: cache });
    const vault = ctx.secrets as MemoryVault;
    const set = vault.set.bind(vault);
    vault.set = async (n, v) => {
      order.push("set");
      return set(n, v);
    };
    await c.listLibrary!(ctx);
    expect(order).toEqual(["sessions", "set", "graphql"]);
    expect(vault.values.get("rememberMeTicket")).toBe(REMEMBER_2);

    const plain = run();
    await plain.result;
    expect((plain.ctx.secrets as MemoryVault).sets).toEqual([]);
  });

  it("no fs: needsAutoDetection and no request; no file: noCache and no request; other declaration ignored", async () => {
    for (const [o, key] of [[{ noFs: true }, "connectors.ubisoft.needsAutoDetection"], [{ bytes: null }, "connectors.ubisoft.errors.noCache"]] as const) {
      const { http, result } = run(o);
      expect((await failure(result)).details.messageKey).toBe(key);
      expect(http.requests).toHaveLength(0);
    }
    const ctx = { ...libraryContext({ http: ubi(), bytes: cache }), libraryLocations: [{ declarationId: "other", path: "C:\\Cache\\configuration" }] };
    expect((await failure(c.listLibrary!(ctx))).code).toBe("scan.root-unreadable");
  });

  it("a cache over 8 MiB fails with the reader's error and no request", async () => {
    const { http, result } = run({ bytes: new Uint8Array(8 * 1024 * 1024 + 1) });
    expect((await failure(result)).code).toBe("scan.root-unreadable");
    expect(http.requests).toHaveLength(0);
  });

  it("no rememberMeTicket: auth.required", async () => {
    const ctx = libraryContext({ http: ubi(), bytes: cache });
    await ctx.secrets.delete("rememberMeTicket");
    expect((await failure(c.listLibrary!(ctx))).code).toBe("auth.required");
  });

  it.each([400, 401, 403])("sessions %i is auth.expired and the secret row stays", async (status) => {
    const { ctx, result } = run({ http: ubi({ sessions: { status } }) });
    const e = await failure(result);
    expect([e.code, e.details.messageKey]).toEqual(["auth.expired", "connectors.ubisoft.error.expired"]);
    expect((ctx.secrets as MemoryVault).values.size).toBe(1);
  });

  it("second factor on renewal is auth.expired; 429, network error and bad forms behave", async () => {
    expect((await failure(run({ http: ubi({ sessions: { status: 200, body: { twoFactorAuthenticationTicket: "t".repeat(70) } } }) }).result)).code).toBe("auth.expired");
    const e = await failure(run({ http: ubi({ sessions: { status: 429, headers: { "retry-after": "60" } } }) }).result);
    expect([e.code, e.details.retryAfterMs]).toEqual(["store.rate-limited", 60_000]);
    const down = fakeHttp(() => {
      throw new ConnectorError("network.timeout", "slow");
    });
    expect((await failure(run({ http: down }).result)).code).toBe("network.timeout");
    for (const s of [session({ ticket: "short" }), session({ sessionId: "x" }), session({ rememberMeTicket: "bad" })]) {
      const r = run({ http: ubi({ sessions: s }) });
      expect((await failure(r.result)).code).toBe("store.unexpected-response");
      expect(r.http.requests).toHaveLength(1);
    }
  });

  it.each([[401, "auth.expired"], [403, "auth.expired"], [429, "store.rate-limited"], [500, "store.unexpected-response"]])("GraphQL %i is %s", async (status, code) => {
    expect((await failure(run({ http: ubi({ graphql: { status } }) }).result)).code).toBe(code);
  });

  it("errors, missing nodes and more than 50 000 nodes are unexpected-response", async () => {
    const bad: Answer[] = [
      { status: 200, body: { errors: [{ message: "x" }], data: { viewer: { ownedGames: { totalCount: 0, nodes: [] } } } } },
      { status: 200, body: { data: { viewer: { ownedGames: { totalCount: 1 } } } } },
      { status: 200, body: { data: null } },
      { status: 200, body: [] },
      games(Array.from({ length: 50_001 }, () => ({})), 50_001),
    ];
    for (const graphql of bad) expect((await failure(run({ http: ubi({ graphql }) }).result)).code).toBe("store.unexpected-response");
  });

  it("totalCount above the nodes makes it partial; a node without PC is dropped and does not touch complete", async () => {
    expect((await run({ http: ubi({ graphql: games([node(1)], 5) }) }).result).complete).toBe(false);
    const nonPc = node(1, { viewer: { meta: { ownedPlatformGroups: [[{ type: "XBOXONE" }]] } } });
    const r = run({ http: ubi({ graphql: games([nonPc, node(3)]) }) });
    const snap = await r.result;
    expect(snap.entries.map((e) => e.storeGameId)).toEqual(["900003"]);
    expect(snap.complete).toBe(true);
    expect(r.ctx.logs.some((l) => l.fields?.["notPc"] === 1)).toBe(true);
  });

  it("untranslated makes it partial (point 18, B7), with the counter in the log and no title, id or path", async () => {
    const r = run({ http: ubi({ graphql: games([node(1), node(9, { name: "Secret Title" })]) }) });
    const snap = await r.result;
    expect(snap.entries.map((e) => e.storeGameId)).toEqual(["900001"]);
    expect(snap.complete).toBe(false);
    expect(r.ctx.logs.some((l) => l.fields?.["untranslated"] === 1)).toBe(true);
    expect(JSON.stringify(r.ctx.logs)).not.toMatch(/Secret Title|900001|00000000-0000|ubisoft-test|C:\\/);
  });

  it("an uppercase spaceId from the API is found; bad spaceIds and non-objects make it partial", async () => {
    const up = await run({ http: ubi({ graphql: games([node(1, { spaceId: space(1).toUpperCase() })]) }) }).result;
    expect(up.entries).toHaveLength(1);
    for (const bad of [node(1, { spaceId: "x" }), node(1, { spaceId: 5 }), null, "str"]) {
      expect((await run({ http: ubi({ graphql: games([node(2), bad]) }) }).result).complete).toBe(false);
    }
  });

  it("repeated games appear once; titles are cleaned, cut and defaulted", async () => {
    const snap = await run({ http: ubi({ graphql: games([node(1, { name: "A\u0000\nB" + "x".repeat(400) }), node(1), node(3, { name: 7 })]) }) }).result;
    expect(snap.entries.map((e) => e.storeGameId)).toEqual(["900001", "900003"]);
    expect(snap.entries[0]!.title).toMatch(/^A {2}Bx+$/);
    expect(snap.entries[0]!.title).toHaveLength(300);
    expect(snap.entries[1]!.title).toBe("Ubisoft 900003");
  });

  it("a cache that failed midway uses what was read and is incomplete", async () => {
    const snap = await run({ bytes: file(record(900001, yamlFor({ space: space(1) })), [0x0b]) }).result;
    expect(snap.entries.map((e) => e.storeGameId)).toEqual(["900001"]);
    expect(snap.complete).toBe(false);
  });
});
