import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {
  sanitizeVaultPath,
  VaultError,
  VaultErrorCode,
  VaultFileStat,
  VaultDirectoryEntry,
  MAX_FILE_SIZE_BYTES,
} from '@personal-vault/shared';
import { CryptoEngine } from '../crypto/crypto.engine.js';
import { HEADER_LENGTH_BYTES } from '../crypto/envelope.js';

export const FILE_ENC_EXTENSION = '.enc';

export class StorageEngine {
  private filesRoot: string;

  constructor(
    storagePath: string,
    private cryptoEngine: CryptoEngine
  ) {
    this.filesRoot = path.join(storagePath, 'vault_files');
  }

  public async ensureReady(): Promise<void> {
    await fs.mkdir(this.filesRoot, { recursive: true });
  }

  /**
   * Translates a canonical vault path (e.g. "/notes/todo.txt") to physical disk path.
   */
  private resolvePhysicalPath(canonicalPath: string, isDirectory: boolean): string {
    const sanitized = sanitizeVaultPath(canonicalPath);
    // Remove leading slash to join safely with filesRoot
    const relative = sanitized.slice(1);
    const resolved = path.join(this.filesRoot, relative);

    // Verify resolved path is strictly contained within filesRoot
    if (resolved !== this.filesRoot && !resolved.startsWith(this.filesRoot + path.sep)) {
      throw new VaultError(
        VaultErrorCode.PATH_TRAVERSAL_DETECTED,
        `Path traversal escape detected: "${canonicalPath}"`,
        403
      );
    }

    if (isDirectory || sanitized === '/') {
      return resolved;
    }

    return resolved + FILE_ENC_EXTENSION;
  }

  /**
   * Stat a file or directory in the vault.
   */
  public async stat(canonicalPath: string): Promise<VaultFileStat> {
    const sanitized = sanitizeVaultPath(canonicalPath);
    if (sanitized === '/') {
      const stats = await fs.stat(this.filesRoot);
      return {
        path: '/',
        type: 'directory',
        size: 0,
        ctime: stats.birthtimeMs,
        mtime: stats.mtimeMs,
        etag: '"dir-root"',
      };
    }

    // Check directory first
    const dirPhysical = this.resolvePhysicalPath(sanitized, true);
    try {
      const dStats = await fs.stat(dirPhysical);
      if (dStats.isDirectory()) {
        return {
          path: sanitized,
          type: 'directory',
          size: 0,
          ctime: dStats.birthtimeMs,
          mtime: dStats.mtimeMs,
          etag: `"dir-${dStats.mtimeMs}"`,
        };
      }
    } catch {
      // Not a directory, try file
    }

    // Check file
    const filePhysical = this.resolvePhysicalPath(sanitized, false);
    try {
      const fStats = await fs.stat(filePhysical);
      if (fStats.isFile()) {
        const envelope = await fs.readFile(filePhysical);
        const etag = this.cryptoEngine.calculateEtag(envelope);
        const unencryptedSize = Math.max(0, envelope.length - HEADER_LENGTH_BYTES);
        return {
          path: sanitized,
          type: 'file',
          size: unencryptedSize,
          ctime: fStats.birthtimeMs,
          mtime: fStats.mtimeMs,
          etag,
        };
      }
    } catch {
      // Neither directory nor file found
    }

    throw new VaultError(
      VaultErrorCode.NOT_FOUND,
      `Vault entry not found: "${sanitized}"`,
      404
    );
  }

