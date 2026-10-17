# CipherVault

<div align="center">

### **Secure. Encrypted. Remote.**
*Access your personal code, assignments, and notes from any college lab PC — encrypted, strictly read-only, and completely free (₹0).*

**GitHub Repository:** [Anmol-Jain371/CipherVault](https://github.com/Anmol-Jain371/CipherVault)

</div>

---

## 🎓 Built for Students & Developers

Tired of risking USB drives with viruses, paying for cloud servers, or leaving private code on shared college lab PCs where the next student can copy it?

**CipherVault** connects Visual Studio Code on your lab workstation directly to your personal home laptop over a temporary, encrypted HTTPS tunnel:

* 🛡️ **Strictly Read-Only Remote Access:** Files open in read-only editor tabs with syntax highlighting. You can read, preview, and copy code, but you cannot accidentally overwrite, delete, or modify your original files on your home laptop!
* 📋 **1-Click Copy & Local Workspace Export:** Right-click any file in the explorer to **Copy File Content** to clipboard or **Export File to Local Workspace** so you can compile, debug, and run your code locally on the lab PC.
* 🧼 **Zero Traces Left Behind:** Session tokens are held **strictly in volatile extension memory**. When you click Lock or close VS Code, the session is revoked and all credentials are wiped from memory.
* 💸 **100% Free (₹0 Cost):** Uses free Cloudflare Quick Tunnels. No domain name, no paid subscriptions, no VPS required.
* 🔒 **Zero Telemetry:** Completely private; collects no user data, tracking, or analytics.

---

## 🚀 How to Use in the College Lab

### Step 1: Configure Your Tunnel URL
1. Open VS Code Settings (`Ctrl+,` on Windows/Linux or `Cmd+,` on macOS).
2. Search for: `personalVault.serverUrl`.
3. Paste the active HTTPS tunnel address running on your home laptop (e.g. `https://random-name-1234.trycloudflare.com`).
4. (Optional) Set `personalVault.idleTimeoutMinutes` (default: `15` minutes).

### Step 2: Connect & Unlock
1. Click the **CipherVault** icon on the left Activity Bar or click `$(lock) Vault: Locked` in the bottom Status Bar.
2. Select **Personal Vault: Connect & Unlock Vault**.
3. Enter your secret **Master Password** in the secure masked input box.
4. Once verified, the status bar turns to `$(unlock) Vault: Connected` and your remote files appear in the **Remote Vault Explorer**!

### Step 3: Browse, Copy & Code
* **Browse:** Expand folders in the **Remote Vault Explorer** tree view.
* **Preview / Read:** Click any file to open it in a read-only editor tab.
* **Copy Content:** Right-click a file $\rightarrow$ select **Personal Vault: Copy File Content to Clipboard**.
* **Export Locally:** Right-click a file $\rightarrow$ select **Personal Vault: Export File to Local Workspace...** to save a copy in your temporary lab folder.
* **Lock / Disconnect:** Click `$(unlock) Vault: Connected` in the status bar $\rightarrow$ instant memory wipe and session revocation!

---

## 🔒 5-Step End-of-Lab Hygiene Checklist

> [!IMPORTANT]
> When your lab session is over, protect your privacy before leaving the computer:
> 1. **Lock the Vault:** Click `$(unlock) Vault: Connected` or run `Personal Vault: Lock & Disconnect Vault`.
> 2. **Close Virtual Editor Tabs:** Press `Ctrl+K W` to close all open tabs so decrypted plaintext is flushed from editor memory.
> 3. **Delete Local Working Copies:** If you exported files to the lab desktop to run them, permanently delete them (`Shift+Delete`).
> 4. **Clear Windows Clipboard:** Press `Win+V` to open clipboard history and click **Clear All**.
> 5. **Close Visual Studio Code:** Exit VS Code completely so the operating system frees all memory allocations.

---

## ⚙️ Extension Settings

* `personalVault.serverUrl`: The HTTPS endpoint of your vault daemon (default: `http://127.0.0.1:8743`).
* `personalVault.idleTimeoutMinutes`: Inactivity timeout before automatically locking the vault and clearing session tokens (default: `15` minutes).

---

## 🤝 Open Community & Source

* **GitHub Repository:** [Anmol-Jain371/CipherVault](https://github.com/Anmol-Jain371/CipherVault)
* **Issues & Feature Requests:** [GitHub Issues](https://github.com/Anmol-Jain371/CipherVault/issues)
* **License:** Proprietary. Copyright (c) 2026 Personal Vault Authors. All rights reserved. See `LICENSE` for details.
