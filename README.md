# 🔐 CipherVault

<div align="center">

[![VS Code Marketplace](https://img.shields.io/badge/VS%20Code%20Marketplace-CipherVault-blue?logo=visualstudiocode&style=for-the-badge)](https://marketplace.visualstudio.com/items?itemName=AnmolJainp.personal-vault)
[![License: Proprietary](https://img.shields.io/badge/License-Proprietary-red.svg?style=for-the-badge)](LICENSE)
[![Cost](https://img.shields.io/badge/Cost-%E2%82%B90%20Free-success?style=for-the-badge)](#)
[![Encryption](https://img.shields.io/badge/Security-AES--256--GCM-blueviolet?style=for-the-badge)](#)
[![Platform](https://img.shields.io/badge/Platform-Windows%20%7C%20Linux-lightgrey?style=for-the-badge)](#)

### **Secure. Encrypted. Remote.**
*Access your personal code, assignments, and notes from any college lab PC — encrypted, strictly read-only, and completely free.*

**GitHub Repository:** [Anmol-Jain371/CipherVault](https://github.com/Anmol-Jain371/CipherVault)

</div>

---

## 🎓 Why Every Student Needs CipherVault

If you've ever had to code in a college computer lab, you already know the struggle:

1. **Restricted Lab PCs:** Lab computers have no administrator rights. You can't install VPNs, setup background sync clients, or modify system network configs.
2. **The "Next Student" Risk:** You log into a lab computer, download files from Google Drive, and forget to delete them. The next student sitting at your desk can copy your semester project or personal code.
3. **USB Flash Drive Nightmares:** Carrying USB drives across college computers risks virus infections, corrupted partitions, or strict lab rules banning external media.
4. **Cloud Subscriptions Cost Money:** GitHub Codespaces runs out of free hours, and VPS/AWS instances require credit cards and monthly bills.

### **The CipherVault Solution**

**CipherVault** bridges your home computer and your college lab computer natively through Visual Studio Code:
* 💻 **Your code stays at home:** Files are encrypted at rest with AES-256-GCM on your personal home laptop.
* 🌐 **Zero-Cost Remote Connection:** Connects over a free, temporary Cloudflare Quick Tunnel (`*.trycloudflare.com`). No paid domain, no VPN, ₹0 cost.
* 🛡️ **Strictly Read-Only from the Lab:** You can browse, read, preview, and copy files into your local lab workspace to compile and run them — but no one on the lab computer can delete, overwrite, or corrupt your original home files!
* 🧼 **Zero Traces When You Leave:** Session tokens exist **only in volatile memory**. Click **Lock** or close VS Code, and all credentials are permanently purged from the lab computer.

---

## ⚡ How It Works

```text
[ YOUR HOME LAPTOP ] (Storage Node)
   ├── Encrypted Vault Storage (~/.personal-vault/data/vault_files/)
   ├── Local Ingestion CLI (scripts/local-vault-ops.ps1)
   ├── Vault Daemon (127.0.0.1:8743, AES-256-GCM + scrypt KDF)
   └── Cloudflare Quick Tunnel (cloudflared)
                     ▲
                     │ (Encrypted QUIC / TLS 1.3 Tunnel)
                     ▼
[ CLOUDFLARE EDGE ] (Temporary Public HTTPS Endpoint)
                     ▲
                     │ (HTTPS Port 443 — Bypasses College Firewalls)
                     ▼
[ COLLEGE LAB PC ] (Client Node)
   ├── Visual Studio Code
   └── CipherVault Extension (AnmolJainp.personal-vault)
         ├── Read-Only FileSystemProvider (personal-vault:/)
         ├── Remote Vault Explorer sidebar
         ├── In-Memory Bearer Token (never saved to disk)
         └── 1-Click Code Copy & Local Workspace Export
```

---

## 🚀 Step-by-Step Student Guide

### Part 1: Setting Up Your Home Laptop (Before Leaving for College)

#### 1. Clone & Build
```powershell
git clone https://github.com/Anmol-Jain371/CipherVault.git
cd CipherVault
npm install
npm run build
```

#### 2. Initialize Your Vault (One-Time)
Run the host-only operational tool to set your secret master password:
```powershell
.\scripts\local-vault-ops.ps1 -Action init -Password "Your-Strong-Master-Password"
```

#### 3. Upload Your Projects & Code into the Vault
Easily import your files or entire project folders before heading out:
```powershell
# Import a single file:
.\scripts\local-vault-ops.ps1 -Action import -Password "Your-Strong-Master-Password" -Source "C:\Projects\my-code\main.py" -VaultPath "/projects/main.py"

# Import an entire folder recursively:
.\scripts\local-vault-ops.ps1 -Action import -Password "Your-Strong-Master-Password" -Source "C:\Projects\DSA-Sheets" -VaultPath "/dsa"

# List your vault to verify:
.\scripts\local-vault-ops.ps1 -Action list -Password "Your-Strong-Master-Password" -VaultPath "/"
```

#### 4. Start the Daemon & Cloudflare Tunnel
Keep your home laptop awake, plugged in, and run:
```powershell
.\scripts\run-all.ps1
```
The script will output your temporary public tunnel URL:
```text
Tunnel URL: https://random-name-1234.trycloudflare.com
```
*Tip: Copy or message this temporary URL to your phone so you can paste it into the lab computer!*

---

### Part 2: Working on the College Lab Computer

#### 1. Install the Extension in VS Code
* **Option A (Marketplace):** Search for `CipherVault` in the VS Code Extensions tab (`Ctrl+Shift+X`) and click **Install**.
* **Option B (Offline VSIX):** If the lab has restricted marketplace downloads, copy `packages/extension/personal-vault-0.1.1.vsix` onto a flash drive or download it, press `Ctrl+Shift+P` -> `Extensions: Install from VSIX...`, and select the file.

#### 2. Configure the Tunnel URL
1. Open VS Code Settings (`Ctrl+,`).
2. Search for: `personalVault.serverUrl`.
3. Paste your active tunnel URL (e.g. `https://random-name-1234.trycloudflare.com`).

#### 3. Unlock and Browse Your Code
1. Click `$(lock) Vault: Locked` in the bottom status bar, or open the **CipherVault** icon on the left Activity Bar.
2. Select **Personal Vault: Connect & Unlock Vault**.
3. Type your secret **Master Password**.
4. Once verified, the status bar turns to `$(unlock) Vault: Connected` and your files appear in the **Remote Vault Explorer**!

---

## 🛠️ Typical Student Lab Workflows

| What You Want to Do | How to Do It in CipherVault |
| :--- | :--- |
| **Preview Code / Read Notes** | Just click any file in the Remote Vault Explorer. It opens in a read-only tab with full syntax highlighting. |
| **Copy Code to Local File** | Right-click any file $\rightarrow$ select **Personal Vault: Copy File Content to Clipboard**. Paste it right into your lab project! |
| **Export File to Work Locally** | Right-click any file $\rightarrow$ select **Personal Vault: Export File to Local Workspace...**. Save it to your temporary lab folder to compile, run, or edit freely. |
| **Copy Vault Path** | Right-click any entry $\rightarrow$ select **Personal Vault: Copy Vault Path**. |
| **Lock When Stepping Away** | Click `$(unlock) Vault: Connected` in the status bar $\rightarrow$ instant memory wipe and session revocation! |

---

## 🔒 5-Step End-of-Lab Hygiene Checklist

> [!IMPORTANT]
> When your lab class ends, follow these 5 quick steps before leaving your desk:
> 1. **Lock & Disconnect Vault:** Click `$(unlock) Vault: Connected` or run `Personal Vault: Lock & Disconnect Vault`. This instantly destroys the in-memory token.
> 2. **Close Virtual Editor Tabs:** Press `Ctrl+K W` to close all open tabs so decrypted plaintext is flushed from editor memory.
> 3. **Delete Local Working Copies:** If you exported files to the lab desktop to run them, permanently delete them (`Shift+Delete`).
> 4. **Clear Windows Clipboard:** Press `Win+V` to open clipboard history and click **Clear All**.
> 5. **Close Visual Studio Code:** Exit VS Code completely so the operating system frees all heap allocations.

---

## 🛡️ Under the Hood: Security Architecture

CipherVault was engineered with serious cryptographic discipline:
* **AES-256-GCM Authenticated Encryption:** Every file envelope stored on disk is encrypted with AES-256-GCM. A unique 96-bit random nonce (IV) is generated for every write operation, and a 128-bit authentication tag detects any bit-flipping or tampering.
* **scrypt Key Derivation ($N=131072, r=8, p=1$):** Passwords are never stored on disk. Encryption keys are derived using scrypt with a cryptographically secure 256-bit random salt, making brute-force attacks computationally impractical.
* **Constant-Time Verification:** Password authentication uses `crypto.timingSafeEqual` to eliminate side-channel timing attacks.
* **Brute-Force Rate Limiting:** 5 consecutive failed login attempts trigger an immediate 15-minute IP lockout.
* **Virtual Chroot & Traversal Immunity:** Path sanitization strictly rejects null bytes (`\0`), Windows drive letters (`C:`), UNC paths (`\\`), and directory traversal sequences (`..`).
* **Server-Side Read-Only Enforcement:** Even if an attacker sends raw HTTP `PUT`, `POST`, or `DELETE` requests directly to the daemon over the tunnel, the server rejects them with `HTTP 403 VAULT_READ_ONLY_MODE`.

---

## 🤝 Community & Support

* **GitHub Repository:** [Anmol-Jain371/CipherVault](https://github.com/Anmol-Jain371/CipherVault)
* **Report Bugs & Suggest Features:** [GitHub Issues](https://github.com/Anmol-Jain371/CipherVault/issues)
* **License:** Proprietary. Copyright (c) 2026 Personal Vault Authors. All rights reserved. See [`LICENSE`](LICENSE) for terms.

⭐ **If CipherVault helped you in your college lab, give the repository a star on GitHub!**
