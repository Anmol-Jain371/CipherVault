import { describe, it, expect, vi, beforeEach } from 'vitest';
import { VaultClient } from '../src/client/vault-client.js';

describe('VaultClient HTTP Protocol & Error Mapping', () => {
  let client: VaultClient;

  beforeEach(() => {
    client = new VaultClient({ baseUrl: 'http://127.0.0.1:8743' });
    vi.restoreAllMocks();
  });

  it('manages baseUrl and token in memory', () => {
    expect(client.getBaseUrl()).toBe('http://127.0.0.1:8743');
    expect(client.isAuthenticated()).toBe(false);

    client.setToken('test-ephemeral-token-abc');
    expect(client.isAuthenticated()).toBe(true);
    expect(client.getToken()).toBe('test-ephemeral-token-abc');

    client.setToken(null);
    expect(client.isAuthenticated()).toBe(false);
  });

  it('injects Bearer token into requests when authenticated', async () => {
    client.setToken('auth-token-123');

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ path: '/', entries: [] }),
    });
    vi.stubGlobal('fetch', mockFetch);

    await client.listDirectory('/');

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const callArgs = mockFetch.mock.calls[0];
    expect(callArgs[0]).toBe('http://127.0.0.1:8743/api/v1/vault/list?path=%2F');
    expect(callArgs[1].headers['authorization']).toBe('Bearer auth-token-123');
  });

  it('translates HTTP 412 Concurrency Conflict to VaultError', async () => {
    client.setToken('token');

    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 412,
      statusText: 'Precondition Failed',
      json: async () => ({
        error: {
          code: 'VAULT_CONCURRENCY_CONFLICT',
          message: 'File modified concurrently',
        },
      }),
    });
    vi.stubGlobal('fetch', mockFetch);

    await expect(
      client.writeFile('/test.txt', new Uint8Array([1, 2, 3]), '"old-etag"')
    ).rejects.toThrowError(/concurrently/);
  });
});
