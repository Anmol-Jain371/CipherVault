import * as vscode from 'vscode';
import { URI_SCHEME, PROTOCOL_VERSION, VaultError } from '@personal-vault/shared';
import { VaultClient } from './client/vault-client.js';
import { SessionManager } from './session/session-manager.js';
import { VaultFileSystemProvider } from './providers/vault-fs-provider.js';
import { VaultTreeDataProvider, VaultTreeItem } from './providers/vault-tree-provider.js';
import { VaultStatusBarItem } from './ui/status-bar.js';

let sessionManagerInstance: SessionManager | null = null;

export function activate(context: vscode.ExtensionContext) {
  console.log(`[Personal Vault] Extension activated (Protocol v${PROTOCOL_VERSION}, Scheme: ${URI_SCHEME}:/)`);

  const config = vscode.workspace.getConfiguration('personalVault');
  const serverUrl = config.get<string>('serverUrl') || 'http://127.0.0.1:8743';
  const idleTimeout = config.get<number>('idleTimeoutMinutes') || 15;

  const client = new VaultClient({ baseUrl: serverUrl });
  const sessionManager = new SessionManager(client, idleTimeout);
  sessionManagerInstance = sessionManager;

  const fsProvider = new VaultFileSystemProvider(client, sessionManager);
  const treeProvider = new VaultTreeDataProvider(client, sessionManager);
  const statusBar = new VaultStatusBarItem(sessionManager, client);

  // Register FileSystemProvider for custom scheme: personal-vault:/ with strict read-only enforcement
  const fspRegistration = vscode.workspace.registerFileSystemProvider(URI_SCHEME, fsProvider, {
    isCaseSensitive: true,
    isReadonly: true,
  });

  // Register TreeDataProvider for Vault Explorer
  const treeRegistration = vscode.window.registerTreeDataProvider('vaultExplorer', treeProvider);

  // Watch for configuration changes
  const configWatcher = vscode.workspace.onDidChangeConfiguration((e) => {
    if (e.affectsConfiguration('personalVault.serverUrl')) {
      const newUrl = vscode.workspace.getConfiguration('personalVault').get<string>('serverUrl') || 'http://127.0.0.1:8743';
      client.setBaseUrl(newUrl);
      statusBar.update();
      treeProvider.refresh();
    }
    if (e.affectsConfiguration('personalVault.idleTimeoutMinutes')) {
      const newTimeout = vscode.workspace.getConfiguration('personalVault').get<number>('idleTimeoutMinutes') || 15;
      sessionManager.setIdleTimeoutMinutes(newTimeout);
    }
  });

  // 1. Connect & Unlock command
  const connectCmd = vscode.commands.registerCommand('personal-vault.connect', async () => {
    try {
      // Check server connectivity and initialization state
      let status;
      try {
        status = await client.getStatus();
      } catch (err: any) {
        vscode.window.showErrorMessage(
          `Cannot reach Vault Server at ${client.getBaseUrl()}. Ensure the daemon is running.`
        );
        return;
      }

      if (!status.vaultInitialized) {
        vscode.window.showErrorMessage(
          'Personal Vault on the host is not initialized. For security, vault initialization must be performed directly on the host computer.'
        );
        return;
      }

      // Existing initialized vault: prompt for master password
      const password = await vscode.window.showInputBox({
        prompt: `Enter Master Password for Vault (${client.getBaseUrl()})`,
        password: true,
        ignoreFocusOut: true,
      });

      if (!password) return;

      const loginRes = await client.login(password);
      sessionManager.setToken(loginRes.token);
      if (loginRes.idleTimeoutMs) {
        sessionManager.setIdleTimeoutMs(loginRes.idleTimeoutMs);
      }

      vscode.window.showInformationMessage('Personal Vault unlocked successfully (Read-Only Mode)!');
      treeProvider.refresh();
    } catch (err: any) {
      const msg = err instanceof VaultError ? err.message : String(err.message || err);
      vscode.window.showErrorMessage(`Vault Authentication Failed: ${msg}`);
    }
  });

  // 2. Lock & Disconnect command
  const lockCmd = vscode.commands.registerCommand('personal-vault.lock', async () => {
    await sessionManager.lock();
    vscode.window.showInformationMessage('Personal Vault locked. Ephemeral credentials purged from memory.');
    treeProvider.refresh();
  });

  // 3. Refresh command
  const refreshCmd = vscode.commands.registerCommand('personal-vault.refresh', () => {
    treeProvider.refresh();
  });

  // 4. Copy file content to clipboard (Safe read-only copy workflow)
  const copyFileContentCmd = vscode.commands.registerCommand('personal-vault.copyFileContent', async (node?: VaultTreeItem) => {
    if (!sessionManager.isUnlocked()) {
      vscode.window.showWarningMessage('Please unlock the vault first.');
      return;
    }

    if (!node || node.isDirectory) {
      vscode.window.showWarningMessage('Please select a vault file to copy.');
      return;
    }

    try {
      const { data } = await client.readFile(node.canonicalPath);
      const text = new TextDecoder('utf-8').decode(data);
      await vscode.env.clipboard.writeText(text);
      vscode.window.showInformationMessage(`Copied contents of "${node.label}" to clipboard.`);
    } catch (err: any) {
      vscode.window.showErrorMessage(`Failed to copy file contents: ${err.message}`);
    }
  });

  // 5. Export file to local workspace/disk
  const exportFileCmd = vscode.commands.registerCommand('personal-vault.exportFile', async (node?: VaultTreeItem) => {
    if (!sessionManager.isUnlocked()) {
      vscode.window.showWarningMessage('Please unlock the vault first.');
      return;
    }

    if (!node || node.isDirectory) {
      vscode.window.showWarningMessage('Please select a vault file to export.');
      return;
    }

    try {
      const { data } = await client.readFile(node.canonicalPath);
      const targetUri = await vscode.window.showSaveDialog({
        defaultUri: vscode.Uri.file(node.label),
        title: `Export "${node.label}" to Local Workspace`,
      });
      if (!targetUri) return;

      await vscode.workspace.fs.writeFile(targetUri, data);
      vscode.window.showInformationMessage(`Exported "${node.label}" to ${targetUri.fsPath}`);
    } catch (err: any) {
      vscode.window.showErrorMessage(`Failed to export file: ${err.message}`);
    }
  });

  // 6. Copy canonical vault path
  const copyVaultPathCmd = vscode.commands.registerCommand('personal-vault.copyVaultPath', async (node?: VaultTreeItem) => {
    if (!node) return;
    await vscode.env.clipboard.writeText(node.canonicalPath);
    vscode.window.showInformationMessage(`Copied vault path: ${node.canonicalPath}`);
  });

  context.subscriptions.push(
    fspRegistration,
    treeRegistration,
    configWatcher,
    statusBar,
    connectCmd,
    lockCmd,
    refreshCmd,
    copyFileContentCmd,
    exportFileCmd,
    copyVaultPathCmd
  );
}

export function deactivate() {
  if (sessionManagerInstance) {
    sessionManagerInstance.lock();
  }
}
