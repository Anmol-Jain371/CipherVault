import { describe, it, expect, vi, beforeEach } from 'vitest';
import './vscode.mock.js';
import { SessionManager } from '../src/session/session-manager.js';
import { VaultClient } from '../src/client/vault-client.js';

describe('SessionManager In-Memory Watchdog', () => {
  let client: VaultClient;
  let sessionManager: SessionManager;

  beforeEach(() => {
    client = new VaultClient({ baseUrl: 'http://127.0.0.1:8743' });
    sessionManager = new SessionManager(client, 15);
  });

  it('notifies subscribers on session status changes', () => {
    const states: boolean[] = [];
    sessionManager.onDidChangeSession((isUnlocked) => {
      states.push(isUnlocked);
    });

    sessionManager.setToken('temp-token');
    expect(states).toEqual([true]);

    sessionManager.setToken(null);
    expect(states).toEqual([true, false]);
  });

  it('automatically locks session when inactivity timer expires', async () => {
    // Set 50ms timeout for test
    (sessionManager as any).idleTimeoutMs = 50;

    let unlocked = false;
    sessionManager.onDidChangeSession((state) => {
      unlocked = state;
    });

    sessionManager.setToken('ephemeral-token');
    expect(sessionManager.isUnlocked()).toBe(true);

    // Wait 120ms for auto-lock timer to fire and async lock to complete
    await new Promise((resolve) => setTimeout(resolve, 120));

    expect(sessionManager.isUnlocked()).toBe(false);
    expect(client.getToken()).toBeNull();
    expect(unlocked).toBe(false);
  });

  it('synchronizes timeout duration using setIdleTimeoutMs', async () => {
    sessionManager.setIdleTimeoutMs(40);
    expect((sessionManager as any).idleTimeoutMs).toBe(40);

    sessionManager.setToken('sync-test-token');
    expect(sessionManager.isUnlocked()).toBe(true);

    await new Promise((resolve) => setTimeout(resolve, 80));

    expect(sessionManager.isUnlocked()).toBe(false);
  });
});
