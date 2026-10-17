# Security Threat Model: Personal Encrypted Remote Vault (Read-Only Remote Client)

---

## 1. Overview & Trust Boundaries

The system is partitioned into three distinct trust zones:

```text
[ TRUST ZONE A: HOME LAPTOP ] (Trusted Host Storage)
   ├── Local Storage: Encrypted Blobs (*.enc) + vault.meta.json
   ├── Ingestion CLI: scripts/local-vault-ops.ps1 (Host-only write/import/init)
   ├── Node.js Daemon: 127.0.0.1:8743 (Fastify + In-Memory Master Key)
   └── Cloudflare Tunnel Client: Outbound TLS Proxy
                     ▲
                     │ (QUIC / TLS 1.3 Multiplexed Tunnel)
                     ▼
[ TRUST ZONE B: TRANSPORT & INTERMEDIARIES ] (Partially Trusted / Public)
   ├── Cloudflare Edge Proxy (*.trycloudflare.com)
   └── College Campus Wi-Fi (Untrusted Local Network)
                     ▲
                     │ (Outbound HTTPS / Port 443)
                     ▼
[ TRUST ZONE C: REMOTE CLIENT WORKSTATION ] (Untrusted / Shared Host)
   ├── Visual Studio Code (Extension Host Process)
   └── Personal Vault Extension (Read-Only Provider; In-Memory Session Token Only)
```

---

## 2. Threat Matrix (STRIDE Analysis)

| Threat Category | Attack Vector | Potential Impact | Implementation Defense | Residual Risk |
| :--- | :--- | :--- | :--- | :--- |
| **Spoofing (S)** | Attacker discovers `trycloudflare.com` tunnel URL and attempts unauthorized login. | Unauthorized file access. | Master password required. Timing-safe verifier check (`crypto.timingSafeEqual`). Token-bucket rate limiter locks IP for 15m after 5 failed attempts. | If master password has very low entropy (<8 chars), brute force might succeed before lockout. |
| **Tampering (T)** | Remote client or attacker attempts to alter, upload, overwrite, or delete vault files. | Data loss or malicious code injection into the vault. | **Read-Only Enforcement:** Extension provider is strictly read-only (`isReadonly: true`, `FilePermission.Readonly`). Server rejects all remote `PUT /write`, `POST /mkdir`, `DELETE /entry`, `POST /rename` with HTTP 403 `VAULT_READ_ONLY_MODE`. Host-side local replacements require explicit `?overwrite=true`. AES-256-GCM 128-bit authentication tags verify all reads. | None on vault files from remote access; attacker cannot mutate vault remotely. |
| **Repudiation (R)** | Malicious client attempts remote re-initialization or unauthorized vault reset. | Overwriting cryptographic salt/verifier to hijack vault. | Fastify rejects `POST /api/v1/auth/init` from any remote/proxied origin with HTTP 403 `FORBIDDEN_REMOTE_INIT`. Initialization is strictly host-only. | None for remote attackers. |
| **Information Disclosure (I)** | Sniffer eavesdrops on open college Wi-Fi network. | Interception of passwords or file contents. | Transport Layer Security (TLS 1.3) termination at Cloudflare edge; outbound tunnel encrypted over QUIC. Master password and file contents never traverse the local Wi-Fi in cleartext. | Compromised lab computer root CA certificates could allow institutional proxy interception. |
| **Denial of Service (D)** | Automated scanner floods daemon with huge payloads or invalid requests. | Home laptop CPU/disk starvation. | Fastify strict body limit (50MB maximum payload). `MAX_FILE_SIZE_BYTES` guard before disk writes. Rate-limiting middleware. | Tunnel bandwidth exhaustion by Cloudflare rate limits. |
| **Elevation of Privilege (E)** | Client submits `../../Windows/System32` path to read host system files. | Host filesystem compromise. | Strict `sanitizeVaultPath` virtual chrooting. Null bytes (`\0`), Windows drive letters (`C:`), UNC paths (`\\`), and NTFS Alternate Data Streams (`:`) are rejected. Segment-depth analysis blocks `..` escape. | None; path normalization guarantees confinement to vault root. |

---

## 3. Threat Scenarios & Specific Countermeasures

