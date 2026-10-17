import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {
  VaultMetadata,
  VaultError,
  VaultErrorCode,
  validateMasterPassword,
  SCRYPT_PARAMS,
} from '@personal-vault/shared';
import { deriveKeys, generateSalt } from '../crypto/kdf.js';
import { CryptoEngine } from '../crypto/crypto.engine.js';
import { RateLimiter } from './rate-limiter.js';
import { SessionStore, ActiveSession } from './session-store.js';

export const META_FILENAME = 'vault.meta.json';

export class AuthService {
  private metaPath: string;

  constructor(
    private storagePath: string,
    private cryptoEngine: CryptoEngine,
    private rateLimiter: RateLimiter,
    private sessionStore: SessionStore
  ) {
    this.metaPath = path.join(storagePath, META_FILENAME);
  }

  /**
   * Checks whether the vault has been initialized on disk.
   */
  public async isInitialized(): Promise<boolean> {
    try {
      await fs.access(this.metaPath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Initializes a brand-new vault with a master password.
   * Generates a 256-bit salt, derives KDF verifier & master key, and writes vault.meta.json.
   */
  public async initializeVault(password: string): Promise<ActiveSession> {
    const initialized = await this.isInitialized();
    if (initialized) {
      throw new VaultError(
        VaultErrorCode.ALREADY_EXISTS,
        'Vault is already initialized. Cannot re-initialize.',
        400
      );
    }

    const { valid, reason } = validateMasterPassword(password);
    if (!valid) {
      throw new VaultError(VaultErrorCode.INVALID_CREDENTIALS, reason || 'Invalid password', 400);
    }

    // Ensure storage directory exists
    await fs.mkdir(this.storagePath, { recursive: true });

    const salt = generateSalt();
    const { masterKey, verifier } = await deriveKeys(password, salt);
    try {
      const metadata: VaultMetadata = {
        version: 1,
        kdf: {
          algorithm: 'scrypt',
          params: {
            N: SCRYPT_PARAMS.N,
            r: SCRYPT_PARAMS.r,
            p: SCRYPT_PARAMS.p,
          },
          saltHex: salt.toString('hex'),
        },
        verifierHex: verifier.toString('hex'),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      // Write metadata atomically
      const tempPath = path.join(this.storagePath, `.${META_FILENAME}.tmp`);
      await fs.writeFile(tempPath, JSON.stringify(metadata, null, 2), { encoding: 'utf8', mode: 0o600 });
      await fs.rename(tempPath, this.metaPath);

      // Set master key in memory and create active session
      this.cryptoEngine.setMasterKey(masterKey);
      return this.sessionStore.createSession();
    } finally {
      masterKey.fill(0);
      verifier.fill(0);
    }
  }

  /**
   * Authenticates against the vault with master password.
   */
  public async login(password: string, clientIdentifier: string): Promise<ActiveSession> {
    // 1. Rate limiter check
    this.rateLimiter.checkAllowed(clientIdentifier);

    const initialized = await this.isInitialized();
    if (!initialized) {
      throw new VaultError(
        VaultErrorCode.VAULT_NOT_INITIALIZED,
        'Vault is not initialized. Please initialize before logging in.',
        400
      );
    }

    // 2. Read metadata
    const rawMeta = await fs.readFile(this.metaPath, 'utf8');
    const metadata: VaultMetadata = JSON.parse(rawMeta);

    const salt = Buffer.from(metadata.kdf.saltHex, 'hex');
    const storedVerifier = Buffer.from(metadata.verifierHex, 'hex');

    // 3. Derive keys from candidate password
    const { masterKey, verifier: candidateVerifier } = await deriveKeys(password, salt);
    try {
      // 4. Constant-time timing-safe verifier comparison
      const isMatch =
        storedVerifier.length === candidateVerifier.length &&
        crypto.timingSafeEqual(storedVerifier, candidateVerifier);

      if (!isMatch) {
        this.rateLimiter.recordFailure(clientIdentifier);
        throw new VaultError(
          VaultErrorCode.INVALID_CREDENTIALS,
          'Incorrect master password',
          401
        );
      }

      // 5. Success: reset rate limiter, unlock crypto engine, issue session token
      this.rateLimiter.recordSuccess(clientIdentifier);
      this.cryptoEngine.setMasterKey(masterKey);
      return this.sessionStore.createSession();
    } finally {
      masterKey.fill(0);
      candidateVerifier.fill(0);
    }
  }

  /**
   * Returns configured session idle timeout in milliseconds.
   */
  public getIdleTimeoutMs(): number {
    return this.sessionStore.getIdleTimeoutMs();
  }

  /**
   * Revokes a session and locks vault if no active sessions remain or on explicit lock.
   */
  public logout(token: string): void {
    this.sessionStore.revoke(token);
    if (this.sessionStore.getActiveCount() === 0) {
      this.cryptoEngine.lock();
    }
  }

  /**
   * Explicitly locks the entire vault and purges all sessions and master key memory.
   */
  public lockAll(): void {
    this.sessionStore.revokeAll();
    this.cryptoEngine.lock();
  }

  /**
   * Verifies an active session token.
   */
  public authenticateToken(token: string): ActiveSession {
    if (!this.cryptoEngine.isUnlocked()) {
      throw new VaultError(VaultErrorCode.VAULT_LOCKED, 'Vault is locked. Re-authentication required.', 423);
    }
    return this.sessionStore.validateAndTouch(token);
  }
}
