# REST API Specification: Personal Encrypted Remote Vault

The Personal Vault Daemon exposes a secure HTTP REST API on `127.0.0.1:8743` (proxied over Cloudflare Quick Tunnel).

> [!IMPORTANT]
> **Read-Only Remote Access Enforcement:**
> When accessed remotely (detected via `trustProxy`, `CF-Connecting-IP`, `X-Forwarded-For`, or non-loopback IP), the API strictly permits **read-only operations** (`GET`). All mutation endpoints (`PUT`, `POST /mkdir`, `DELETE`, `POST /rename`, `POST /auth/init`) return `403 Forbidden` (`VAULT_READ_ONLY_MODE` or `FORBIDDEN_REMOTE_INIT`).

---

## 1. Authentication Endpoints

### 1.1 Check Status
* **Endpoint:** `GET /api/v1/auth/status`
* **Auth Required:** No (Optional Bearer token to check if current token is valid)
* **Response `200 OK`:**
  ```json
  {
    "vaultInitialized": true,
    "authenticated": true,
    "expiresAt": 1792400000000
  }
  ```

### 1.2 Initialize Vault (Host-Only)
* **Endpoint:** `POST /api/v1/auth/init`
* **Auth Required:** No (Only accepted on local loopback when `vaultInitialized` is `false`)
* **Remote Behavior:** Returns `403 Forbidden` (`FORBIDDEN_REMOTE_INIT`) if request contains proxy headers or originates remotely.
* **Request Body:**
  ```json
  {
    "password": "my-secure-master-password"
  }
  ```
* **Response `200 OK`:**
  ```json
  {
    "token": "a1b2c3d4e5f6... (256-bit hex)",
    "expiresAt": 1792400000000,
    "idleTimeoutMs": 900000
  }
  ```

### 1.3 Login / Unlock Vault
* **Endpoint:** `POST /api/v1/auth/login`
* **Auth Required:** No
* **Request Body:**
  ```json
  {
    "password": "my-secure-master-password"
  }
  ```
* **Response `200 OK`:** Returns session token.
* **Response `401 Unauthorized`:** Incorrect password.
* **Response `429 Too Many Requests`:** Rate limited (after 5 failed attempts within 15 minutes).

### 1.4 Lock / Terminate Session
* **Endpoint:** `POST /api/v1/auth/lock`
* **Auth Required:** Yes (`Authorization: Bearer <token>`)
* **Response `200 OK`:** Revokes active sessions and clears master key from daemon memory.

---

## 2. Vault File Operations

All file endpoints require `Authorization: Bearer <token>`.

### 2.1 Stat Entry
* **Endpoint:** `GET /api/v1/vault/stat?path=/notes/todo.txt`
* **Response `200 OK`:**
  * Header: `ETag: "hash"`
  * Body:
    ```json
    {
      "path": "/notes/todo.txt",
      "type": "file",
      "size": 1024,
      "ctime": 1792400000000,
      "mtime": 1792400000000,
      "etag": "\"sha256-hash\""
    }
    ```

### 2.2 List Directory
* **Endpoint:** `GET /api/v1/vault/list?path=/notes`
* **Response `200 OK`:**
  ```json
  {
    "path": "/notes",
    "entries": [
      { "name": "todo.txt", "type": "file", "path": "/notes/todo.txt" },
      { "name": "projects", "type": "directory", "path": "/notes/projects" }
    ]
  }
  ```

### 2.3 Read Decrypted File
* **Endpoint:** `GET /api/v1/vault/read?path=/notes/todo.txt`
* **Response `200 OK`:**
  * Headers: `Content-Type: application/octet-stream`, `ETag: "hash"`
  * Body: Raw decrypted bytes.

### 2.4 Write Encrypted File (Host-Only)
* **Endpoint:** `PUT /api/v1/vault/write?path=/notes/todo.txt&overwrite=true`
* **Remote Behavior:** Returns `403 Forbidden` (`VAULT_READ_ONLY_MODE`) for all remote or proxied requests.
* **Host Overwrite Requirement:** If the target file already exists, `overwrite=true` must be passed; otherwise returns `409 Conflict` (`VAULT_ALREADY_EXISTS`).
* **Headers:**
  * `Content-Type: application/octet-stream`
  * `If-Match: "last-known-etag"` (Optional concurrency guard)
* **Body:** Raw plaintext bytes.
* **Response `200 OK`:** Updated `VaultFileStat` with new `ETag`.

### 2.5 Create Directory (Host-Only)
* **Endpoint:** `POST /api/v1/vault/mkdir`
* **Remote Behavior:** Returns `403 Forbidden` (`VAULT_READ_ONLY_MODE`) for remote/proxied requests.
* **Request Body:** `{ "path": "/notes/new_folder" }`
* **Response `200 OK`:** `{ "success": true, "path": "/notes/new_folder" }`

### 2.6 Delete Entry (Host-Only)
* **Endpoint:** `DELETE /api/v1/vault/entry?path=/notes/todo.txt&recursive=false`
* **Remote Behavior:** Returns `403 Forbidden` (`VAULT_READ_ONLY_MODE`) for remote/proxied requests.
* **Response `200 OK`:** `{ "success": true, "path": "/notes/todo.txt" }`

### 2.7 Rename Entry (Host-Only)
* **Endpoint:** `POST /api/v1/vault/rename`
* **Remote Behavior:** Returns `403 Forbidden` (`VAULT_READ_ONLY_MODE`) for remote/proxied requests.
* **Request Body:** `{ "oldPath": "/old.txt", "newPath": "/new.txt" }`
* **Response `200 OK`:** Re-encrypts file under new canonical AAD and removes old file.

