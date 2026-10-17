import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { CryptoEngine } from '../src/crypto/crypto.engine.js';
import { StorageEngine } from '../src/storage/storage.engine.js';
import { deriveKeys, generateSalt } from '../src/crypto/kdf.js';
import { VaultErrorCode } from '@personal-vault/shared';

describe('Storage Engine Specification Tests', () => {
  let tempDir: string;
  let cryptoEngine: CryptoEngine;
  let storageEngine: StorageEngine;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vault-storage-test-'));
    cryptoEngine = new CryptoEngine();
    const salt = generateSalt();
    const { masterKey } = await deriveKeys('test-storage-master-key-pass', salt);
    cryptoEngine.setMasterKey(masterKey);

    storageEngine = new StorageEngine(tempDir, cryptoEngine);
    await storageEngine.ensureReady();
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('creates directories, writes encrypted files, and lists entries accurately', async () => {
    await storageEngine.createDirectory('/projects/code');
    const content = Buffer.from('console.log("Hello from Personal Vault!");', 'utf8');

    const { etag, stat } = await storageEngine.writeFile('/projects/code/main.js', content);
    expect(etag).toBeDefined();
    expect(stat.size).toBe(content.length);

    // List root directory
    const rootList = await storageEngine.listDirectory('/');
    expect(rootList.some((e) => e.name === 'projects' && e.type === 'directory')).toBe(true);

    // List subdirectory
    const codeList = await storageEngine.listDirectory('/projects/code');
    expect(codeList.some((e) => e.name === 'main.js' && e.type === 'file')).toBe(true);

    // Read file
    const readRes = await storageEngine.readFile('/projects/code/main.js');
    expect(readRes.plaintext.toString('utf8')).toBe(content.toString('utf8'));
    expect(readRes.etag).toBe(etag);
  });

  it('enforces optimistic concurrency control and prevents lost updates via ETag matching', async () => {
    const original = Buffer.from('Version 1', 'utf8');
    const { etag: v1Etag } = await storageEngine.writeFile('/notes/concurrent.txt', original);

    // Client B updates file to Version 2
    const v2Content = Buffer.from('Version 2 - Updated by User B', 'utf8');
    const { etag: v2Etag } = await storageEngine.writeFile('/notes/concurrent.txt', v2Content, v1Etag);
    expect(v2Etag).not.toBe(v1Etag);

    // Client A attempts to save outdated changes based on v1Etag
    const outdatedWrite = Buffer.from('Outdated Edit by User A', 'utf8');
    await expect(
      storageEngine.writeFile('/notes/concurrent.txt', outdatedWrite, v1Etag)
    ).rejects.toThrow();

    try {
      await storageEngine.writeFile('/notes/concurrent.txt', outdatedWrite, v1Etag);
    } catch (err: any) {
      expect(err.code).toBe(VaultErrorCode.CONCURRENCY_CONFLICT);
      expect(err.statusCode).toBe(412);
    }
  });

  it('strictly blocks path traversal attempts at the storage boundary', async () => {
    const maliciousPayload = Buffer.from('Malicious overwrite attempt', 'utf8');

    await expect(
      storageEngine.writeFile('../../Windows/System32/hack.dll', maliciousPayload)
    ).rejects.toThrow();

    await expect(
      storageEngine.readFile('/../../etc/shadow')
    ).rejects.toThrow();
  });

  it('re-encrypts files under the new canonical path when renamed to maintain AAD integrity', async () => {
    const initialContent = Buffer.from('Sensitive Project Plan', 'utf8');
    await storageEngine.writeFile('/docs/plan.txt', initialContent);

    // Rename file to a new path
    await storageEngine.renameEntry('/docs/plan.txt', '/archive/old_plan.txt');

    // Original path should not exist
    await expect(storageEngine.readFile('/docs/plan.txt')).rejects.toThrow();

    // New path should be decrypted successfully with new AAD
    const { plaintext } = await storageEngine.readFile('/archive/old_plan.txt');
    expect(plaintext.toString('utf8')).toBe(initialContent.toString('utf8'));
  });

  it('deletes files and directories cleanly', async () => {
    await storageEngine.writeFile('/temp/discard.txt', Buffer.from('throwaway', 'utf8'));
    expect((await storageEngine.stat('/temp/discard.txt')).type).toBe('file');

    await storageEngine.deleteEntry('/temp/discard.txt');
    await expect(storageEngine.stat('/temp/discard.txt')).rejects.toThrow();
  });

  it('supports explicit import from and export to the local filesystem', async () => {
    // 1. Create a temporary local file outside the vault
    const externalSource = path.join(tempDir, 'external_import.txt');
    await fs.writeFile(externalSource, 'File created externally on desktop', 'utf8');

    // 2. Explicit import into the vault
    await storageEngine.importFile(externalSource, '/imported/test.txt');

    // 2b. Attempt duplicate import without overwrite flag must be rejected
    await expect(
      storageEngine.importFile(externalSource, '/imported/test.txt', false)
    ).rejects.toThrow();

    // 2c. Duplicate import with overwrite=true succeeds
    await storageEngine.importFile(externalSource, '/imported/test.txt', true);

    // 3. Verify it's in the vault and encrypted
    const { plaintext } = await storageEngine.readFile('/imported/test.txt');
    expect(plaintext.toString('utf8')).toBe('File created externally on desktop');

    // 4. Explicit export to another location on disk
    const externalDest = path.join(tempDir, 'exported_copy.txt');
    await storageEngine.exportFile('/imported/test.txt', externalDest);

    const exportedBytes = await fs.readFile(externalDest, 'utf8');
    expect(exportedBytes).toBe('File created externally on desktop');

    // 5. Test recursive directory import and export
    const localDir = path.join(tempDir, 'local_src_dir');
    await fs.mkdir(path.join(localDir, 'subdir'), { recursive: true });
    await fs.writeFile(path.join(localDir, 'file1.txt'), 'content 1');
    await fs.writeFile(path.join(localDir, 'subdir', 'file2.txt'), 'content 2');

    const importDirResult = await storageEngine.importDirectory(localDir, '/vault_imported_dir');
    expect(importDirResult.count).toBe(2);

    const checkFile1 = await storageEngine.readFile('/vault_imported_dir/file1.txt');
    expect(checkFile1.plaintext.toString('utf8')).toBe('content 1');

    const exportDirDest = path.join(tempDir, 'local_exported_dir');
    const exportDirResult = await storageEngine.exportDirectory('/vault_imported_dir', exportDirDest);
    expect(exportDirResult.count).toBe(2);

    const exportedFile2 = await fs.readFile(path.join(exportDirDest, 'subdir', 'file2.txt'), 'utf8');
    expect(exportedFile2).toBe('content 2');
  });

  it('recursively re-encrypts all nested files when renaming a directory to preserve AAD integrity', async () => {
    await storageEngine.createDirectory('/project/src');
    const content = Buffer.from('console.log("nested file in directory");', 'utf8');
    await storageEngine.writeFile('/project/src/index.js', content);

    // Rename the top-level directory
    await storageEngine.renameEntry('/project', '/renamed_project');

    // Old path should not exist
    await expect(storageEngine.readFile('/project/src/index.js')).rejects.toThrow();

    // Nested file under new directory must decrypt cleanly with new AAD
    const { plaintext } = await storageEngine.readFile('/renamed_project/src/index.js');
    expect(plaintext.toString('utf8')).toBe(content.toString('utf8'));
  });

  it('strictly rejects circular directory moves into descendants and preserves original files', async () => {
    await storageEngine.createDirectory('/important_docs/sub');
    const content = Buffer.from('Critical Unrecoverable Data', 'utf8');
    await storageEngine.writeFile('/important_docs/sub/notes.txt', content);

    // Attempt circular move: moving /important_docs into /important_docs/sub/nested
    await expect(
      storageEngine.renameEntry('/important_docs', '/important_docs/sub/nested')
    ).rejects.toThrow();

    try {
      await storageEngine.renameEntry('/important_docs', '/important_docs/sub/nested');
      expect.fail('Should have thrown an error for circular directory rename');
    } catch (err: any) {
      expect(err.code).toBe(VaultErrorCode.INVALID_PATH);
      expect(err.statusCode).toBe(400);
    }

    // REGRESSION PROOF: Original file must SURVIVE unharmed and be decryptable!
    const { plaintext } = await storageEngine.readFile('/important_docs/sub/notes.txt');
    expect(plaintext.toString('utf8')).toBe(content.toString('utf8'));
  });

  it('treats identical source and destination rename as a safe no-op', async () => {
    const content = Buffer.from('Unchanged content', 'utf8');
    await storageEngine.writeFile('/data/sample.txt', content);

    // Self-rename must succeed without deleting or corrupting file
    await storageEngine.renameEntry('/data/sample.txt', '/data/sample.txt');

    const { plaintext } = await storageEngine.readFile('/data/sample.txt');
    expect(plaintext.toString('utf8')).toBe(content.toString('utf8'));
  });
});
