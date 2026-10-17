import { describe, it, expect } from 'vitest';
import { URI_SCHEME, PROTOCOL_VERSION } from '@personal-vault/shared';

describe('VS Code Extension Scaffolding', () => {
  it('exposes correct custom scheme and protocol version', () => {
    expect(URI_SCHEME).toBe('personal-vault');
    expect(PROTOCOL_VERSION).toBe('1.0.0');
  });
});