  /**
   * Writes a file to the vault with atomic temporary-write and rename.
   * Performs optimistic concurrency check if expectedEtag is provided.
   */
  public async writeFile(
    canonicalPath: string,
    plaintext: Buffer,
    expectedEtag?: string
  ): Promise<{ etag: string; stat: VaultFileStat }> {
    const sanitized = sanitizeVaultPath(canonicalPath);
    if (sanitized === '/') {
      throw new VaultError(VaultErrorCode.IS_DIRECTORY, 'Cannot write file to root directory', 400);
    }

    if (plaintext.length > MAX_FILE_SIZE_BYTES) {
      throw new VaultError(
        VaultErrorCode.FILE_TOO_LARGE,
        `File exceeds maximum permitted size of ${MAX_FILE_SIZE_BYTES / (1024 * 1024)}MB`,
        413
      );
    }

    const physicalPath = this.resolvePhysicalPath(sanitized, false);
    const parentDir = path.dirname(physicalPath);

    // Concurrency check (If-Match)
    if (expectedEtag) {
      try {
        const existingEnvelope = await fs.readFile(physicalPath);
        const currentEtag = this.cryptoEngine.calculateEtag(existingEnvelope);
        if (currentEtag !== expectedEtag) {
          throw new VaultError(
            VaultErrorCode.CONCURRENCY_CONFLICT,
            `Precondition Failed: File was modified concurrently. Current ETag ${currentEtag} does not match ${expectedEtag}`,
            412
          );
        }
      } catch (err: unknown) {
        if (err instanceof VaultError) throw err;
        // If file didn't exist, and expectedEtag was given, that's a conflict
        throw new VaultError(
          VaultErrorCode.CONCURRENCY_CONFLICT,
          `Precondition Failed: File does not exist to match ${expectedEtag}`,
          412
        );
      }
    }

    // Ensure parent directory exists
    await fs.mkdir(parentDir, { recursive: true });

    // Encrypt payload with AES-256-GCM and bind canonical path to AAD
    const { envelope, etag } = this.cryptoEngine.encrypt(plaintext, sanitized);

    // Write to temporary file in the same directory for atomic rename
    const tempFile = path.join(parentDir, `.${crypto.randomUUID()}.tmp`);
    const fileHandle = await fs.open(tempFile, 'w', 0o600);
    try {
      await fileHandle.writeFile(envelope);
      await fileHandle.sync(); // Force disk flush
    } finally {
      await fileHandle.close();
    }

    // Atomic replacement with error cleanup
    try {
      await fs.rename(tempFile, physicalPath);
    } catch (renameErr) {
      await fs.unlink(tempFile).catch(() => {});
      throw renameErr;
    }

    const fStats = await fs.stat(physicalPath);
    const stat: VaultFileStat = {
      path: sanitized,
      type: 'file',
      size: plaintext.length,
      ctime: fStats.birthtimeMs,
      mtime: fStats.mtimeMs,
      etag,
    };

    return { etag, stat };
  }

  /**
   * Reads and decrypts a file from the vault.
   */
  public async readFile(canonicalPath: string): Promise<{ plaintext: Buffer; etag: string; stat: VaultFileStat }> {
    const sanitized = sanitizeVaultPath(canonicalPath);
    const physicalPath = this.resolvePhysicalPath(sanitized, false);

    let envelope: Buffer;
    try {
      envelope = await fs.readFile(physicalPath);
    } catch {
      throw new VaultError(VaultErrorCode.NOT_FOUND, `File not found: "${sanitized}"`, 404);
    }

    const plaintext = this.cryptoEngine.decrypt(envelope, sanitized);
    const etag = this.cryptoEngine.calculateEtag(envelope);
    const fStats = await fs.stat(physicalPath);

    return {
      plaintext,
      etag,
      stat: {
        path: sanitized,
        type: 'file',
        size: plaintext.length,
        ctime: fStats.birthtimeMs,
        mtime: fStats.mtimeMs,
        etag,
      },
    };
  }

  /**
   * Creates a directory in the vault.
   */
  public async createDirectory(canonicalPath: string): Promise<void> {
    const sanitized = sanitizeVaultPath(canonicalPath);
    if (sanitized === '/') return;

    const physicalPath = this.resolvePhysicalPath(sanitized, true);
    await fs.mkdir(physicalPath, { recursive: true });
  }

  /**
   * Lists entries within a vault directory.
   */
  public async listDirectory(canonicalPath: string): Promise<VaultDirectoryEntry[]> {
    const sanitized = sanitizeVaultPath(canonicalPath);
    const physicalDir = this.resolvePhysicalPath(sanitized, true);

    let dirents: any[];
    try {
      dirents = await fs.readdir(physicalDir, { withFileTypes: true });
    } catch {
      throw new VaultError(VaultErrorCode.NOT_FOUND, `Directory not found: "${sanitized}"`, 404);
    }

    const entries: VaultDirectoryEntry[] = [];
    for (const ent of dirents) {
      if (ent.isDirectory()) {
        const itemCanonical = sanitized === '/' ? `/${ent.name}` : `${sanitized}/${ent.name}`;
        entries.push({
          name: ent.name,
          type: 'directory',
          path: itemCanonical,
        });
      } else if (ent.isFile() && ent.name.endsWith(FILE_ENC_EXTENSION)) {
        const baseName = ent.name.slice(0, -FILE_ENC_EXTENSION.length);
        const itemCanonical = sanitized === '/' ? `/${baseName}` : `${sanitized}/${baseName}`;
        entries.push({
          name: baseName,
          type: 'file',
          path: itemCanonical,
        });
      }
    }

    return entries;
  }

