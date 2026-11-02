import { randomBytes } from "node:crypto";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify";
import { LAUNCHER_ACTIONS, launcherProof, proofsEqual, serverProof, type LauncherAction } from "./proofs";
import { SESSION_ABSOLUTE_MS, type SessionStore } from "./sessions";
import { isCoreError, statusForCoreError, type LudiaryCoreFacade } from "./core";
import { OPEN_CSP, openScript, spaCsp, type WebAssets } from "./web";
import {
  CollectionCreateSchema, CollectionPatchSchema, CollectionSchema, GamePatchSchema, type CollectionCreateDto, type CollectionPatchDto, type GamePatchDto,
  EmptyObjectSchema, GameDetailSchema, GameSummarySchema, IdParamsSchema, LaunchRequestSchema,
  LaunchResponseSchema, OnboardingCompleteSchema, OnboardingSchema, PickCancelledSchema, ScanRootPatchSchema,
  ScanRootSchema, SettingsPatchSchema, SettingsSchema, StoreParamsSchema, StoreStatusSchema, SyncRequestSchema,
  WizardCallbackSchema, WizardIdParamsSchema, WizardSubmitSchema,
  type IdParams, type LaunchRequestDto, type StoreParams, type WizardCallbackDto, type WizardIdParams, type WizardSubmitDto, type OnboardingCompleteDto, type ScanRootPatchDto, type SettingsPatchDto,
  type SyncRequestDto,
} from "@ludiary/api-contract";

/** ADR 67, 72. Declared in `config.access` of each route; a route that declares nothing is 'session+key'. */
export type AccessLevel = "public" | "session" | "session+key";
declare module "fastify" {
  interface FastifyContextConfig {
    access?: AccessLevel;
  }
}

export const sessionCookieName = (appId: string) => `${appId.toLowerCase()}_session`;
/** Name the browser shows (ADR 66). Browsers resolve `*.localhost` to loopback themselves, without DNS. */
export const webHostName = (appId: string) => `${appId.toLowerCase()}.localhost`;

export type WebKey =
  | "web.open.title"
  | "web.open.noscript"
  | "web.open.invalid.title"
  | "web.open.invalid.body"
  | "web.missing.title"
  | "web.missing.body";

export const originKeyHeaderName = (appId: string) => `x-${appId.toLowerCase()}-origin-key`;

export interface LocalServerDeps {
  /** Technical identifier (ADR 44); names the cookie, the web host name and the health response. */
  appId: string;
  version: string;
  /** Installation token used as HMAC key for the launcher protocol (ADR 63). It never travels. */
  launcherKey: Uint8Array;
  /** Translates a web key. Translation lives outside this package. */
  t: (key: WebKey) => string;
  /** Extra data for the authenticated status endpoint. */
  getStatus: () => Record<string, unknown>;
  /** Called by the launcher's shutdown action after the response is sent. */
  onShutdownRequested: () => void;
  sessions: SessionStore;
  /** Facade over the core (ADR 72). */
  core: LudiaryCoreFacade;
  /** SPA files by absolute URL path ('/index.html', '/assets/x.js'), read once by the runtime. May be empty. */
  webAssets: WebAssets;
  /** Union of the connectors' mediaHosts (ADR 71): bare host names, they become img-src entries. */
  mediaHosts: readonly string[];
  /** Called with unexpected route errors; never receives request data. */
  onInternalError?: (err: unknown) => void;
}

export interface LocalServer {
  /**
   * Listens on the loopback interface only, on 127.0.0.1 and [::1] with the same port (ADR 23, 66): browsers may
   * try ::1 first for ludiary.localhost, and leaving it free would let another local user take it.
   * Rejects with the original error (EADDRINUSE, ...) if either address is taken.
   */
  listen(port: number): Promise<number>;
  /** False when the machine has no IPv6 loopback, so only 127.0.0.1 is served. */
  readonly ipv6: boolean;
  /** Mints a one-use open URL: `name` = ludiary.localhost (default), `ip` = 127.0.0.1 (plan B of ADR 66). */
  createOpenUrl(address?: "name" | "ip"): string;
  close(): Promise<void>;
}

