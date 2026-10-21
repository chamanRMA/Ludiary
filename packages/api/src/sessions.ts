import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

const sha256 = (value: string): string => createHash("sha256").update(value).digest("hex");
const sha256Bytes = (value: string): Buffer => createHash("sha256").update(value).digest();

/** A real key is 43 characters (ADR 67); anything much longer is not worth hashing. */
const MAX_ORIGIN_KEY_LENGTH = 256;

/** ADR 54 */
export const OPEN_LINK_TTL_MS = 60_000;
export const SESSION_IDLE_MS = 30 * 24 * 3600_000;
export const SESSION_ABSOLUTE_MS = 90 * 24 * 3600_000;

interface Session {
  createdAt: number;
  lastSeenAt: number;
  /** SHA-256 of the origin key (ADR 67). Memory only, never persisted. */
  originKeyHash: Buffer;
}

export type Authorization = "ok" | "no-session" | "no-key";

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

  /** Consumes the link (valid only once) and returns a new session secret and its origin key (ADR 67), or null. */
  redeemOpenLink(secret: string): { session: string; originKey: string } | null {
    const key = sha256(secret);
    const expiresAt = this.links.get(key);
    this.links.delete(key);
    if (expiresAt === undefined || expiresAt < this.now()) return null;
    const session = randomBytes(32).toString("base64url");
    const originKey = randomBytes(32).toString("base64url");
    const now = this.now();
    this.sessions.set(sha256(session), { createdAt: now, lastSeenAt: now, originKeyHash: sha256Bytes(originKey) });
    return { session, originKey };
  }

  /**
   * ADR 67. Walks every cookie value (a planted duplicate must not hide the real session, ADR 66).
   * 'ok' only if some valid session among them has an origin key equal to the header (constant time).
   */
  authorize(cookieValues: readonly string[], originKeyHeader: string | undefined): Authorization {
    const valid = cookieValues.map((v) => this.lookup(v)).filter((s): s is Session => s !== undefined);
    if (valid.length === 0) return "no-session";
    const usable = originKeyHeader !== undefined && originKeyHeader.length > 0 && originKeyHeader.length <= MAX_ORIGIN_KEY_LENGTH;
    const given = sha256Bytes(usable ? originKeyHeader : "");
    let match = false;
    for (const s of valid) if (timingSafeEqual(s.originKeyHash, given)) match = true; // no early exit
    return usable && match ? "ok" : "no-key";
  }

  /** Validates a session secret and renews its idle window. */
  touch(secret: string): boolean {
    return this.lookup(secret) !== undefined;
  }

  private lookup(secret: string): Session | undefined {
    const key = sha256(secret);
    const session = this.sessions.get(key);
    if (!session) return undefined;
    const now = this.now();
    if (now - session.lastSeenAt > SESSION_IDLE_MS || now - session.createdAt > SESSION_ABSOLUTE_MS) {
      this.sessions.delete(key);
      return undefined;
    }
    session.lastSeenAt = now;
    return session;
  }

  revokeAll(): void {
    this.sessions.clear();
  }

  private sweep(): void {
    const now = this.now();
    for (const [key, exp] of this.links) if (exp < now) this.links.delete(key);
  }
}
