/**
 * Core constants, limits, and protocol conventions for Personal Encrypted Remote Vault
 */

export const PROTOCOL_VERSION = '1.0.0';
export const URI_SCHEME = 'personal-vault';

// Cryptographic standards
export const CRYPTO_ALGORITHM = 'aes-256-gcm';
export const NONCE_LENGTH_BYTES = 12; // 96-bit IV recommended by NIST SP 800-38D
export const AUTH_TAG_LENGTH_BYTES = 16; // 128-bit authentication tag
export const KEY_LENGTH_BYTES = 32; // 256-bit encryption key
export const SALT_LENGTH_BYTES = 32; // 256-bit salt for KDF
export const ENVELOPE_MAGIC = Buffer.from('PVLT', 'utf8'); // 4-byte header magic identifier
export const ENVELOPE_FORMAT_VERSION = 1;

// scrypt KDF parameters (balanced for defensive security on modern CPUs without hanging)
export const SCRYPT_PARAMS = {
  N: 131072, // 2^17 CPU/memory cost
  r: 8,      // block size
  p: 1,      // parallelization
  maxmem: 256 * 1024 * 1024, // 256MB max memory limit
} as const;

// Session and network limits
export const DEFAULT_PORT = 8743;
export const SESSION_IDLE_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes of inactivity
export const SESSION_MAX_LIFETIME_MS = 8 * 60 * 60 * 1000; // 8 hours absolute max
export const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024; // 50MB per file safety limit for initial version
export const MAX_AUTH_ATTEMPTS = 5; // Lockout threshold
export const AUTH_LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15-minute lockout

// HTTP Headers
export const HEADER_ETAG = 'etag';
export const HEADER_IF_MATCH = 'if-match';
export const HEADER_AUTH = 'authorization';
