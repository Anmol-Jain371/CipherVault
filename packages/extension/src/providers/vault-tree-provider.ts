import * as vscode from 'vscode';
import { VaultClient } from '../client/vault-client.js';
import { SessionManager } from '../session/session-manager.js';
import { URI_SCHEME } from '@personal-vault/shared';

export class VaultTreeItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly canonicalPath: string,
    public readonly isDirectory: boolean,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState
  ) {
    super(label, collapsibleState);

    this.tooltip = canonicalPath;
    if (isDirectory) {
      this.contextValue = 'directory';
      this.iconPath = new vscode.ThemeIcon('folder');
    } else {
      this.contextValue = 'file';
      this.iconPath = new vscode.ThemeIcon('file');
      this.command = {
        command: 'vscode.open',
        title: 'Open Vault File',
        arguments: [vscode.Uri.parse(`${URI_SCHEME}:${canonicalPath}`)],
      };
    }
  }
}

export class VaultTreeDataProvider implements vscode.TreeDataProvider<VaultTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<VaultTreeItem | undefined | void>();
  public readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(
    private client: VaultClient,
    private sessionManager: SessionManager
  ) {
    this.sessionManager.onDidChangeSession(() => {
      this.refresh();
    });
  }

  public refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  public getTreeItem(element: VaultTreeItem): vscode.TreeItem {
    return element;
  }

  public async getChildren(element?: VaultTreeItem): Promise<VaultTreeItem[]> {
    if (!this.sessionManager.isUnlocked()) {
      const lockItem = new VaultTreeItem(
        'Vault is Locked (Click to Unlock)',
        '/',
        false,
        vscode.TreeItemCollapsibleState.None
      );
      lockItem.iconPath = new vscode.ThemeIcon('lock');
      lockItem.command = {
        command: 'personal-vault.connect',
        title: 'Connect & Unlock Vault',
      };
      return [lockItem];
    }

    const currentPath = element ? element.canonicalPath : '/';

    try {
      const entries = await this.client.listDirectory(currentPath);
      // Sort directories first, then alphabetically
      entries.sort((a, b) => {
        if (a.type !== b.type) {
          return a.type === 'directory' ? -1 : 1;
        }
        return a.name.localeCompare(b.name);
      });

      return entries.map((e) => {
        const isDir = e.type === 'directory';
        return new VaultTreeItem(
          e.name,
          e.path,
          isDir,
          isDir ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None
        );
      });
    } catch (err: any) {
      const errorItem = new VaultTreeItem(
        `Error loading vault: ${err.message || 'Network error'}`,
        '/',
        false,
        vscode.TreeItemCollapsibleState.None
      );
      errorItem.iconPath = new vscode.ThemeIcon('error');
      return [errorItem];
    }
  }
}
