# 🚀 Daily Guide: How to Start & Run CipherVault for College

Keep this cheatsheet handy! Follow these steps every morning before heading to college.

---

## ⚠️ THE GOLDEN RULE: LOCK (`Win + L`), DO NOT SLEEP!

> [!CAUTION]
> **DO NOT PUT YOUR LAPTOP TO SLEEP!**
> * **Sleep Mode:** Turns off your laptop's CPU, Wi-Fi, and background servers. If your laptop goes to sleep, the extension in your college lab will disconnect!
> * **Lock Screen (`Win + L`):** Locks your keyboard and screen with your Windows password so nobody at home can touch your computer. **All background programs, Wi-Fi, and CipherVault continue running 100%!** The screen can turn off/black, but the laptop remains awake.

---

## ⚙️ One-Time Setup Check (Do this once)

Make sure Windows doesn't put your laptop to sleep automatically:
1. Press `Win + I` $\rightarrow$ Open **Settings**.
2. Go to **System** $\rightarrow$ **Power & battery** $\rightarrow$ **Screen and sleep**.
3. Set **"When plugged in, put my device to sleep after"** $\rightarrow$ 👉 **Never**.
4. *(Optional - To close laptop lid):*
   * Press `Win + R`, type `control`, press Enter.
   * Go to **Hardware and Sound** $\rightarrow$ **Power Options**.
   * Click **"Choose what closing the lid does"** on the left.
   * Under **Plugged in**, set **"When I close the lid"** to 👉 **"Do nothing"**.

---

## 🌅 Morning Routine (Before Leaving for College)

### Step 1: Plug in Your Laptop Charger
Keep your home laptop plugged into wall power so the battery doesn't drain.

### Step 2: Ingest New Code into Your Vault (If you worked on new files)
If you created new files or projects you want to access from college, you can add them in two easy ways:

**Option A (Easiest — File Picker or Drag & Drop):**
* Double-click `.\scripts\add-to-vault.bat` $\rightarrow$ A Windows dialog pops up to pick your file or folder!
* *(Or simply drag and drop any file or folder directly onto `add-to-vault.bat`).*

**Option B (PowerShell Command):**
```powershell
# Import a folder (e.g. your assignments or DSA code):
.\scripts\local-vault-ops.ps1 -Action import -Source "C:\Projects\my-code" -Destination "/projects/my-code"

# (If files already exist in vault and you want to replace them, add -Overwrite):
.\scripts\local-vault-ops.ps1 -Action import -Source "C:\Projects\my-code" -Destination "/projects/my-code" -Overwrite
```

### Step 3: Set / Change College Lab Viewer Password (Optional)
If you want to give friends or lab users access to view your files without giving away your Master Password:
* Double-click `.\scripts\set-viewer-password.bat`
* Enter your Master Password, then type the simple password you want to share (e.g. `lab2026`).
* They will only have **Strictly Read-Only** access. Only you can upload or modify files!

### Step 4: Start the Server & Tunnel
In PowerShell, run:
```powershell
.\scripts\run-all.ps1
```
Two windows will open:
1. The **Vault Server Daemon** (running securely on `127.0.0.1:8743`).
2. The **Cloudflare Quick Tunnel**, which will print a temporary link:
   ```text
   Tunnel URL: https://random-words-1234.trycloudflare.com
   ```

### Step 5: Save the Tunnel URL to Your Phone
* Copy that `https://...trycloudflare.com` URL and send it to yourself on WhatsApp, Telegram, or Email so you have it ready on your phone!

### Step 6: Lock Your Laptop & Leave
* Press **`Win + L`** to **Lock your laptop screen**.
* *(Or close the lid if you configured "Do nothing" above).*
* **Leave your laptop plugged in and connected to Wi-Fi.**
* You are all set to leave for college! 🎒

---

## 🏫 When You Arrive at the College Lab PC

1. Open **Visual Studio Code** on the lab computer.
2. Make sure the **CipherVault** extension (by `UnluckyJainCunt`) is installed:
   * Search `CipherVault` in Extensions (`Ctrl+Shift+X`) and click **Install**.
3. Configure the Tunnel URL:
   * Press `Ctrl+,` to open Settings.
   * Search `personalVault.serverUrl`.
   * Paste the URL from your phone: `https://random-words-1234.trycloudflare.com`.
4. Connect & Unlock:
   * Click `$(lock) CipherVault: Locked` in the status bar (bottom).
   * Enter the **Viewer Password** (for safe Read-Only browsing) or your **Master Password** (for Host control).
   * Status bar turns to:
     - `$(shield) CipherVault: Host` (Full Access) OR
     - `$(eye) CipherVault: Viewer (Read-Only)`
5. Browse your files, right-click to **Copy File Content** or **Export File to Local Workspace** to code and compile locally!

---

## 🏃‍♂️ Before Leaving the College Lab (Hygiene)

Follow the 30-second checklist:
1. Click `$(unlock) Vault: Connected` in the status bar $\rightarrow$ **Lock & Disconnect Vault**. (Instantly destroys session tokens in memory).
2. Close your open editor tabs (`Ctrl+K W`).
3. If you exported files to the lab desktop, permanently delete them (`Shift+Delete`).
4. Press `Win+V` to open Windows Clipboard and click **Clear All**.
5. Close VS Code completely.

---

## 🏠 When You Return Home

When you're back home and no longer need remote access:
* Unlock your home laptop with your Windows PIN.
* In the PowerShell / Command Prompt windows running the server and tunnel, press **`Ctrl + C`** (or close the terminal windows).
* The server and tunnel stop immediately.