const LOOPBACK_V4 = "127.0.0.1";
const LOOPBACK_V6 = "::1";
/** ADR 63: launcher nonces are one-use, short-lived and bounded in number. */
const NONCE_TTL_MS = 30_000;
const MAX_PENDING_NONCES = 32;

/** Every value of every cookie name: a planted duplicate must not hide the real session (ADR 66). */
function parseCookies(header: string | undefined): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const part of (header ?? "").split(";")) {
    const i = part.indexOf("=");
    if (i <= 0) continue;
    const name = part.slice(0, i).trim();
    out.set(name, [...(out.get(name) ?? []), part.slice(i + 1).trim()]);
  }
  return out;
}

const HTML_ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => HTML_ESCAPES[c] ?? c);

function listenV6(server: Server, port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen({ host: LOOPBACK_V6, port, ipv6Only: true }, () => {
      server.off("error", reject);
      resolve();
    });
  });
}

export function createLocalServer(deps: LocalServerDeps): LocalServer {
  const app: FastifyInstance = Fastify({
    logger: false,
    bodyLimit: 64 * 1024,
    // removeAdditional: false is essential: Fastify's default silently strips extra fields (a `command` in a launch
    // request would be dropped and answered 200). With false, `additionalProperties: false` gives 400 (ADR 72).
    ajv: { customOptions: { removeAdditional: false, coerceTypes: false, useDefaults: false } },
  });
  let currentPort = 0;
  let v6: Server | null = null;
  const cookieName = sessionCookieName(deps.appId);
  const webHost = webHostName(deps.appId);
  /** nonce -> expiry. Map keeps insertion order, so the first key is the oldest. */
  const nonces = new Map<string, number>();

  const allowedHosts = () => [`${webHost}:${currentPort}`, `${LOOPBACK_V4}:${currentPort}`];
  const openUrl = (address: "name" | "ip" = "name") =>
    `http://${address === "name" ? webHost : LOOPBACK_V4}:${currentPort}/open?t=${deps.sessions.createOpenLink()}`;
  const cookieValues = (req: FastifyRequest): string[] => parseCookies(req.headers.cookie).get(cookieName) ?? [];
  const originKeyHeader = originKeyHeaderName(deps.appId);
  const csp = spaCsp(deps.mediaHosts); // throws at creation on a bad host
  const core = deps.core;
  const deny = (reply: FastifyReply, code: number, error: string) => reply.code(code).send({ error });

  // ADR 23, 66: validate Host (anti DNS-rebinding) and Origin (anti cross-site calls) with the CURRENT port (ADR 28).
  app.addHook("onRequest", async (req, reply) => {
    reply.header("Cache-Control", "no-store");
    reply.header("Referrer-Policy", "no-referrer");
    reply.header("X-Content-Type-Options", "nosniff");
    const hosts = allowedHosts();
    if (!hosts.includes(req.headers.host ?? "")) return deny(reply, 421, "bad_host");
    const origin = req.headers.origin;
    // The launcher protocol is for Ludiary.exe only: a browser always sends Origin on these POSTs.
    if (origin !== undefined && req.url.startsWith("/api/launcher/")) return deny(reply, 403, "bad_origin");
    if (origin !== undefined && !hosts.some((h) => origin === `http://${h}`)) return deny(reply, 403, "bad_origin");
    return undefined;
  });

  // ADR 67, 72: access level of the matched route, after Host and Origin. Unknown routes (404) are not authenticated
  // and reveal nothing. Whatever a route does not declare is 'session+key'.
  app.addHook("onRequest", async (req, reply) => {
    if (req.is404) return undefined;
    const access: AccessLevel = req.routeOptions.config.access ?? "session+key";
    if (access === "public") return undefined;
    if (access === "session") {
      return cookieValues(req).some((v) => deps.sessions.touch(v)) ? undefined : deny(reply, 401, "session_required");
    }
    const header = req.headers[originKeyHeader]; // only the header: never the query, the body or a cookie
    const verdict = deps.sessions.authorize(cookieValues(req), typeof header === "string" ? header : undefined);
    if (verdict === "no-session") return deny(reply, 401, "session_required");
    if (verdict === "no-key") return deny(reply, 401, "origin_key_required");
    return undefined;
  });

  // ADR 72 point 5: errors are { error, detail? }. Nothing from the request or the exception leaks on 500.
  app.setErrorHandler((err, _req, reply) => {
    if (isCoreError(err)) {
      const detail = { code: err.code, key: err.key, ...(err.params ? { params: err.params } : {}) };
      return reply.code(statusForCoreError(err.code)).send({ error: err.code, detail });
    }
    const status = (err as { statusCode?: number }).statusCode;
    if (typeof status === "number" && status >= 400 && status < 500) {
      return reply.code(status).send({ error: status === 413 ? "payload_too_large" : "invalid_request" });
    }
    deps.onInternalError?.(err);
    return reply.code(500).send({ error: "internal_error" });
  });

  const publicRoute = { access: "public" } as const;
  const pageHtml = (title: string, body: string) =>
    `<!doctype html><meta charset="utf-8"><title>${escapeHtml(title)}</title>` +
    `<h1>${escapeHtml(title)}</h1><p>${escapeHtml(body)}</p>`;

  // ADR 28: identifies this application. Deliberately public and free of secrets.
  app.get("/api/health", { config: publicRoute }, async () => ({ app: deps.appId.toLowerCase(), version: deps.version, pid: process.pid }));

  // ADR 63, step 1: a fresh one-use nonce.
  app.post("/api/launcher/challenge", { config: publicRoute }, async () => {
    const now = Date.now();
    for (const [n, exp] of nonces) if (exp < now) nonces.delete(n);
    while (nonces.size >= MAX_PENDING_NONCES) nonces.delete(nonces.keys().next().value!);
    const nonce = randomBytes(32).toString("base64url");
    nonces.set(nonce, now + NONCE_TTL_MS);
    return { nonce };
  });

  // ADR 63, step 2: the launcher proves it knows the token; the answer carries the server's own proof.
  app.post<{ Params: { action: string }; Body: unknown }>("/api/launcher/:action", { config: publicRoute }, async (req, reply) => {
    const action = req.params.action as LauncherAction;
    const body = (req.body ?? {}) as { nonce?: unknown; proof?: unknown };
    const nonce = typeof body.nonce === "string" ? body.nonce : "";
    const expiresAt = nonces.get(nonce);
    nonces.delete(nonce); // always consumed, whatever happens next
    const valid =
      LAUNCHER_ACTIONS.includes(action) &&
      expiresAt !== undefined &&
      expiresAt >= Date.now() &&
      proofsEqual(body.proof, launcherProof(deps.launcherKey, action, currentPort, nonce));
    if (!valid) return deny(reply, 401, "unauthorized"); // same answer for every failure

    const result = action === "open-link" ? openUrl("name") : "ok";
    if (action === "shutdown") setImmediate(deps.onShutdownRequested);
    return { result, proof: serverProof(deps.launcherKey, action, currentPort, nonce, result) };
  });

  // Redeems the link for an HttpOnly cookie and the origin key (ADR 29, 54, 67). No Domain: the cookie stays on this host.
  // No redirect: a 200 page carries the key in a <meta>; /open.js stores it and leaves (the URL never stays in history).
  app.get("/open", { config: publicRoute }, async (req, reply) => {
    reply.header("Content-Type", "text/html; charset=utf-8").header("Content-Security-Policy", OPEN_CSP);
    const t = (req.query as Record<string, unknown>)["t"];
    const redeemed = typeof t === "string" ? deps.sessions.redeemOpenLink(t) : null;
    if (!redeemed) {
      return reply.code(403).send(pageHtml(deps.t("web.open.invalid.title"), deps.t("web.open.invalid.body")));
    }
    // Plan B (127.0.0.1) gets a browser-session cookie: a 127.0.0.1 cookie reaches every 127.0.0.1:* service (ADR 66).
    const viaIp = req.headers.host?.startsWith(`${LOOPBACK_V4}:`) === true;
    const maxAge = viaIp ? "" : `; Max-Age=${Math.floor(SESSION_ABSOLUTE_MS / 1000)}`;
    reply.header("Set-Cookie", `${cookieName}=${redeemed.session}; Path=/; HttpOnly; SameSite=Strict${maxAge}`);
    return (
      `<!doctype html><meta charset="utf-8">` +
      `<meta name="${deps.appId.toLowerCase()}-origin-key" content="${escapeHtml(redeemed.originKey)}">` +
      `<title>${escapeHtml(deps.t("web.open.title"))}</title><script src="/open.js"></script>` +
      `<noscript>${escapeHtml(deps.t("web.open.noscript"))}</noscript>`
    );
  });

  const openJs = openScript(deps.appId);
  app.get("/open.js", { config: publicRoute }, async (_req, reply) =>
    reply.header("Content-Type", "text/javascript; charset=utf-8").header("Content-Security-Policy", OPEN_CSP).send(openJs),
  );

  // The only route with level 'session' (ADR 67): no personal data.
  app.get("/api/status", { config: { access: "session" } }, async () => ({
    app: deps.appId.toLowerCase(),
    version: deps.version,
    pid: process.pid,
    port: currentPort,
    ...deps.getStatus(),
  }));

  // ---- Routes of the first Steam slice (ADR 72, point 5). All 'session+key' by default.
  const noQuery = EmptyObjectSchema;
  const gone = (reply: FastifyReply) => reply.code(404).send({ error: "not-found" });
  const list = (items: unknown) => ({ type: "array", items });

  app.get("/api/library", { schema: { querystring: noQuery, response: { 200: list(GameSummarySchema) } } }, async () =>
    core.listLibrary(),
  );

  app.get<{ Params: IdParams }>(
    "/api/games/:id",
    { schema: { params: IdParamsSchema, querystring: noQuery, response: { 200: GameDetailSchema } } },
    async (req, reply) => (await core.getGame(req.params.id)) ?? gone(reply),
  );

  // ADR 85. Session + key like every route that changes data (ADR 67).
  app.patch<{ Params: IdParams; Body: GamePatchDto }>(
    "/api/games/:id",
    { schema: { params: IdParamsSchema, querystring: noQuery, body: GamePatchSchema, response: { 200: GameDetailSchema } } },
    async (req) => core.updateGame(req.params.id, req.body),
  );

  app.get("/api/collections", { schema: { querystring: noQuery, response: { 200: list(CollectionSchema) } } }, async () =>
    core.listCollections(),
  );

  app.post<{ Body: CollectionCreateDto }>(
    "/api/collections",
    { schema: { querystring: noQuery, body: CollectionCreateSchema, response: { 201: CollectionSchema } } },
    async (req, reply) => reply.code(201).send(await core.createCollection(req.body.name)),
  );

  app.patch<{ Params: IdParams; Body: CollectionPatchDto }>(
    "/api/collections/:id",
    { schema: { params: IdParamsSchema, querystring: noQuery, body: CollectionPatchSchema, response: { 200: CollectionSchema } } },
    async (req) => core.renameCollection(req.params.id, req.body.name),
  );

  app.delete<{ Params: IdParams }>("/api/collections/:id", { schema: { params: IdParamsSchema, querystring: noQuery } }, async (req, reply) => {
    await core.deleteCollection(req.params.id);
    return reply.code(204).send();
  });

  app.post<{ Params: IdParams; Body: LaunchRequestDto }>(
    "/api/games/:id/launch",
    { schema: { params: IdParamsSchema, querystring: noQuery, body: LaunchRequestSchema, response: { 202: LaunchResponseSchema } } },
    async (req, reply) => {
      // Only the stored game id travels (invariant 3): the core resolves what to run.
      const result = await core.launch(req.params.id, req.body.propertyId, req.body.action);
      return reply.code(202).send({ status: result.status });
    },
  );

  app.post<{ Body: SyncRequestDto }>(
    "/api/sync",
    { schema: { querystring: noQuery, body: SyncRequestSchema, response: { 202: list(StoreStatusSchema) } } },
    async (req, reply) => {
      const { trigger, operations } = req.body;
      await core.requestSync({ trigger, ...(operations ? { operations } : {}) });
      return reply.code(202).send(await core.storeStatus());
    },
  );

  app.get("/api/stores", { schema: { querystring: noQuery, response: { 200: list(StoreStatusSchema) } } }, async () =>
    core.storeStatus(),
  );

  app.get("/api/onboarding", { schema: { querystring: noQuery, response: { 200: OnboardingSchema } } }, async () =>
    core.getOnboarding(),
  );

  app.post<{ Body: OnboardingCompleteDto }>(
    "/api/onboarding/complete",
    { schema: { querystring: noQuery, body: OnboardingCompleteSchema } },
    async (req, reply) => {
      await core.completeOnboarding(req.body.detection);
      return reply.code(204).send();
    },
  );

  app.post("/api/onboarding/reset", { schema: { querystring: noQuery } }, async (_req, reply) => {
    await core.resetOnboarding();
    return reply.code(204).send();
  });

  // ADR 54, 67: revokes every browser session, the caller's included. Default level (session+key).
  app.post("/api/sessions/revoke", { schema: { querystring: noQuery } }, async (_req, reply) => {
    deps.sessions.revokeAll();
    return reply.code(204).send();
  });

  app.get("/api/settings", { schema: { querystring: noQuery, response: { 200: SettingsSchema } } }, async () =>
    core.getSettings(),
  );

  app.patch<{ Body: SettingsPatchDto }>(
    "/api/settings",
    { schema: { querystring: noQuery, body: SettingsPatchSchema, response: { 200: SettingsSchema } } },
    async (req) => core.updateSettings(req.body),
  );

  app.patch<{ Params: IdParams; Body: ScanRootPatchDto }>(
    "/api/scan-roots/:id",
    { schema: { params: IdParamsSchema, querystring: noQuery, body: ScanRootPatchSchema, response: { 200: ScanRootSchema } } },
    async (req, reply) => {
      await core.setScanRootEnabled(req.params.id, req.body.enabled);
      const root = (await core.getSettings()).scanRoots.find((r) => r.id === req.params.id);
      return root ?? gone(reply);
    },
  );

  app.delete<{ Params: IdParams }>(
    "/api/scan-roots/:id",
    { schema: { params: IdParamsSchema, querystring: noQuery } },
    async (req, reply) => {
      await core.removeScanRoot(req.params.id);
      return reply.code(204).send();
    },
  );

  app.post(
    "/api/scan-roots/pick",
    { schema: { querystring: noQuery, body: EmptyObjectSchema, response: { 200: PickCancelledSchema, 201: ScanRootSchema } } },
    async (_req, reply) => {
      const root = await core.pickScanRoot();
      return root ? reply.code(201).send(root) : reply.code(200).send({ cancelled: true });
    },
  );

  // ---- Wizards and disconnect (ADR 74, point 5). All 'session+key'. The response bodies are not schema-filtered:
  // the core builds them from validated connector output (ADR 74, validation of what the connector returns).
  // returnBase comes from the Host that the onRequest hook already checked against the closed list (ADR 66): never from the request body.
  app.post<{ Params: StoreParams }>(
    "/api/stores/:store/wizard",
    { schema: { params: StoreParamsSchema, querystring: noQuery, body: EmptyObjectSchema } },
    async (req, reply) => reply.code(201).send(await core.startWizard(req.params.store, `http://${req.headers.host}`)),
  );

  app.post<{ Params: WizardIdParams; Body: WizardSubmitDto }>(
    "/api/wizards/:wizardId/submit",
    { schema: { params: WizardIdParamsSchema, querystring: noQuery, body: WizardSubmitSchema } },
    async (req) => core.submitWizard(req.params.wizardId, req.body.stepId, req.body.input),
  );

  app.post<{ Params: WizardIdParams; Body: WizardCallbackDto }>(
    "/api/wizards/:wizardId/callback",
    { schema: { params: WizardIdParamsSchema, querystring: noQuery, body: WizardCallbackSchema } },
    async (req) => core.wizardCallback(req.params.wizardId, req.body.query),
  );

  app.delete<{ Params: WizardIdParams }>(
    "/api/wizards/:wizardId",
    { schema: { params: WizardIdParamsSchema, querystring: noQuery } },
    async (req, reply) => {
      await core.cancelWizard(req.params.wizardId);
      return reply.code(204).send();
    },
  );

  app.delete<{ Params: StoreParams }>(
    "/api/stores/:store/connection",
    { schema: { params: StoreParamsSchema, querystring: noQuery } },
    async (req, reply) => {
      await core.disconnect(req.params.store);
      return reply.code(204).send();
    },
  );

  // ---- SPA (ADR 72, point 6): only what is in the in-memory map; no paths computed from the request.
  const NO_FALLBACK_PREFIXES = ["/api/", "/open", "/assets/"];

  app.setNotFoundHandler(async (req, reply) => {
    const path = req.url.split("?", 1)[0] ?? "";
    const isGet = req.method === "GET";
    if (!isGet && req.method !== "HEAD") return reply.code(404).send({ error: "not_found" });
    const excluded = NO_FALLBACK_PREFIXES.some((p) => path.startsWith(p));
    const direct = path === "/" ? undefined : deps.webAssets.get(path);
    const asset = direct ?? (!excluded && isGet ? deps.webAssets.get("/index.html") : undefined);
    if (asset) {
      reply.header("Content-Security-Policy", csp).header("Referrer-Policy", "no-referrer").header("Content-Type", asset.type);
      if (direct && (asset.immutable ?? path.startsWith("/assets/"))) {
        reply.header("Cache-Control", "public, max-age=31536000, immutable");
      }
      return reply.send(typeof asset.body === "string" ? asset.body : Buffer.from(asset.body));
    }
    if (!excluded && isGet && deps.webAssets.size === 0) {
      // Web files missing: the server still runs; the page tells the user to reinstall.
      return reply
        .code(503)
        .header("Content-Type", "text/html; charset=utf-8")
        .header("Content-Security-Policy", OPEN_CSP)
        .send(pageHtml(deps.t("web.missing.title"), deps.t("web.missing.body")));
    }
    return reply.code(404).send({ error: "not_found" });
  });

  return {
    async listen(port) {
      await app.listen({ host: LOOPBACK_V4, port });
      currentPort = (app.server.address() as AddressInfo).port;
      // Same Fastify app, second socket: every request goes through the same hooks. Same timeouts as Fastify's server,
      // so both addresses behave alike, and a socket error after listening is ignored instead of crashing the process.
      const second = createServer((req, res) => app.routing(req, res));
      second.keepAliveTimeout = app.server.keepAliveTimeout;
      second.requestTimeout = app.server.requestTimeout;
      second.headersTimeout = app.server.headersTimeout;
      second.on("clientError", (_err, socket) => socket.destroy());
      try {
        await listenV6(second, currentPort);
        v6 = second;
      } catch (e) {
        const code = (e as NodeJS.ErrnoException).code;
        // No IPv6 loopback on this machine: nobody can take ::1 either, so IPv4 alone is safe.
        if (code === "EADDRNOTAVAIL" || code === "EAFNOSUPPORT") return currentPort;
        await app.close();
        throw e;
      }
      return currentPort;
    },
    get ipv6() {
      return v6 !== null;
    },
    createOpenUrl: openUrl,
    async close() {
      if (v6) {
        const server = v6;
        v6 = null;
        server.closeAllConnections();
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
      await app.close();
    },
  };
}
