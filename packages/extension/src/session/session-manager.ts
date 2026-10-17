import * as vscode from 'vscode';
import { VaultClient } from '../client/vault-client.js';

export class SessionManager {
  private idleTimeoutMs: number;
  private inactivityTimer: NodeJS.Timeout | null = null;
  private _onDidChangeSession = new vscode.EventEmitter<boolean>();
  public readonly onDidChangeSession = this._onDidChangeSession.event;

  constructor(
    private client: VaultClient,
    idleTimeoutMinutes: number = 15
  ) {
    this.idleTimeoutMs = idleTimeoutMinutes * 60 * 1000;
  }

  public setIdleTimeoutMinutes(minutes: number): void {
    this.idleTimeoutMs = Math.max(1, minutes) * 60 * 1000;
    this.touch();
  }

  public setIdleTimeoutMs(ms: number): void {
    if (typeof ms === 'number' && ms > 0) {
      this.idleTimeoutMs = ms;
      this.touch();
    }
  }

  public isUnlocked(): boolean {
    return this.client.isAuthenticated();
  }

  public setToken(token: string | null): void {
    this.client.setToken(token);
    this.resetTimer();
    this._onDidChangeSession.fire(this.isUnlocked());
  }

  /**
   * Resets the inactivity watchdog. Call on any file operation.
   */
  public touch(): void {
    if (!this.client.isAuthenticated()) return;
    this.resetTimer();
  }

  private resetTimer(): void {
    if (this.inactivityTimer) {
      clearTimeout(this.inactivityTimer);
      this.inactivityTimer = null;
    }

    if (this.client.isAuthenticated()) {
      this.inactivityTimer = setTimeout(() => {
        this.handleAutoLock();
      }, this.idleTimeoutMs);
    }
  }

  private async handleAutoLock(): Promise<void> {
    vscode.window.showWarningMessage('Personal Vault: Session locked automatically due to inactivity.');
    await this.lock();
  }

  public async lock(): Promise<void> {
    if (this.inactivityTimer) {
      clearTimeout(this.inactivityTimer);
      this.inactivityTimer = null;
    }
    await this.client.lock();
    this._onDidChangeSession.fire(false);
  }

  public dispose(): void {
    if (this.inactivityTimer) {
      clearTimeout(this.inactivityTimer);
      this.inactivityTimer = null;
    }
    this._onDidChangeSession.dispose();
  }
}