  /**
   * Deletes a file or directory.
   */
  public async deleteEntry(canonicalPath: string, recursive: boolean = false): Promise<void> {
    const sanitized = sanitizeVaultPath(canonicalPath);
    if (sanitized === '/') {
      throw new VaultError(VaultErrorCode.INTERNAL_ERROR, 'Cannot delete root directory', 400);
    }

    // Try as file
    const filePhysical = this.resolvePhysicalPath(sanitized, false);
    try {
      await fs.unlink(filePhysical);
      return;
    } catch {
      // Not a file, try directory
    }

    // Try as directory
    const dirPhysical = this.resolvePhysicalPath(sanitized, true);
    try {
      await fs.rm(dirPhysical, { recursive, force: false });
      return;
    } catch (err: any) {
      throw new VaultError(
        VaultErrorCode.NOT_FOUND,
        `Cannot delete entry: "${sanitized}" not found or directory not empty`,
        404,
        { original: String(err) }
      );
    }
  }

  /**
   * Renames or moves a file or directory.
   * If it is a file, it MUST be re-encrypted because AES-256-GCM AAD binds
   * the canonical path into the authentication tag!
   */
  public async renameEntry(oldCanonical: string, newCanonical: string): Promise<void> {
    const oldSanitized = sanitizeVaultPath(oldCanonical);
    const newSanitized = sanitizeVaultPath(newCanonical);

    if (oldSanitized === '/' || newSanitized === '/') {
      throw new VaultError(VaultErrorCode.INVALID_PATH, 'Cannot rename root directory', 400);
    }

    if (oldSanitized === newSanitized) {
      return;
    }

    if (newSanitized.startsWith(oldSanitized + '/')) {
      throw new VaultError(
        VaultErrorCode.INVALID_PATH,
        `Cannot move a directory into a subdirectory of itself: "${oldSanitized}" -> "${newSanitized}"`,
        400
      );
    }

    // Check if it's a file
    const oldFile = this.resolvePhysicalPath(oldSanitized, false);
    let isFile = false;
    try {
      const s = await fs.stat(oldFile);
      isFile = s.isFile();
    } catch {
      isFile = false;
    }

    if (isFile) {
      // Read & decrypt with old canonical AAD
      const { plaintext } = await this.readFile(oldSanitized);
      // Write & encrypt with new canonical AAD
      await this.writeFile(newSanitized, plaintext);
      // Remove old file
      await fs.unlink(oldFile);
      return;
    }

    // Directory rename: recursively re-encrypt all contained files to preserve AAD integrity
    await this.renameDirectoryRecursively(oldSanitized, newSanitized);
  }

  /**
   * Recursively traverses a directory, decrypting and re-encrypting all nested files
   * under their new canonical paths so that AES-256-GCM AAD authentication remains valid.
   */
  private async renameDirectoryRecursively(oldDirCanonical: string, newDirCanonical: string): Promise<void> {
    const oldPhysical = this.resolvePhysicalPath(oldDirCanonical, true);
    const newPhysical = this.resolvePhysicalPath(newDirCanonical, true);

    try {
      const s = await fs.stat(oldPhysical);
      if (!s.isDirectory()) {
        throw new VaultError(VaultErrorCode.NOT_A_DIRECTORY, `Source "${oldDirCanonical}" is not a directory`, 400);
      }
    } catch (err: any) {
      if (err instanceof VaultError) throw err;
      throw new VaultError(VaultErrorCode.NOT_FOUND, `Directory "${oldDirCanonical}" not found`, 404);
    }

    const collectFiles = async (dirCanonical: string): Promise<string[]> => {
      const entries = await this.listDirectory(dirCanonical);
      let filePaths: string[] = [];
      for (const ent of entries) {
        if (ent.type === 'directory') {
          const subFiles = await collectFiles(ent.path);
          filePaths = filePaths.concat(subFiles);
        } else {
          filePaths.push(ent.path);
        }
      }
      return filePaths;
    };

    const filesToMigrate = await collectFiles(oldDirCanonical);

    // Re-encrypt and write each file under its new canonical path
    for (const oldFilePath of filesToMigrate) {
      const relativePart = oldFilePath.slice(oldDirCanonical.length);
      const newFilePath = newDirCanonical + relativePart;

      const { plaintext } = await this.readFile(oldFilePath);
      await this.writeFile(newFilePath, plaintext);
    }

    // Ensure new directory exists even if it was empty
    await fs.mkdir(newPhysical, { recursive: true });

    // Clean up old directory tree safely
    await fs.rm(oldPhysical, { recursive: true, force: true });
  }

