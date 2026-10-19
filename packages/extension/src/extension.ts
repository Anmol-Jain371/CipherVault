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

  // Register FileSystemProvider for custom scheme: personal-vault:/ (read-only enforced dynamically for remote sessions)
  const fspRegistration = vscode.workspace.registerFileSystemProvider(URI_SCHEME, fsProvider, {
    isCaseSensitive: true,
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

      // Existing initialized vault: prompt for master or viewer password
      const password = await vscode.window.showInputBox({
        prompt: `Enter Password for CipherVault (${client.getBaseUrl()}) - Master Password (Host) or Viewer Password (Read-Only)`,
        password: true,
        ignoreFocusOut: true,
        placeHolder: 'Enter Master Password or Viewer Password',
      });

      if (!password) return;

      const loginRes = await client.login(password);
      sessionManager.setToken(loginRes.token, loginRes.role);
      if (loginRes.idleTimeoutMs) {
        sessionManager.setIdleTimeoutMs(loginRes.idleTimeoutMs);
      }

      if (loginRes.role === 'host') {
        vscode.window.showInformationMessage('🔓 CipherVault Unlocked as Host (Master Control: Upload & Edit Enabled)!');
      } else {
        vscode.window.showInformationMessage('👁️ CipherVault Unlocked as Viewer (Strictly Read-Only Lab Mode).');
      }
      statusBar.update();
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

  // 7. Import file directly to vault (Host local mode)
  const importFileCmd = vscode.commands.registerCommand('personal-vault.importFile', async () => {
    if (!sessionManager.isUnlocked()) {
      vscode.window.showWarningMessage('Please unlock the vault first.');
      return;
    }

    if (!sessionManager.isHost()) {
      vscode.window.showWarningMessage('Only the Host with Master Password can import files into CipherVault.');
      return;
    }

    const selectedUris = await vscode.window.showOpenDialog({
      canSelectFiles: true,
      canSelectFolders: false,
      canSelectMany: true,
      openLabel: 'Import into Vault',
      title: 'Select File(s) to Ingest into CipherVault',
    });

    if (!selectedUris || selectedUris.length === 0) return;

    let importedCount = 0;
    for (const fileUri of selectedUris) {
      try {
        const fileData = await vscode.workspace.fs.readFile(fileUri);
        const fileName = fileUri.path.split('/').pop() || 'file';
        await client.writeFile(`/${fileName}`, fileData);
        importedCount++;
      } catch (err: any) {
        vscode.window.showErrorMessage(`Failed to import ${fileUri.fsPath}: ${err.message}`);
      }
    }

    if (importedCount > 0) {
      vscode.window.showInformationMessage(`Successfully imported ${importedCount} file(s) into CipherVault!`);
      treeProvider.refresh();
    }
  });

  // 8. Create new file directly in vault (Host local mode)
  const createFileCmd = vscode.commands.registerCommand('personal-vault.createFile', async (node?: VaultTreeItem) => {
    if (!sessionManager.isUnlocked()) {
      vscode.window.showWarningMessage('Please unlock the vault first.');
      return;
    }

    if (!sessionManager.isHost()) {
      vscode.window.showWarningMessage('Only the Host with Master Password can create files in CipherVault.');
      return;
    }

    const defaultPrefix = (node && node.isDirectory) ? `${node.canonicalPath.replace(/\/$/, '')}/` : '';

    const input = await vscode.window.showInputBox({
      prompt: 'Enter new vault file name (e.g. script.py or lab1/solution.py)',
      placeHolder: 'script.py',
      value: defaultPrefix,
      validateInput: (val) => {
        if (!val || val.trim().length === 0) {
          return 'File name cannot be empty';
        }
        if (val.trim().endsWith('/')) {
          return 'Please specify a file name, not just a folder';
        }
        return null;
      },
    });

    if (!input) return;

    const trimmed = input.trim();
    const canonicalPath = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;

    try {
      await client.writeFile(canonicalPath, new Uint8Array(0));
      treeProvider.refresh();
      vscode.window.showInformationMessage(`Created "${canonicalPath}" in CipherVault!`);

      // Automatically open the new file in the editor ready to code
      const uri = vscode.Uri.parse(`${URI_SCHEME}:${canonicalPath}`);
      const doc = await vscode.workspace.openTextDocument(uri);
      await vscode.window.showTextDocument(doc);
    } catch (err: any) {
      vscode.window.showErrorMessage(`Failed to create file: ${err.message}`);
    }
  });

  // 9. Delete file/entry from vault (Host only)
  const deleteFileCmd = vscode.commands.registerCommand('personal-vault.deleteFile', async (node?: VaultTreeItem) => {
    if (!sessionManager.isUnlocked()) {
      vscode.window.showWarningMessage('Please unlock the vault first.');
      return;
    }

    if (!sessionManager.isHost()) {
      vscode.window.showWarningMessage('Only the Host with Master Password can delete files from CipherVault.');
      return;
    }

    if (!node) {
      vscode.window.showWarningMessage('Please select a file or folder in CipherVault to delete.');
      return;
    }

    const confirm = await vscode.window.showWarningMessage(
      `Are you sure you want to permanently delete "${node.canonicalPath}" from CipherVault?`,
      { modal: true },
      'Delete'
    );

    if (confirm !== 'Delete') return;

    try {
      await client.deleteEntry(node.canonicalPath, node.isDirectory);
      treeProvider.refresh();
      vscode.window.showInformationMessage(`Deleted "${node.canonicalPath}" from CipherVault.`);
    } catch (err: any) {
      vscode.window.showErrorMessage(`Failed to delete "${node.canonicalPath}": ${err.message}`);
    }
  });

  // Auto-refresh sidebar tree on file changes / saves
  const fsWatcher = fsProvider.onDidChangeFile(() => {
    treeProvider.refresh();
  });

  context.subscriptions.push(
    fspRegistration,
    treeRegistration,
    configWatcher,
    fsWatcher,
    statusBar,
    connectCmd,
    lockCmd,
    refreshCmd,
    copyFileContentCmd,
    exportFileCmd,
    copyVaultPathCmd,
    importFileCmd,
    createFileCmd,
    deleteFileCmd
  );
}

export function deactivate() {
  if (sessionManagerInstance) {
    sessionManagerInstance.lock();
  }
}