### 3.1 Remote Mutation Attempt (Read-Only Enforcement)
* **Vector:** A compromised remote client or an adversary using `curl` sends `PUT /api/v1/vault/write` or `DELETE /api/v1/vault/entry` over the tunnel.
* **Defense:**
  * Fastify evaluates `isRemoteOrProxiedRequest(request)` checking for `CF-Connecting-IP`, `X-Forwarded-For`, or non-loopback IP.
  * The server immediately returns HTTP 403 `VAULT_READ_ONLY_MODE`.
  * The VS Code extension exposes no mutation commands and throws `vscode.FileSystemError.NoPermissions` on any write attempts.

### 3.2 Ephemeral Session Token Compromise
* **Vector:** Attacker scrapes extension host memory or steals an active session token.
* **Defense:**
  * Session tokens are cryptographically random 256-bit strings generated via `crypto.randomBytes(32)`.
  * Sliding inactivity timer (default 15 minutes) automatically invalidates the token.
  * Absolute session lifetime (default 8 hours) forces complete re-authentication.
  * Tokens can be revoked instantly on demand via the `Lock` command or server shutdown.
  * A stolen token **never exposes the Master Encryption Key** or the master password.
  * Because the vault is read-only remotely, a stolen token can at most read authorized vault files before revocation; it can never modify or delete them.

### 3.3 Disk Theft / Offline Physical Access to Home Laptop
* **Vector:** Laptop is stolen while powered off.
* **Defense:**
  * All files in `~/.personal-vault/data/vault_files/` are AES-256-GCM encrypted envelopes.
  * The master password is never stored anywhere on disk.
  * `vault.meta.json` contains only a 256-bit scrypt salt and KDF verifier hash.
  * An attacker cannot decrypt any vault file without deriving the key through scrypt ($N=131072$).

---

## 4. Fundamental Shared-Computer Realities

> [!CAUTION]
> ### Why "Zero Traces" Cannot Be Guaranteed on Shared Computers
> Running on an untrusted or shared college computer has fundamental limitations:
>
> 1. **OS Memory Paging:** Windows or Linux may swap portions of VS Code's heap memory to `pagefile.sys` or swap partitions.
> 2. **VS Code Editor Buffers:** When a file is open in an active tab, its plaintext content resides in VS Code editor memory.
> 3. **Crash Dumps:** An unexpected OS or process crash could write process memory to mini-dump files.
> 4. **Administrative & Keylogger Visibility:** Lab computers equipped with monitoring agents or hardware keyloggers can intercept typed master passwords.
> 5. **Local Workspace Copies:** When exporting files locally to work on them, those plaintext files reside on the local shared disk until explicitly deleted.
> 6. **Clipboard History:** Operating system clipboard managers (e.g., Windows `Win+V`) retain copied text unless explicitly cleared.
>
> Refer to [SHARED_COMPUTER_GUIDE.md](file:///C:/Users/anmol/.gemini/antigravity-ide/scratch/personal-vault/docs/SHARED_COMPUTER_GUIDE.md) for the mandatory operational hygiene checklist to minimize exposure.

---

## 5. Security Verification Status

| Security Property | Status | Verification Method |
| :--- | :--- | :--- |
| **Read-Only Remote Enforcement** | **VERIFIED** | Unit & integration tests confirm 403 on remote `PUT`, `DELETE`, `POST /mkdir`, `POST /rename` |
| **Local Overwrite Guard** | **VERIFIED** | Host-side write to existing file without `?overwrite=true` returns 409 |
| **Remote Init Blocked** | **VERIFIED** | Proxied `POST /api/v1/auth/init` returns 403 `FORBIDDEN_REMOTE_INIT` |
| **Loopback Binding** | **VERIFIED** | Server binds to `127.0.0.1:8743` |
| **Timing-Safe Auth** | **VERIFIED** | Verifier validation uses `crypto.timingSafeEqual` |
| **Rate-Limiting Lockout** | **VERIFIED** | 5 failed attempts trigger 429 lockout |
| **Path Traversal Resistance** | **VERIFIED** | `../`, null bytes, Windows drive letters, UNC paths, and ADS streams rejected |
| **Ciphertext at Rest** | **VERIFIED** | Envelopes contain non-plaintext AES-256-GCM ciphertext + 16-byte tag + 12-byte IV |
| **Live Internet Tunnel** | **UNVERIFIED LIVE** | `cloudflared` binary not installed in local environment; simulated via header injection tests |

