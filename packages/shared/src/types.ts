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

// Authentication DTOs
export interface LoginRequest {
  password: string;
}

export interface LoginResponse {
  token: string;
  expiresAt: number;      // Unix ms timestamp
  idleTimeoutMs: number;
}

export interface SessionStatusResponse {
  authenticated: boolean;
  vaultInitialized: boolean;
  expiresAt?: number;
  remainingIdleMs?: number;
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
  verifierHex: string;    // Verification hash to validate password without storing key
  createdAt: string;
  updatedAt: string;
}
