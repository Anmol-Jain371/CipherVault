import path from 'node:path';
import { VaultError, VaultErrorCode } from './errors.js';

/**
 * Validates and normalizes relative vault paths.
 * Enforces a strict virtual chroot:
 * 1. Must start with '/'
 * 2. Cannot contain null bytes (\0)
 * 3. Cannot contain Windows drive letters (C:) or UNC prefixes (\\)
 * 4. Must not escape the root hierarchy (prevents ../ and /../../)
 * 5. Replaces backslashes with forward slashes for universal cross-platform consistency.
 */
export function sanitizeVaultPath(rawPath: string): string {
  if (typeof rawPath !== 'string' || rawPath.trim() === '') {
    throw new VaultError(
      VaultErrorCode.INVALID_PATH,
      'Vault path must be a non-empty string',
      400
    );
  }

  // Reject null byte injection
  if (rawPath.includes('\0')) {
    throw new VaultError(
      VaultErrorCode.PATH_TRAVERSAL_DETECTED,
      'Null bytes are strictly prohibited in vault paths',
      400
    );
  }

  // Reject Windows drive letters, UNC paths, and NTFS Alternate Data Streams (colon)
  if (rawPath.includes(':') || rawPath.startsWith('\\\\')) {
    throw new VaultError(
      VaultErrorCode.PATH_TRAVERSAL_DETECTED,
      'Colons (NTFS Alternate Data Streams / Drive letters) and UNC network paths are not permitted in vault paths',
      400
    );
  }

  // Reject URL-encoded traversal patterns
  if (/%2e|%2f|%5c/i.test(rawPath)) {
    throw new VaultError(
      VaultErrorCode.PATH_TRAVERSAL_DETECTED,
      'URL-encoded path traversal sequences are not permitted',
      400
    );
  }

  // Standardize backslashes to forward slashes
  const forwardSlashed = rawPath.replace(/\\/g, '/');

  // Segment-depth traversal check: verify that no sequence of '..' segments ever escapes the vault root
  const segments = forwardSlashed.split('/').filter(Boolean);
  let depth = 0;
  for (const seg of segments) {
    if (seg === '.') continue;
    if (seg === '..') {
      depth--;
      if (depth < 0) {
        throw new VaultError(
          VaultErrorCode.PATH_TRAVERSAL_DETECTED,
          `Path traversal attempt detected: "${rawPath}"`,
          403
        );
      }
    } else {
      depth++;
    }
  }

  // Ensure leading slash and normalize
  const withLeading = forwardSlashed.startsWith('/') ? forwardSlashed : '/' + forwardSlashed;
  const normalized = path.posix.normalize(withLeading);

  return normalized;
}

/**
 * Validates master password complexity.
 * Master password must have sufficient entropy (minimum 12 chars).
 */
export function validateMasterPassword(password: string): { valid: boolean; reason?: string } {
  if (typeof password !== 'string') {
    return { valid: false, reason: 'Password must be a string' };
  }
  if (password.length < 12) {
    return { valid: false, reason: 'Master password must be at least 12 characters long' };
  }
  return { valid: true };
}
