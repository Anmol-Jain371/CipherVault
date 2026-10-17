import crypto from 'node:crypto';
import {
  SESSION_IDLE_TIMEOUT_MS,
  SESSION_MAX_LIFETIME_MS,
  VaultError,
  VaultErrorCode,
} from '@personal-vault/shared';

export interface ActiveSession {
  token: string;
  createdAt: number;
  lastActiveAt: number;
  expiresAt: number;
}

export class SessionStore {
  // In-memory store: tokens are never persisted to disk
  private sessions = new Map<string, ActiveSession>();

  constructor(
    private idleTimeoutMs: number = SESSION_IDLE_TIMEOUT_MS,
    private maxLifetimeMs: number = SESSION_MAX_LIFETIME_MS
  ) {}

  public getIdleTimeoutMs(): number {
    return this.idleTimeoutMs;
  }

  public createSession(): ActiveSession {
    const token = crypto.randomBytes(32).toString('hex');
    const now = Date.now();
    const session: ActiveSession = {
      token,
      createdAt: now,
      lastActiveAt: now,
      expiresAt: now + this.maxLifetimeMs,
    };

    this.sessions.set(token, session);
    return session;
  }

  public validateAndTouch(token: string): ActiveSession {
    const session = this.sessions.get(token);
    if (!session) {
      throw new VaultError(VaultErrorCode.UNAUTHORIZED, 'Invalid or revoked session token', 401);
    }

    const now = Date.now();

    // Check absolute lifetime
    if (now > session.expiresAt) {
      this.sessions.delete(token);
      throw new VaultError(VaultErrorCode.SESSION_EXPIRED, 'Session has reached maximum lifetime', 401);
    }

    // Check sliding idle timeout
    if (now - session.lastActiveAt > this.idleTimeoutMs) {
      this.sessions.delete(token);
      throw new VaultError(VaultErrorCode.SESSION_EXPIRED, 'Session expired due to inactivity', 401);
    }

    // Touch session activity
    session.lastActiveAt = now;
    return session;
  }

  public revoke(token: string): boolean {
    return this.sessions.delete(token);
  }

  public revokeAll(): void {
    this.sessions.clear();
  }

  /**
   * Prunes all sessions that have exceeded absolute lifetime or idle timeout.
   */
  public pruneExpiredSessions(): void {
    const now = Date.now();
    for (const [token, session] of this.sessions.entries()) {
      if (now > session.expiresAt || now - session.lastActiveAt > this.idleTimeoutMs) {
        this.sessions.delete(token);
      }
    }
  }

  public getActiveCount(): number {
    this.pruneExpiredSessions();
    return this.sessions.size;
  }
}
