import { randomBytes } from "node:crypto";
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify";
import { LAUNCHER_ACTIONS, launcherProof, proofsEqual, serverProof, type LauncherAction } from "./proofs";
import { SESSION_ABSOLUTE_MS, type SessionStore } from "./sessions";

export const sessionCookieName = (appId: string) => `${appId.toLowerCase()}_session`;

export type WebKey = "web.home.title" | "web.home.body" | "web.denied.title" | "web.denied.body";

export interface LocalServerDeps {
  /** Technical identifier (ADR 44); names the cookie and the health response. */
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
}

export interface LocalServer {
  /** Listens on 127.0.0.1 only. Rejects with the original error (EADDRINUSE, ...). */
  listen(port: number): Promise<number>;
  /** Mints a one-use open URL (used by the tray; the launcher goes through the HMAC protocol). */
  createOpenUrl(): string;
  close(): Promise<void>;
}

const BIND_HOST = "127.0.0.1";
/** ADR 63: launcher nonces are one-use, short-lived and bounded in number. */
const NONCE_TTL_MS = 30_000;
const MAX_PENDING_NONCES = 32;

function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (header ?? "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0) out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  return out;
}

const HTML_ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => HTML_ESCAPES[c] ?? c);

export function createLocalServer(deps: LocalServerDeps): LocalServer {
  const app: FastifyInstance = Fastify({ logger: false });
  let currentPort = 0;
  const cookieName = sessionCookieName(deps.appId);
  /** nonce -> expiry. Map keeps insertion order, so the first key is the oldest. */
  const nonces = new Map<string, number>();

  const openUrl = () => `http://${BIND_HOST}:${currentPort}/open?t=${deps.sessions.createOpenLink()}`;
  const hasSession = (req: FastifyRequest): boolean => {
    const cookie = parseCookies(req.headers.cookie)[cookieName];
    return cookie !== undefined && deps.sessions.touch(cookie);
  };
  const deny = (reply: FastifyReply, code: number, error: string) => reply.code(code).send({ error });

  // ADR 23: validate Host (anti DNS-rebinding) and Origin (anti cross-site calls) with the CURRENT port (ADR 28).
  app.addHook("onRequest", async (req, reply) => {
    reply.header("Cache-Control", "no-store");
    reply.header("Referrer-Policy", "no-referrer");
    reply.header("X-Content-Type-Options", "nosniff");
    if (req.headers.host !== `${BIND_HOST}:${currentPort}`) return deny(reply, 421, "bad_host");
    const origin = req.headers.origin;
    // The launcher protocol is for Ludiary.exe only: a browser always sends Origin on these POSTs.
    if (origin !== undefined && req.url.startsWith("/api/launcher/")) return deny(reply, 403, "bad_origin");
    if (origin !== undefined && origin !== `http://${BIND_HOST}:${currentPort}`) return deny(reply, 403, "bad_origin");
    return undefined;
  });

  // ADR 28: identifies this application. Deliberately public and free of secrets.
  app.get("/api/health", async () => ({ app: deps.appId.toLowerCase(), version: deps.version, pid: process.pid }));

  // ADR 63, step 1: a fresh one-use nonce.
  app.post("/api/launcher/challenge", async () => {
    const now = Date.now();
    for (const [n, exp] of nonces) if (exp < now) nonces.delete(n);
    while (nonces.size >= MAX_PENDING_NONCES) nonces.delete(nonces.keys().next().value!);
    const nonce = randomBytes(32).toString("base64url");
    nonces.set(nonce, now + NONCE_TTL_MS);
    return { nonce };
  });

  // ADR 63, step 2: the launcher proves it knows the token; the answer carries the server's own proof.
  app.post<{ Params: { action: string }; Body: unknown }>("/api/launcher/:action", async (req, reply) => {
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

    const result = action === "open-link" ? openUrl() : "ok";
    if (action === "shutdown") setImmediate(deps.onShutdownRequested);
    return { result, proof: serverProof(deps.launcherKey, action, currentPort, nonce, result) };
  });

  // Redeems the link for an HttpOnly cookie and invalidates it (ADR 29, 54).
  app.get("/open", async (req, reply) => {
    const t = (req.query as Record<string, unknown>)["t"];
    const session = typeof t === "string" ? deps.sessions.redeemOpenLink(t) : null;
    if (!session) return deny(reply, 403, "invalid_or_expired_link");
    const maxAge = Math.floor(SESSION_ABSOLUTE_MS / 1000);
    reply.header("Set-Cookie", `${cookieName}=${session}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}`);
    return reply.redirect("/", 302);
  });

  app.get("/api/status", async (req, reply) => {
    if (!hasSession(req)) return deny(reply, 401, "session_required");
    return { app: deps.appId.toLowerCase(), version: deps.version, pid: process.pid, port: currentPort, ...deps.getStatus() };
  });

  app.get("/", async (req, reply) => {
    const ok = hasSession(req);
    const title = deps.t(ok ? "web.home.title" : "web.denied.title");
    const body = deps.t(ok ? "web.home.body" : "web.denied.body");
    reply
      .code(ok ? 200 : 401)
      .header("Content-Type", "text/html; charset=utf-8")
      .header("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'");
    return (
      `<!doctype html><meta charset="utf-8"><title>${escapeHtml(title)}</title>` +
      `<body style="font-family:system-ui;margin:3rem"><h1>${escapeHtml(title)}</h1><p>${escapeHtml(body)}</p></body>`
    );
  });

  return {
    async listen(port) {
      await app.listen({ host: BIND_HOST, port });
      const address = app.server.address();
      if (address === null || typeof address === "string") throw new Error("unexpected listen address");
      currentPort = address.port;
      return currentPort;
    },
    createOpenUrl: openUrl,
    close: () => app.close(),
  };
}
