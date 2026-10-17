import * as vscode from 'vscode';
import { SessionManager } from '../session/session-manager.js';
import { VaultClient } from '../client/vault-client.js';

export class VaultStatusBarItem {
  private statusBarItem: vscode.StatusBarItem;

  constructor(
    private sessionManager: SessionManager,
    private client: VaultClient
  ) {
    this.statusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Left,
      100
    );

    this.update();
    this.statusBarItem.show();

    this.sessionManager.onDidChangeSession(() => {
      this.update();
    });
  }

  public update(): void {
    if (this.sessionManager.isUnlocked()) {
      this.statusBarItem.text = `$(unlock) Vault: Connected`;
      this.statusBarItem.tooltip = `Vault Host: ${this.client.getBaseUrl()}\nClick to Lock Vault`;
      this.statusBarItem.command = 'personal-vault.lock';
      this.statusBarItem.backgroundColor = undefined;
    } else {
      this.statusBarItem.text = `$(lock) Vault: Locked`;
      this.statusBarItem.tooltip = `Vault is locked.\nClick to Connect & Unlock`;
      this.statusBarItem.command = 'personal-vault.connect';
      this.statusBarItem.backgroundColor = new vscode.ThemeColor(
        'statusBarItem.warningBackground'
      );
    }
  }

  public dispose(): void {
    this.statusBarItem.dispose();
  }
}
