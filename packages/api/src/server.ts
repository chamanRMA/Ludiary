import { randomBytes } from "node:crypto";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify";
import { LAUNCHER_ACTIONS, launcherProof, proofsEqual, serverProof, type LauncherAction } from "./proofs";
import { SESSION_ABSOLUTE_MS, type SessionStore } from "./sessions";

export const sessionCookieName = (appId: string) => `${appId.toLowerCase()}_session`;
/** Name the browser shows (ADR 66). Browsers resolve `*.localhost` to loopback themselves, without DNS. */
export const webHostName = (appId: string) => `${appId.toLowerCase()}.localhost`;

export type WebKey = "web.home.title" | "web.home.body" | "web.denied.title" | "web.denied.body";

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
  const app: FastifyInstance = Fastify({ logger: false });
  let currentPort = 0;
  let v6: Server | null = null;
  const cookieName = sessionCookieName(deps.appId);
  const webHost = webHostName(deps.appId);
  /** nonce -> expiry. Map keeps insertion order, so the first key is the oldest. */
  const nonces = new Map<string, number>();

  const allowedHosts = () => [`${webHost}:${currentPort}`, `${LOOPBACK_V4}:${currentPort}`];
  const openUrl = (address: "name" | "ip" = "name") =>
    `http://${address === "name" ? webHost : LOOPBACK_V4}:${currentPort}/open?t=${deps.sessions.createOpenLink()}`;
  const hasSession = (req: FastifyRequest): boolean =>
    (parseCookies(req.headers.cookie).get(cookieName) ?? []).some((value) => deps.sessions.touch(value));
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

    const result = action === "open-link" ? openUrl("name") : "ok";
    if (action === "shutdown") setImmediate(deps.onShutdownRequested);
    return { result, proof: serverProof(deps.launcherKey, action, currentPort, nonce, result) };
  });

  // Redeems the link for an HttpOnly cookie and invalidates it (ADR 29, 54). No Domain: the cookie stays on this host.
  app.get("/open", async (req, reply) => {
    const t = (req.query as Record<string, unknown>)["t"];
    const session = typeof t === "string" ? deps.sessions.redeemOpenLink(t) : null;
    if (!session) return deny(reply, 403, "invalid_or_expired_link");
    // Plan B (127.0.0.1) gets a browser-session cookie: a 127.0.0.1 cookie reaches every 127.0.0.1:* service (ADR 66).
    const viaIp = req.headers.host?.startsWith(`${LOOPBACK_V4}:`) === true;
    const maxAge = viaIp ? "" : `; Max-Age=${Math.floor(SESSION_ABSOLUTE_MS / 1000)}`;
    reply.header("Set-Cookie", `${cookieName}=${session}; Path=/; HttpOnly; SameSite=Strict${maxAge}`);
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
