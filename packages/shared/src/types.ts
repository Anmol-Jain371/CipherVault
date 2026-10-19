/**
 * Shared Type Definitions and Data Transfer Objects (DTOs)
 */

export type FileType = 'file' | 'directory';

export interface VaultFileStat {
  path: string;           // Canonical relative path e.g. "/notes/todo.txt"
  type: FileType;
  size: number;           // Unencrypted payload size in bytes
  ctime: number;          // Creation time (unix ms timestamp)
  mtime: number;          // Modification time (unix ms timestamp)
  etag: string;           // Strong ETag (e.g. SHA-256 of encrypted envelope or version)
}

export interface VaultDirectoryEntry {
  name: string;           // Base filename or folder name e.g. "todo.txt"
  type: FileType;
  path: string;           // Full relative path e.g. "/notes/todo.txt"
  size?: number;
  mtime?: number;
}

export interface VaultDirectoryListingResponse {
  path: string;
  entries: VaultDirectoryEntry[];
}

// User Roles
export type UserRole = 'host' | 'viewer';

// Authentication DTOs
export interface LoginRequest {
  password: string;
}

export interface LoginResponse {
  token: string;
  role: UserRole;
  expiresAt: number;      // Unix ms timestamp
  idleTimeoutMs: number;
}

export interface SessionStatusResponse {
  authenticated: boolean;
  role?: UserRole;
  vaultInitialized: boolean;
  expiresAt?: number;
  remainingIdleMs?: number;
}

// Viewer Key Configuration (Enables read-only access for lab students/viewers)
export interface ViewerKeyConfig {
  saltHex: string;
  verifierHex: string;
  encryptedVaultKeyHex: string; // vaultKey encrypted with AES-256-GCM using derived viewer key
  ivHex: string;
  tagHex: string;
  createdAt: string;
}

// Operation Requests
export interface CreateDirectoryRequest {
  path: string;
}

export interface RenameRequest {
  oldPath: string;
  newPath: string;
}

export interface DeleteRequest {
  path: string;
  recursive?: boolean;
}

export interface SetViewerPasswordRequest {
  hostPassword?: string;
  viewerPassword: string;
}

// Vault Initialization & Metadata
export interface VaultMetadata {
  version: number;
  kdf: {
    algorithm: 'scrypt';
    params: {
      N: number;
      r: number;
      p: number;
    };
    saltHex: string;
  };
  verifierHex: string;    // Host master password verifier
  viewer?: ViewerKeyConfig; // Configured viewer credentials for read-only access
  createdAt: string;
  updatedAt: string;
}
