import crypto from 'node:crypto';
import {
  CRYPTO_ALGORITHM,
  NONCE_LENGTH_BYTES,
  KEY_LENGTH_BYTES,
  VaultError,
  VaultErrorCode,
} from '@personal-vault/shared';
import { packEnvelope, unpackEnvelope } from './envelope.js';

export interface EncryptedResult {
  envelope: Buffer;
  etag: string;
}

export class CryptoEngine {
  private masterKey: Buffer | null = null;

  /**
   * Sets or clears the active unlocked master key in daemon memory.
   */
  public setMasterKey(key: Buffer | null): void {
    if (key !== null && key.length !== KEY_LENGTH_BYTES) {
      throw new VaultError(
        VaultErrorCode.INTERNAL_ERROR,
        `Master key must be exactly ${KEY_LENGTH_BYTES} bytes`
      );
    }
    if (this.masterKey) {
      this.masterKey.fill(0);
    }
    this.masterKey = key ? Buffer.from(key) : null;
  }

  public isUnlocked(): boolean {
    return this.masterKey !== null;
  }

  public lock(): void {
    if (this.masterKey) {
      // Overwrite master key memory with zeroes before releasing reference
      this.masterKey.fill(0);
      this.masterKey = null;
    }
  }

  /**
   * Encrypts plaintext buffer using AES-256-GCM with a fresh random 96-bit nonce.
   * Binds the canonical vault relative path as Additional Authenticated Data (AAD)
   * to strictly prohibit ciphertext-swap attacks between files.
   */
  public encrypt(plaintext: Buffer, canonicalPath: string): EncryptedResult {
    if (!this.masterKey) {
      throw new VaultError(VaultErrorCode.VAULT_LOCKED, 'Vault is locked. Cannot encrypt.', 423);
    }

    // Generate fresh cryptographically secure random 12-byte nonce
    const iv = crypto.randomBytes(NONCE_LENGTH_BYTES);

    const cipher = crypto.createCipheriv(CRYPTO_ALGORITHM, this.masterKey, iv);

    // Bind canonical vault path into AAD
    cipher.setAAD(Buffer.from(canonicalPath, 'utf8'));

    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const authTag = cipher.getAuthTag();

    const envelope = packEnvelope(iv, authTag, ciphertext);
    const etag = this.calculateEtag(envelope);

    return { envelope, etag };
  }

  /**
   * Decrypts an encrypted binary envelope, verifying magic, version, and the 128-bit
   * authentication tag against the canonical path AAD.
   */
  public decrypt(envelopeBuffer: Buffer, canonicalPath: string): Buffer {
    if (!this.masterKey) {
      throw new VaultError(VaultErrorCode.VAULT_LOCKED, 'Vault is locked. Cannot decrypt.', 423);
    }

    const { iv, authTag, ciphertext } = unpackEnvelope(envelopeBuffer);

    try {
      const decipher = crypto.createDecipheriv(CRYPTO_ALGORITHM, this.masterKey, iv);

      // Verify AAD path binding
      decipher.setAAD(Buffer.from(canonicalPath, 'utf8'));
      decipher.setAuthTag(authTag);

      const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
      return plaintext;
    } catch (err: unknown) {
      throw new VaultError(
        VaultErrorCode.INTEGRITY_CHECK_FAILED,
        `Cryptographic integrity verification failed for "${canonicalPath}". Ciphertext or path metadata has been tampered with or corrupted.`,
        400,
        { originalError: String(err) }
      );
    }
  }

  /**
   * Generates a strong ETag based on the SHA-256 hash of the encrypted envelope.
   */
  public calculateEtag(envelopeBuffer: Buffer): string {
    const hash = crypto.createHash('sha256').update(envelopeBuffer).digest('hex');
    return `"${hash}"`;
  }
}
