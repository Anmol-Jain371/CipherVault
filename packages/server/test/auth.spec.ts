import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { CryptoEngine } from '../src/crypto/crypto.engine.js';
import { RateLimiter } from '../src/auth/rate-limiter.js';
import { SessionStore } from '../src/auth/session-store.js';
import { AuthService } from '../src/auth/auth.service.js';
import { VaultErrorCode } from '@personal-vault/shared';

describe('Authentication & Session Management Specification Tests', () => {
  let tempDir: string;
  let cryptoEngine: CryptoEngine;
  let rateLimiter: RateLimiter;
  let sessionStore: SessionStore;
  let authService: AuthService;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vault-auth-test-'));
    cryptoEngine = new CryptoEngine();
    rateLimiter = new RateLimiter(5, 60000); // 5 attempts, 1 min lockout
    sessionStore = new SessionStore(500, 2000); // 500ms idle timeout for testing
    authService = new AuthService(tempDir, cryptoEngine, rateLimiter, sessionStore);
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('initializes a fresh vault and refuses duplicate initialization', async () => {
    expect(await authService.isInitialized()).toBe(false);

    const session = await authService.initializeVault('valid-strong-master-password-123');
    expect(session.token).toBeDefined();
    expect(await authService.isInitialized()).toBe(true);
    expect(cryptoEngine.isUnlocked()).toBe(true);

    // Duplicate initialization must be blocked
    await expect(authService.initializeVault('another-password-123456')).rejects.toThrow();
  });

  it('authenticates with correct master password and rejects incorrect password', async () => {
    const password = 'my-correct-master-password-999';
    await authService.initializeVault(password);
    authService.lockAll(); // Lock immediately

    expect(cryptoEngine.isUnlocked()).toBe(false);

    // Incorrect password
    await expect(authService.login('wrong-guess-password-000', '127.0.0.1')).rejects.toThrow();
    expect(cryptoEngine.isUnlocked()).toBe(false);

    // Correct password
    const session = await authService.login(password, '127.0.0.1');
    expect(session.token).toBeDefined();
    expect(cryptoEngine.isUnlocked()).toBe(true);
  });

  it('enforces brute-force rate limiting lockout after 5 consecutive failed attempts', async () => {
    const password = 'secure-master-passphrase-888';
    await authService.initializeVault(password);
    authService.lockAll();

    const clientIp = '192.168.1.100';

    // 4 failed attempts: not yet locked out
    for (let i = 0; i < 4; i++) {
      try {
        await authService.login('bad-pass-guess-123', clientIp);
      } catch (err: any) {
        expect(err.code).toBe(VaultErrorCode.INVALID_CREDENTIALS);
      }
    }

    // 5th failed attempt: triggers lockout
    try {
      await authService.login('bad-pass-guess-123', clientIp);
    } catch (err: any) {
      expect(err.code).toBe(VaultErrorCode.INVALID_CREDENTIALS);
    }

    // 6th attempt: immediately rejected by rate limiter (429 Too Many Requests)
    try {
      await authService.login('bad-pass-guess-123', clientIp);
      expect.fail('Should have been rate limited');
    } catch (err: any) {
      expect(err.code).toBe(VaultErrorCode.RATE_LIMITED);
      expect(err.statusCode).toBe(429);
    }
  }, 15000);

  it('expires session after inactivity timeout', async () => {
    const session = await authService.initializeVault('master-password-for-timeout-test');
    expect(authService.authenticateToken(session.token)).toBeDefined();

    // Wait for idle timeout (configured to 500ms in test setup)
    await new Promise((resolve) => setTimeout(resolve, 600));

    try {
      authService.authenticateToken(session.token);
      expect.fail('Should have failed due to expired session');
    } catch (err: any) {
      expect(err.code).toBe(VaultErrorCode.SESSION_EXPIRED);
    }
  });

  it('lockAll explicitly revokes all active sessions and wipes encryption keys from memory', async () => {
    const session = await authService.initializeVault('master-pass-to-test-lock-all');
    expect(authService.authenticateToken(session.token)).toBeDefined();

    authService.lockAll();

    expect(cryptoEngine.isUnlocked()).toBe(false);
    expect(() => authService.authenticateToken(session.token)).toThrowError();
  });
});
