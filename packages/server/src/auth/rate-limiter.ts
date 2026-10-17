import { VaultError, VaultErrorCode } from '@personal-vault/shared';

interface AttemptRecord {
  failedAttempts: number;
  lastAttemptAt: number;
  lockedUntil: number | null;
}

export class RateLimiter {
  private attempts = new Map<string, AttemptRecord>();
  private failureWindowMs: number;
  private maxTrackedEntries: number;

  constructor(
    private maxAttempts: number = 5,
    private lockoutDurationMs: number = 15 * 60 * 1000,
    failureWindowMs?: number,
    maxTrackedEntries: number = 5000
  ) {
    this.failureWindowMs = failureWindowMs || lockoutDurationMs;
    this.maxTrackedEntries = maxTrackedEntries;
  }

  public checkAllowed(identifier: string): void {
    const record = this.attempts.get(identifier);
    if (!record) return;

    const now = Date.now();
    if (record.lockedUntil !== null) {
      if (now < record.lockedUntil) {
        const remainingMinutes = Math.ceil((record.lockedUntil - now) / 60000);
        throw new VaultError(
          VaultErrorCode.RATE_LIMITED,
          `Too many failed authentication attempts. Access locked for ${remainingMinutes} more minute(s).`,
          429,
          { lockedUntil: record.lockedUntil }
        );
      } else {
        // Lockout expired, clean up record
        this.attempts.delete(identifier);
      }
    } else if (now - record.lastAttemptAt > this.failureWindowMs) {
      // Failed attempts expired outside failure window
      this.attempts.delete(identifier);
    }
  }

  public recordFailure(identifier: string): void {
    const now = Date.now();
    let record = this.attempts.get(identifier);

    if (record) {
      // If previous failed attempts have expired, reset counter
      if (record.lockedUntil === null && now - record.lastAttemptAt > this.failureWindowMs) {
        record.failedAttempts = 0;
      }
      record.failedAttempts += 1;
      record.lastAttemptAt = now;
    } else {
      // Check capacity before adding new entry
      if (this.attempts.size >= this.maxTrackedEntries) {
        this.pruneStaleRecords(now);
        // If still at capacity, evict oldest entry
        if (this.attempts.size >= this.maxTrackedEntries) {
          const oldestKey = this.attempts.keys().next().value;
          if (oldestKey) {
            this.attempts.delete(oldestKey);
          }
        }
      }
      record = { failedAttempts: 1, lastAttemptAt: now, lockedUntil: null };
    }

    if (record.failedAttempts >= this.maxAttempts) {
      record.lockedUntil = now + this.lockoutDurationMs;
    }

    this.attempts.set(identifier, record);
  }

  public recordSuccess(identifier: string): void {
    this.attempts.delete(identifier);
  }

  public reset(): void {
    this.attempts.clear();
  }

  /**
   * Prunes expired lockouts and stale attempt records to prevent unbounded memory growth.
   */
  public pruneStaleRecords(now: number = Date.now()): number {
    let prunedCount = 0;
    for (const [id, record] of this.attempts.entries()) {
      const isLockoutExpired = record.lockedUntil !== null && now >= record.lockedUntil;
      const isWindowExpired = record.lockedUntil === null && now - record.lastAttemptAt > this.failureWindowMs;

      if (isLockoutExpired || isWindowExpired) {
        this.attempts.delete(id);
        prunedCount++;
      }
    }
    return prunedCount;
  }

  public getTrackedCount(): number {
    return this.attempts.size;
  }
}
