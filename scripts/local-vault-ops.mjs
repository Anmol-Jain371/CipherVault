#!/usr/bin/env node
/**
 * Personal Encrypted Remote Vault - Local Operations Tool (Host Only)
 * 
 * Provides secure offline host-side ingestion (import, export, listing, init)
 * directly against the local storage engine. Runs strictly on the local machine
 * without network exposure.
 */

import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { loadConfig } from '../packages/server/dist/config.js';
import { CryptoEngine } from '../packages/server/dist/crypto/crypto.engine.js';
import { StorageEngine } from '../packages/server/dist/storage/storage.engine.js';
import { deriveKeys, generateSalt } from '../packages/server/dist/crypto/kdf.js';
import { META_FILENAME } from '../packages/server/dist/auth/auth.service.js';
import { validateMasterPassword, SCRYPT_PARAMS } from '@personal-vault/shared';

function askPassword(prompt = 'Enter Vault Master Password: ') {
  return new Promise((resolve) => {
    // If provided via environment variable
    if (process.env.VAULT_PASSWORD) {
      return resolve(process.env.VAULT_PASSWORD);
    }
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    rl.question(prompt, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

function parseArgs(args) {
  const result = { _: [] };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const next = args[i + 1];
      if (next && !next.startsWith('--')) {
        result[key] = next;
        i++;
      } else {
        result[key] = true;
      }
    } else {
      result._.push(arg);
    }
  }
  return result;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const action = args.action || args._[0];

  if (!action || !['init', 'import', 'export', 'list', 'set-viewer-password'].includes(action)) {
    console.log(`
CipherVault - Local Host Tool (Secure Offline Ops)

Usage:
  node scripts/local-vault-ops.mjs init
  node scripts/local-vault-ops.mjs import --source <fileOrDir> --dest <vaultPath> [--overwrite]
  node scripts/local-vault-ops.mjs export --source <vaultPath> --dest <localDirOrFile>
  node scripts/local-vault-ops.mjs list [--path <vaultPath>]
  node scripts/local-vault-ops.mjs set-viewer-password [--viewerPassword <pass>]

Options:
  --source <path>     Path on host filesystem or in vault
  --dest <path>       Target path in vault or on host filesystem
  --overwrite         Explicitly allow replacing existing files
  --path <path>       Vault directory path (default: "/")
  --viewerPassword    Read-only password for college lab users
`);
    process.exit(0);
  }

  const config = loadConfig();
  console.log(`[Host Ops] Local Vault Storage: ${config.storagePath}`);

  const metaPath = path.join(config.storagePath, META_FILENAME);
  const cryptoEngine = new CryptoEngine();
  const storageEngine = new StorageEngine(config.storagePath, cryptoEngine);
  await storageEngine.ensureReady();

  // 1. Initialize vault
  if (action === 'init') {
    if (fsSync.existsSync(metaPath)) {
      console.error('[ERROR] Vault is already initialized at:', config.storagePath);
      process.exit(1);
    }

    const password = args.password || await askPassword('Enter Master Password for new vault (min 12 chars): ');
    const { valid, reason } = validateMasterPassword(password);
    if (!valid) {
      console.error(`[ERROR] Password does not meet security criteria: ${reason}`);
      process.exit(1);
    }

    console.log('[Host Ops] Generating 256-bit scrypt salt & deriving master keys...');
    const salt = generateSalt();
    const { masterKey, verifier } = await deriveKeys(password, salt);

    try {
      const metadata = {
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

      await fs.mkdir(config.storagePath, { recursive: true });
      await fs.writeFile(metaPath, JSON.stringify(metadata, null, 2), { encoding: 'utf8', mode: 0o600 });
      console.log('[SUCCESS] Vault initialized successfully on host computer.');
    } finally {
      masterKey.fill(0);
      verifier.fill(0);
    }
    return;
  }

  // Ensure vault is initialized for other actions
  if (!fsSync.existsSync(metaPath)) {
    console.error('[ERROR] Vault is not initialized yet. Run "init" first.');
    process.exit(1);
  }

  const metaRaw = await fs.readFile(metaPath, 'utf8');
  const metadata = JSON.parse(metaRaw);
  const salt = Buffer.from(metadata.kdf.saltHex, 'hex');

  const password = args.password || await askPassword();
  const { masterKey, verifier } = await deriveKeys(password, salt);

  try {
    const storedVerifier = Buffer.from(metadata.verifierHex, 'hex');
    const crypto = await import('node:crypto');
    if (
      storedVerifier.length !== verifier.length ||
      !crypto.timingSafeEqual(storedVerifier, verifier)
    ) {
      console.error('[ERROR] Incorrect master password.');
      process.exit(1);
    }

    cryptoEngine.setMasterKey(masterKey);

    // 2. Import file or directory into vault
    if (action === 'import') {
      const source = args.source;
      const dest = args.dest || args.destination || '/';
      const overwrite = Boolean(args.overwrite);

      if (!source) {
        console.error('[ERROR] --source <path> is required for import.');
        process.exit(1);
      }

      const resolvedSource = path.resolve(source);
      const stat = await fs.stat(resolvedSource);

      if (stat.isDirectory()) {
        console.log(`[Host Ops] Importing directory "${resolvedSource}" into vault "${dest}" (overwrite: ${overwrite})...`);
        const result = await storageEngine.importDirectory(resolvedSource, dest, overwrite);
        console.log(`[SUCCESS] Imported ${result.count} files into vault.`);
      } else {
        const destPath = dest.endsWith('/') ? `${dest}${path.basename(resolvedSource)}` : dest;
        console.log(`[Host Ops] Importing file "${resolvedSource}" -> "${destPath}" (overwrite: ${overwrite})...`);
        const fileStat = await storageEngine.importFile(resolvedSource, destPath, overwrite);
        console.log(`[SUCCESS] Imported "${destPath}" (${fileStat.size} bytes, AES-256-GCM encrypted, ETag ${fileStat.etag}).`);
      }
    }

    // 3. Export file or directory from vault
    else if (action === 'export') {
      const source = args.source;
      const dest = args.dest || args.destination;

      if (!source || !dest) {
        console.error('[ERROR] Both --source <vaultPath> and --dest <localPath> are required for export.');
        process.exit(1);
      }

      const vaultStat = await storageEngine.stat(source);
      if (vaultStat.type === 'directory') {
        console.log(`[Host Ops] Exporting vault directory "${source}" -> "${dest}"...`);
        const result = await storageEngine.exportDirectory(source, dest);
        console.log(`[SUCCESS] Exported ${result.count} files to "${dest}".`);
      } else {
        console.log(`[Host Ops] Decrypting and exporting "${source}" -> "${dest}"...`);
        await storageEngine.exportFile(source, dest);
        console.log(`[SUCCESS] Exported "${source}" to "${dest}".`);
      }
    }

    // 4. List directory
    else if (action === 'list') {
      const vaultPath = args.path || args.source || '/';
      console.log(`[Host Ops] Listing vault entries in "${vaultPath}":`);
      const entries = await storageEngine.listDirectory(vaultPath);
      if (entries.length === 0) {
        console.log('  (Directory is empty)');
      } else {
        for (const ent of entries) {
          const typeTag = ent.type === 'directory' ? '[DIR] ' : '[FILE]';
          console.log(`  ${typeTag} ${ent.path}`);
        }
      }
    }

    // 5. Configure Read-Only Viewer Password for College Lab Users
    else if (action === 'set-viewer-password') {
      const viewerPass = args.viewerPassword || await askPassword('Enter Read-Only Viewer Password for College Lab: ');
      if (!viewerPass || viewerPass.length < 4) {
        console.error('[ERROR] Viewer password must be at least 4 characters.');
        process.exit(1);
      }

      const { AuthService } = await import('../packages/server/dist/auth/auth.service.js');
      const { RateLimiter } = await import('../packages/server/dist/auth/rate-limiter.js');
      const { SessionStore } = await import('../packages/server/dist/auth/session-store.js');
      const authService = new AuthService(config.storagePath, cryptoEngine, new RateLimiter(5, 60000), new SessionStore());

      await authService.setViewerPassword(password, viewerPass);
      console.log('\n==========================================================');
      console.log(' [SUCCESS] Read-Only Viewer Password Configured!');
      console.log('==========================================================');
      console.log(' College lab users can now unlock CipherVault using this password.');
      console.log(' They will have strictly read-only access (no editing, no tampering).');
      console.log(' Only YOU with your Master Password can edit or upload files!');
    }
  } finally {
    cryptoEngine.lock();
    masterKey.fill(0);
    verifier.fill(0);
  }
}

main().catch((err) => {
  console.error('[ERROR]', err.message);
  process.exit(1);
});
