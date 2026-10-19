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
      return this.sessionStore.createSession('host');
    } finally {
      masterKey.fill(0);
      verifier.fill(0);
    }
  }

  /**
   * Authenticates against the vault with master password (Host) or viewer password (Viewer).
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

    // 3. Try Host Master Password first
    const { masterKey: hostMasterKey, verifier: candidateVerifier } = await deriveKeys(password, salt);
    try {
      const isHostMatch =
        storedVerifier.length === candidateVerifier.length &&
        crypto.timingSafeEqual(storedVerifier, candidateVerifier);

      if (isHostMatch) {
        this.rateLimiter.recordSuccess(clientIdentifier);
        this.cryptoEngine.setMasterKey(hostMasterKey);
        return this.sessionStore.createSession('host');
      }
    } finally {
      candidateVerifier.fill(0);
    }

    // 4. Try Viewer Password (if configured)
    if (metadata.viewer) {
      const vSalt = Buffer.from(metadata.viewer.saltHex, 'hex');
      const vStoredVerifier = Buffer.from(metadata.viewer.verifierHex, 'hex');
      const { masterKey: viewerDerivedKey, verifier: vCandidateVerifier } = await deriveKeys(password, vSalt);

      try {
        const isViewerMatch =
          vStoredVerifier.length === vCandidateVerifier.length &&
          crypto.timingSafeEqual(vStoredVerifier, vCandidateVerifier);

        if (isViewerMatch) {
          try {
            const iv = Buffer.from(metadata.viewer.ivHex, 'hex');
            const tag = Buffer.from(metadata.viewer.tagHex, 'hex');
            const encryptedVaultKey = Buffer.from(metadata.viewer.encryptedVaultKeyHex, 'hex');

            const decipher = crypto.createDecipheriv('aes-256-gcm', viewerDerivedKey, iv);
            decipher.setAuthTag(tag);
            const decryptedVaultKey = Buffer.concat([
              decipher.update(encryptedVaultKey),
              decipher.final(),
            ]);

            this.rateLimiter.recordSuccess(clientIdentifier);
            this.cryptoEngine.setMasterKey(decryptedVaultKey);
            return this.sessionStore.createSession('viewer');
          } catch {
            // Decryption failure
          }
        }
      } finally {
        viewerDerivedKey.fill(0);
        vCandidateVerifier.fill(0);
      }
    }

    // 5. Neither matched
    this.rateLimiter.recordFailure(clientIdentifier);
    throw new VaultError(
      VaultErrorCode.INVALID_CREDENTIALS,
      'Incorrect password. Please verify your Master Password or Viewer Password.',
      401
    );
  }

  /**
   * Sets or updates the read-only Viewer Password for lab access.
   */
  public async setViewerPassword(hostPassword: string, viewerPassword: string): Promise<void> {
    const rawMeta = await fs.readFile(this.metaPath, 'utf8');
    const metadata: VaultMetadata = JSON.parse(rawMeta);

    const salt = Buffer.from(metadata.kdf.saltHex, 'hex');
    const storedVerifier = Buffer.from(metadata.verifierHex, 'hex');

    const { masterKey: hostMasterKey, verifier: hostCandidateVerifier } = await deriveKeys(hostPassword, salt);
    try {
      const isHostMatch =
        storedVerifier.length === hostCandidateVerifier.length &&
        crypto.timingSafeEqual(storedVerifier, hostCandidateVerifier);

      if (!isHostMatch) {
        throw new VaultError(VaultErrorCode.INVALID_CREDENTIALS, 'Incorrect host master password.', 401);
      }

      if (!viewerPassword || viewerPassword.length < 4) {
        throw new VaultError(VaultErrorCode.INVALID_CREDENTIALS, 'Viewer password must be at least 4 characters.', 400);
      }

      const viewerSalt = generateSalt();
      const { masterKey: viewerDerivedKey, verifier: viewerVerifier } = await deriveKeys(viewerPassword, viewerSalt);

      try {
        const iv = crypto.randomBytes(12);
        const cipher = crypto.createCipheriv('aes-256-gcm', viewerDerivedKey, iv);
        const encryptedVaultKey = Buffer.concat([
          cipher.update(hostMasterKey),
          cipher.final(),
        ]);
        const tag = cipher.getAuthTag();

        metadata.viewer = {
          saltHex: viewerSalt.toString('hex'),
          verifierHex: viewerVerifier.toString('hex'),
          encryptedVaultKeyHex: encryptedVaultKey.toString('hex'),
          ivHex: iv.toString('hex'),
          tagHex: tag.toString('hex'),
          createdAt: new Date().toISOString(),
        };
        metadata.updatedAt = new Date().toISOString();

        const tempPath = path.join(this.storagePath, `.${META_FILENAME}.tmp`);
        await fs.writeFile(tempPath, JSON.stringify(metadata, null, 2), { encoding: 'utf8', mode: 0o600 });
        await fs.rename(tempPath, this.metaPath);
      } finally {
        viewerDerivedKey.fill(0);
        viewerVerifier.fill(0);
      }
    } finally {
      hostMasterKey.fill(0);
      hostCandidateVerifier.fill(0);
    }
  }

  /**
   * Revokes the Viewer Password.
   */
  public async removeViewerPassword(hostPassword: string): Promise<void> {
    const rawMeta = await fs.readFile(this.metaPath, 'utf8');
    const metadata: VaultMetadata = JSON.parse(rawMeta);

    const salt = Buffer.from(metadata.kdf.saltHex, 'hex');
    const storedVerifier = Buffer.from(metadata.verifierHex, 'hex');

    const { masterKey: hostMasterKey, verifier: hostCandidateVerifier } = await deriveKeys(hostPassword, salt);
    try {
      const isHostMatch =
        storedVerifier.length === hostCandidateVerifier.length &&
        crypto.timingSafeEqual(storedVerifier, hostCandidateVerifier);

      if (!isHostMatch) {
        throw new VaultError(VaultErrorCode.INVALID_CREDENTIALS, 'Incorrect host master password.', 401);
      }

      delete metadata.viewer;
      metadata.updatedAt = new Date().toISOString();

      const tempPath = path.join(this.storagePath, `.${META_FILENAME}.tmp`);
      await fs.writeFile(tempPath, JSON.stringify(metadata, null, 2), { encoding: 'utf8', mode: 0o600 });
      await fs.rename(tempPath, this.metaPath);
    } finally {
      hostMasterKey.fill(0);
      hostCandidateVerifier.fill(0);
    }
  }

  /**
   * Checks whether a Viewer Password is currently active.
   */
  public async hasViewerPassword(): Promise<boolean> {
    try {
      const rawMeta = await fs.readFile(this.metaPath, 'utf8');
      const metadata: VaultMetadata = JSON.parse(rawMeta);
      return Boolean(metadata.viewer);
    } catch {
      return false;
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
