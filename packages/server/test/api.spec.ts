import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { buildServer } from '../src/server.js';
import { FastifyInstance } from 'fastify';
import { VaultErrorCode } from '@personal-vault/shared';

describe('Fastify REST API Integration Tests', () => {
  let tempDir: string;
  let app: FastifyInstance;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vault-api-test-'));
    const context = buildServer({
      host: '127.0.0.1',
      port: 8743,
      storagePath: tempDir,
      sessionIdleTimeoutMs: 60000,
      sessionMaxLifetimeMs: 3600000,
      maxFailedAttempts: 5,
      lockoutDurationMs: 60000,
      logLevel: 'error', // silent during tests
    });
    app = context.app;
    await context.storageEngine.ensureReady();
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('executes full end-to-end lifecycle: init -> write -> read -> stat -> list -> lock -> unlock', async () => {
    // 1. Check status before initialization
    const statusRes = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/status',
    });
    expect(statusRes.statusCode).toBe(200);
    expect(statusRes.json().vaultInitialized).toBe(false);

    // 1b. Attempt remote initialization via Cloudflare tunnel proxy (MUST BE REJECTED WITH 403)
    const remoteInitRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/init',
      headers: {
        'cf-connecting-ip': '203.0.113.50',
        'cf-ray': '8f123456789abcde-FRA',
      },
      payload: { password: 'attacker-remote-password-123' },
    });
    expect(remoteInitRes.statusCode).toBe(403);
    expect(remoteInitRes.json().error.code).toBe(VaultErrorCode.UNAUTHORIZED);

    // 2. Initialize vault with master password directly from local loopback
    const initRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/init',
      payload: { password: 'production-quality-password-2026' },
    });
    expect(initRes.statusCode).toBe(200);
    expect(initRes.json().idleTimeoutMs).toBe(60000); // Duration in ms, not epoch timestamp
    const token = initRes.json().token;
    expect(token).toBeDefined();

    // 3. Create directory
    const mkdirRes = await app.inject({
      method: 'POST',
      url: '/api/v1/vault/mkdir',
      headers: { authorization: `Bearer ${token}` },
      payload: { path: '/notes' },
    });
    expect(mkdirRes.statusCode).toBe(200);

    // 4. Write encrypted file
    const fileContent = 'Meeting notes: VS Code Remote Vault Viva Demo';
    const writeRes = await app.inject({
      method: 'PUT',
      url: '/api/v1/vault/write?path=/notes/meeting.txt',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'text/plain',
      },
      payload: fileContent,
    });
    expect(writeRes.statusCode).toBe(200);
    const etag = writeRes.headers['etag'];
    expect(etag).toBeDefined();

    // 4b. Local attempt to overwrite existing file without overwrite flag must return 409
    const duplicateWriteRes = await app.inject({
      method: 'PUT',
      url: '/api/v1/vault/write?path=/notes/meeting.txt',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'text/plain',
      },
      payload: 'Attempted unauthorized overwrite',
    });
    expect(duplicateWriteRes.statusCode).toBe(409);
    expect(duplicateWriteRes.json().error.code).toBe(VaultErrorCode.ALREADY_EXISTS);

    // 4c. Remote mutation attempts via Cloudflare tunnel proxy MUST be rejected with 403 READ_ONLY_MODE
    const remoteWriteRes = await app.inject({
      method: 'PUT',
      url: '/api/v1/vault/write?path=/notes/remote_write.txt',
      headers: {
        authorization: `Bearer ${token}`,
        'cf-connecting-ip': '203.0.113.50',
        'content-type': 'text/plain',
      },
      payload: 'remote write payload',
    });
    expect(remoteWriteRes.statusCode).toBe(403);
    expect(remoteWriteRes.json().error.code).toBe(VaultErrorCode.READ_ONLY_MODE);

    const remoteMkdirRes = await app.inject({
      method: 'POST',
      url: '/api/v1/vault/mkdir',
      headers: {
        authorization: `Bearer ${token}`,
        'cf-connecting-ip': '203.0.113.50',
      },
      payload: { path: '/remote_dir' },
    });
    expect(remoteMkdirRes.statusCode).toBe(403);
    expect(remoteMkdirRes.json().error.code).toBe(VaultErrorCode.READ_ONLY_MODE);

    const remoteDeleteRes = await app.inject({
      method: 'DELETE',
      url: '/api/v1/vault/entry?path=/notes/meeting.txt',
      headers: {
        authorization: `Bearer ${token}`,
        'cf-connecting-ip': '203.0.113.50',
      },
    });
    expect(remoteDeleteRes.statusCode).toBe(403);
    expect(remoteDeleteRes.json().error.code).toBe(VaultErrorCode.READ_ONLY_MODE);

    const remoteRenameRes = await app.inject({
      method: 'POST',
      url: '/api/v1/vault/rename',
      headers: {
        authorization: `Bearer ${token}`,
        'cf-connecting-ip': '203.0.113.50',
      },
      payload: { oldPath: '/notes/meeting.txt', newPath: '/notes/hacked.txt' },
    });
    expect(remoteRenameRes.statusCode).toBe(403);
    expect(remoteRenameRes.json().error.code).toBe(VaultErrorCode.READ_ONLY_MODE);

    // 5. Read decrypted file
    const readRes = await app.inject({
      method: 'GET',
      url: '/api/v1/vault/read?path=/notes/meeting.txt',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(readRes.statusCode).toBe(200);
    expect(readRes.body).toBe(fileContent);
    expect(readRes.headers['etag']).toBe(etag);

    // 6. List directory
    const listRes = await app.inject({
      method: 'GET',
      url: '/api/v1/vault/list?path=/notes',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(listRes.statusCode).toBe(200);
    const entries = listRes.json().entries;
    expect(entries.some((e: any) => e.name === 'meeting.txt' && e.type === 'file')).toBe(true);

    // 7. Stat file
    const statRes = await app.inject({
      method: 'GET',
      url: '/api/v1/vault/stat?path=/notes/meeting.txt',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(statRes.statusCode).toBe(200);
    expect(statRes.json().size).toBe(Buffer.byteLength(fileContent));

    // 7b. Verify unauthenticated lock attempt is rejected
    const unauthLock = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/lock',
    });
    expect(unauthLock.statusCode).toBe(401);

    // 8. Lock the vault with valid token
    const lockRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/lock',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(lockRes.statusCode).toBe(200);

    // 9. Verify unauthorized request is rejected when locked
    const lockedReadRes = await app.inject({
      method: 'GET',
      url: '/api/v1/vault/read?path=/notes/meeting.txt',
      headers: { authorization: `Bearer ${token}` },
    });
    expect([401, 423]).toContain(lockedReadRes.statusCode);

    // 10. Login / unlock with master password
    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { password: 'production-quality-password-2026' },
    });
    expect(loginRes.statusCode).toBe(200);
    expect(loginRes.json().idleTimeoutMs).toBe(60000); // Duration in ms, not epoch timestamp
    const newToken = loginRes.json().token;

    // 11. Read with new token succeeds
    const unlockReadRes = await app.inject({
      method: 'GET',
      url: '/api/v1/vault/read?path=/notes/meeting.txt',
      headers: { authorization: `Bearer ${newToken}` },
    });
    expect(unlockReadRes.statusCode).toBe(200);
    expect(unlockReadRes.body).toBe(fileContent);
  });
});
