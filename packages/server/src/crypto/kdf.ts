import crypto from 'node:crypto';
import { SCRYPT_PARAMS, KEY_LENGTH_BYTES, SALT_LENGTH_BYTES } from '@personal-vault/shared';

export interface DerivedVaultKeys {
  masterKey: Buffer;  // 32-byte key for AES-256-GCM data encryption
  verifier: Buffer;   // 32-byte verifier for constant-time password authentication
}

/**
 * Derives both the Master Encryption Key and the Authentication Verifier
 * from a master password and salt using Node.js built-in scrypt.
 */
export function deriveKeys(
  password: string,
  salt: Buffer
): Promise<DerivedVaultKeys> {
  if (salt.length !== SALT_LENGTH_BYTES) {
    throw new Error(`Salt must be exactly ${SALT_LENGTH_BYTES} bytes`);
  }

  return new Promise((resolve, reject) => {
    crypto.scrypt(
      password,
      salt,
      KEY_LENGTH_BYTES * 2,
      {
        N: SCRYPT_PARAMS.N,
        r: SCRYPT_PARAMS.r,
        p: SCRYPT_PARAMS.p,
        maxmem: SCRYPT_PARAMS.maxmem,
      },
      (err, derived) => {
        if (err) return reject(err);
        const masterKey = Buffer.from(derived.subarray(0, KEY_LENGTH_BYTES));
        const verifier = Buffer.from(derived.subarray(KEY_LENGTH_BYTES, KEY_LENGTH_BYTES * 2));
        derived.fill(0);
        resolve({ masterKey, verifier });
      }
    );
  });
}

/**
 * Generates a cryptographically secure random salt.
 */
export function generateSalt(): Buffer {
  return crypto.randomBytes(SALT_LENGTH_BYTES);
}
