import { createHash, randomBytes } from "node:crypto";

const sha256 = (value: string): string => createHash("sha256").update(value).digest("hex");

/** ADR 54 */
export const OPEN_LINK_TTL_MS = 60_000;
export const SESSION_IDLE_MS = 30 * 24 * 3600_000;
export const SESSION_ABSOLUTE_MS = 90 * 24 * 3600_000;

interface Session {
  createdAt: number;
  lastSeenAt: number;
}

/**
 * One-use open links and browser sessions (ADR 29, 54). Only SHA-256 hashes are kept (ADR 46).
 * Prototype: in memory, so a server restart revokes sessions. The real one persists the hashes in the database.
 */
export class SessionStore {
  private readonly links = new Map<string, number>();
  private readonly sessions = new Map<string, Session>();

  constructor(private readonly now: () => number = Date.now) {}

  createOpenLink(): string {
    this.sweep();
    const secret = randomBytes(32).toString("base64url");
    this.links.set(sha256(secret), this.now() + OPEN_LINK_TTL_MS);
    return secret;
  }

  /** Consumes the link (valid only once) and returns a new session secret, or null. */
  redeemOpenLink(secret: string): string | null {
    const key = sha256(secret);
    const expiresAt = this.links.get(key);
    this.links.delete(key);
    if (expiresAt === undefined || expiresAt < this.now()) return null;
    const session = randomBytes(32).toString("base64url");
    const now = this.now();
    this.sessions.set(sha256(session), { createdAt: now, lastSeenAt: now });
    return session;
  }

  /** Validates a session secret and renews its idle window. */
  touch(secret: string): boolean {
    const key = sha256(secret);
    const session = this.sessions.get(key);
    if (!session) return false;
    const now = this.now();
    if (now - session.lastSeenAt > SESSION_IDLE_MS || now - session.createdAt > SESSION_ABSOLUTE_MS) {
      this.sessions.delete(key);
      return false;
    }
    session.lastSeenAt = now;
    return true;
  }

  revokeAll(): void {
    this.sessions.clear();
  }

  private sweep(): void {
    const now = this.now();
    for (const [key, exp] of this.links) if (exp < now) this.links.delete(key);
  }
}
