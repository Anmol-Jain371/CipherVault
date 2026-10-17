import { describe, it, expect } from 'vitest';
import { loadConfig } from '../src/config.js';

describe('Server Configuration Loader', () => {
  it('loads default secure configuration', () => {
    const config = loadConfig({});
    expect(config.host).toBe('127.0.0.1');
    expect(config.port).toBe(8743);
    expect(config.sessionIdleTimeoutMs).toBe(15 * 60 * 1000);
    expect(config.storagePath).toContain('.personal-vault');
  });

  it('prohibits 0.0.0.0 binding for security', () => {
    expect(() => loadConfig({ VAULT_HOST: '0.0.0.0' })).toThrowError(/SECURITY VIOLATION/);
  });

  it('validates custom port range', () => {
    expect(() => loadConfig({ VAULT_PORT: '99999' })).toThrowError(/Invalid VAULT_PORT/);
    expect(() => loadConfig({ VAULT_PORT: 'invalid' })).toThrowError(/Invalid VAULT_PORT/);
    const valid = loadConfig({ VAULT_PORT: '9000' });
    expect(valid.port).toBe(9000);
  });
});
