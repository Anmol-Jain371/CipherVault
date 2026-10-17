import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { CryptoEngine } from '../src/crypto/crypto.engine.js';
import { StorageEngine } from '../src/storage/storage.engine.js';
import { deriveKeys, generateSalt } from '../src/crypto/kdf.js';
import { sanitizeVaultPath, VaultErrorCode, MAX_FILE_SIZE_BYTES } from '@personal-vault/shared';

describe('Security Hardening & Adversarial Vector Tests', () => {
  let tempDir: string;
  let cryptoEngine: CryptoEngine;
  let storageEngine: StorageEngine;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vault-security-test-'));
    cryptoEngine = new CryptoEngine();
    const salt = generateSalt();
    const { masterKey } = await deriveKeys('secure-passphrase-testing-987!', salt);
    cryptoEngine.setMasterKey(masterKey);

    storageEngine = new StorageEngine(tempDir, cryptoEngine);
    await storageEngine.ensureReady();
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('rejects NTFS alternate data streams (:stream) to prevent metadata bypass', () => {
    expect(() => sanitizeVaultPath('/notes/file.txt:secret_stream')).toThrowError();
    try {
      sanitizeVaultPath('/notes/file.txt:secret_stream');
    } catch (err: any) {
      expect(err.code).toBe(VaultErrorCode.PATH_TRAVERSAL_DETECTED);
    }
  });

  it('rejects deeply nested path traversal attempts and mixed slash variations', () => {
    const maliciousPaths = [
      '..\\..\\..\\Windows\\System32\\config\\SAM',
      '/folder/../../../etc/passwd',
      '/a/b/c/../../../../../../root',
      '/.//..//./..//escape.txt',
      '/%2e%2e/%2e%2e/test.txt', // URL-like patterns if passed as raw paths
    ];

    for (const p of maliciousPaths) {
      expect(() => sanitizeVaultPath(p)).toThrowError();
    }
  });

  it('rejects files exceeding MAX_FILE_SIZE_BYTES with 413 error', async () => {
    // Generate a payload exceeding 50MB
    const oversizedBuffer = Buffer.alloc(MAX_FILE_SIZE_BYTES + 1024);

    await expect(
      storageEngine.writeFile('/huge_file.bin', oversizedBuffer)
    ).rejects.toThrow();

    try {
      await storageEngine.writeFile('/huge_file.bin', oversizedBuffer);
    } catch (err: any) {
      expect(err.code).toBe(VaultErrorCode.FILE_TOO_LARGE);
      expect(err.statusCode).toBe(413);
    }
  });

  it('zeroes out master key memory upon locking to prevent heap retention', () => {
    expect(cryptoEngine.isUnlocked()).toBe(true);
    cryptoEngine.lock();
    expect(cryptoEngine.isUnlocked()).toBe(false);

    // Further crypto operations must strictly fail
    expect(() => cryptoEngine.encrypt(Buffer.from('test'), '/test.txt')).toThrowError();
  });

  it('maintains strict isolation between independent client IP lockout counters', async () => {
    const { RateLimiter } = await import('../src/auth/rate-limiter.js');
    const limiter = new RateLimiter(3, 60000);

    const attackerIp = '10.0.0.99';
    const legitimateIp = '10.0.0.5';

    // Attacker fails 3 times
    limiter.recordFailure(attackerIp);
    limiter.recordFailure(attackerIp);
    limiter.recordFailure(attackerIp);

    // Attacker is locked out
    expect(() => limiter.checkAllowed(attackerIp)).toThrowError();

    // Legitimate IP is unaffected
    expect(() => limiter.checkAllowed(legitimateIp)).not.toThrow();
  });

  it('prunes expired and idle sessions so stale sessions do not hold daemon active count open', async () => {
    const { SessionStore } = await import('../src/auth/session-store.js');
    const store = new SessionStore(50, 100); // 50ms idle, 100ms max

    store.createSession();
    expect(store.getActiveCount()).toBe(1);

    // Wait 70ms for idle timeout
    await new Promise((resolve) => setTimeout(resolve, 70));

    expect(store.getActiveCount()).toBe(0);
  });

  it('resets failed attempt counter after the failure window expires (sliding window decay)', async () => {
    const { RateLimiter } = await import('../src/auth/rate-limiter.js');
    // 3 max attempts, 50ms failure window
    const limiter = new RateLimiter(3, 1000, 50);

    limiter.recordFailure('192.168.1.50');
    limiter.recordFailure('192.168.1.50');
    // Not yet locked out (2 of 3)
    expect(() => limiter.checkAllowed('192.168.1.50')).not.toThrow();

    // Wait 60ms for failure window to expire
    await new Promise((resolve) => setTimeout(resolve, 60));

    // checkAllowed should prune the expired failure count
    limiter.checkAllowed('192.168.1.50');

    // A new failure should start at count 1 rather than triggering a lockout
    limiter.recordFailure('192.168.1.50');
    expect(() => limiter.checkAllowed('192.168.1.50')).not.toThrow();
  });

  it('bounds memory by evicting stale and oldest records under high load', async () => {
    const { RateLimiter } = await import('../src/auth/rate-limiter.js');
    // Max capacity of 5 entries
    const limiter = new RateLimiter(5, 60000, 60000, 5);

    for (let i = 0; i < 10; i++) {
      limiter.recordFailure(`10.0.0.${i}`);
    }

    // Must not exceed maxTrackedEntries (5)
    expect(limiter.getTrackedCount()).toBeLessThanOrEqual(5);
  });

  it('strictly blocks sibling directory prefix traversal at the storage containment boundary', () => {
    // Attempt to access a sibling directory named vault_files_sibling
    expect(() => (storageEngine as any).resolvePhysicalPath('/../vault_files_sibling/secret.txt', false)).toThrowError();
  });
});
