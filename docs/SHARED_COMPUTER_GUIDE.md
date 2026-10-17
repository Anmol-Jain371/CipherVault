# Shared Computer Operational Guide & Security Hygiene

This guide provides practical instructions for safely using the **Personal Encrypted Remote Vault** on shared, restricted college computers (e.g., academic lab PCs running Windows or Linux).

---

## 1. Prerequisites on College Computer

* **Visual Studio Code** installed (Standard User or Portable version; administrator rights are **not** required).
* Outbound HTTPS connectivity on college Wi-Fi (standard TCP port 443).
* The packaged extension file: `personal-vault-0.1.0.vsix` (transferred via USB flash drive or secure download).

---

## 2. Step-by-Step Setup on the Lab Computer

### Step 2.1: Install Extension from VSIX (No Admin Needed)
1. Open VS Code on the lab computer.
2. Press `Ctrl+Shift+P` (or `Cmd+Shift+P`) to open the Command Palette.
3. Type and select: `Extensions: Install from VSIX...`.
4. Browse to and select `personal-vault-0.1.0.vsix`.
5. VS Code installs the extension into your user directory (`~/.vscode/extensions` or `%USERPROFILE%\.vscode\extensions`).

### Step 2.2: Configure VS Code Privacy Settings
To prevent VS Code from automatically caching unencrypted file snapshots to disk, apply these settings in your user `settings.json` (`Ctrl+,` -> Open Settings JSON):

```json
{
  "files.hotExit": "off",
  "workbench.enableExperiments": false,
  "telemetry.telemetryLevel": "off"
}
```

* `"files.hotExit": "off"` ensures VS Code never writes unsaved buffer backups to the shared disk.

### Step 2.3: Configure the Tunnel URL
1. Open Settings (`Ctrl+,`).
2. Search for: `personalVault.serverUrl`.
3. Paste the active Cloudflare tunnel URL running on your home laptop:
   ```text
   https://<unique-id>.trycloudflare.com
   ```
4. (Optional) Adjust `personalVault.idleTimeoutMinutes` (default is 15 minutes).

### Step 2.4: Connect & Unlock Vault
1. Click the **Personal Vault** lock icon in the VS Code Activity Bar (left sidebar) or click `$(lock) Vault: Locked` in the status bar.
2. Run command: `Personal Vault: Connect & Unlock Vault`.
3. Type your Master Password into the masked input box (`password: true`).
4. Once verified, the status bar turns to `$(unlock) Vault: Connected` and your remote files appear in the **Remote Vault Explorer**.

---

## 3. Remote Read-Only Workflow

The remote vault is **strictly read-only**:
1. **Browse:** Click folders in the Remote Vault Explorer to expand subdirectories.
2. **Read / Preview:** Click any file to open it. It opens in a read-only editor tab with full syntax highlighting.
3. **Copy Code:** Right-click any file in the explorer and choose **Personal Vault: Copy File Content** to place the entire file text on your clipboard.
4. **Export for Local Editing:** Right-click any file in the explorer and choose **Personal Vault: Export File Locally**. Save it into a local working folder on the lab computer. You can now edit, compile, or run the local file normally without affecting the original vault.

---

## 4. Mandatory End-of-Session Checklist

> [!IMPORTANT]
> When your lab session is finished, perform this 5-step checklist before leaving the computer:

1. **Delete Any Local Working Files:**
   * If you exported files locally to work on them, permanently delete those working files (`Shift+Delete` on Windows or `rm` on Linux).
2. **Close All Virtual Editor Tabs:**
   * Press `Ctrl+K W` to close all open editor tabs. This purges decrypted file contents from active VS Code editor memory.
3. **Lock & Disconnect the Vault:**
   * Click `$(unlock) Vault: Connected` on the status bar or run `Personal Vault: Lock & Disconnect Vault`.
   * This immediately revokes your ephemeral session token on the server and zeroes the token in the extension's memory.
4. **Clear Clipboard History:**
   * On Windows: Press `Win+V` to open clipboard history, then click **Clear All** (or copy a single arbitrary character).
5. **Exit Visual Studio Code:**
   * Close VS Code completely to ensure all in-memory heap allocations are released back to the operating system.