  /**
   * Imports an unencrypted local filesystem file into the vault.
   * If overwrite is false and destination exists, rejects with ALREADY_EXISTS.
   */
  public async importFile(sourceFsPath: string, destCanonicalPath: string, overwrite: boolean = false): Promise<VaultFileStat> {
    const resolvedSource = path.resolve(sourceFsPath);
    const sourceStat = await fs.stat(resolvedSource);
    if (!sourceStat.isFile()) {
      throw new VaultError(VaultErrorCode.NOT_FOUND, `Source "${sourceFsPath}" is not a regular file`, 400);
    }

    if (!overwrite) {
      const exists = await this.stat(destCanonicalPath).then((s) => s.type === 'file').catch(() => false);
      if (exists) {
        throw new VaultError(
          VaultErrorCode.ALREADY_EXISTS,
          `Destination file "${destCanonicalPath}" already exists in the vault. Overwrite authorization required.`,
          409
        );
      }
    }

    const content = await fs.readFile(resolvedSource);
    const { stat } = await this.writeFile(destCanonicalPath, content);
    return stat;
  }

  /**
   * Recursively imports an unencrypted directory from the local host into the vault.
   */
  public async importDirectory(sourceFsDir: string, destCanonicalDir: string, overwrite: boolean = false): Promise<{ count: number; paths: string[] }> {
    const resolvedSource = path.resolve(sourceFsDir);
    const dirStat = await fs.stat(resolvedSource);
    if (!dirStat.isDirectory()) {
      throw new VaultError(VaultErrorCode.NOT_A_DIRECTORY, `Source "${sourceFsDir}" is not a directory`, 400);
    }

    const sanitizedDest = sanitizeVaultPath(destCanonicalDir);
    await this.createDirectory(sanitizedDest);

    const importedPaths: string[] = [];

    const walk = async (currentFsDir: string, currentVaultDir: string) => {
      const entries = await fs.readdir(currentFsDir, { withFileTypes: true });
      for (const ent of entries) {
        const fullFsPath = path.join(currentFsDir, ent.name);
        const vaultPath = currentVaultDir === '/' ? `/${ent.name}` : `${currentVaultDir}/${ent.name}`;

        if (ent.isDirectory()) {
          await this.createDirectory(vaultPath);
          await walk(fullFsPath, vaultPath);
        } else if (ent.isFile()) {
          await this.importFile(fullFsPath, vaultPath, overwrite);
          importedPaths.push(vaultPath);
        }
      }
    };

    await walk(resolvedSource, sanitizedDest);
    return { count: importedPaths.length, paths: importedPaths };
  }

  /**
   * Decrypts and exports a vault file to an explicit destination path on disk.
   */
  public async exportFile(sourceCanonicalPath: string, destFsPath: string): Promise<void> {
    const { plaintext } = await this.readFile(sourceCanonicalPath);
    const resolvedDest = path.resolve(destFsPath);
    await fs.mkdir(path.dirname(resolvedDest), { recursive: true });
    await fs.writeFile(resolvedDest, plaintext, { mode: 0o600 });
  }

  /**
   * Decrypts and exports an entire vault directory tree to an explicit local filesystem destination.
   */
  public async exportDirectory(sourceCanonicalDir: string, destFsDir: string): Promise<{ count: number; paths: string[] }> {
    const resolvedDest = path.resolve(destFsDir);
    await fs.mkdir(resolvedDest, { recursive: true });

    const exportedPaths: string[] = [];

    const walkVault = async (currentVaultDir: string, currentFsDir: string) => {
      const entries = await this.listDirectory(currentVaultDir);
      for (const ent of entries) {
        const localPath = path.join(currentFsDir, ent.name);
        if (ent.type === 'directory') {
          await fs.mkdir(localPath, { recursive: true });
          await walkVault(ent.path, localPath);
        } else {
          await this.exportFile(ent.path, localPath);
          exportedPaths.push(localPath);
        }
      }
    };

    await walkVault(sourceCanonicalDir, resolvedDest);
    return { count: exportedPaths.length, paths: exportedPaths };
  }
}
