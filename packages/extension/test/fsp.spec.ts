import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockVscode } from './vscode.mock.js';
import * as vscode from 'vscode';
import { VaultFileSystemProvider } from '../src/providers/vault-fs-provider.js';
import { VaultClient } from '../src/client/vault-client.js';
import { SessionManager } from '../src/session/session-manager.js';

describe('VaultFileSystemProvider Specification Tests', () => {
  let client: VaultClient;
  let sessionManager: SessionManager;
  let fsp: VaultFileSystemProvider;

  beforeEach(() => {
    client = new VaultClient({ baseUrl: 'http://127.0.0.1:8743' });
    sessionManager = new SessionManager(client, 15);
    fsp = new VaultFileSystemProvider(client, sessionManager);
  });

  it('prohibits filesystem access when vault is locked', async () => {
    const uri = vscode.Uri.parse('personal-vault:/test.txt');

    await expect(fsp.stat(uri)).rejects.toThrow(/Personal Vault is locked/);
    await expect(fsp.readFile(uri)).rejects.toThrow(/Personal Vault is locked/);
    await expect(fsp.writeFile(uri, new Uint8Array([1]), { create: true, overwrite: true })).rejects.toThrow(/Personal Vault is strictly read-only/);
  });

  it('performs stat and readDirectory operations when unlocked', async () => {
    sessionManager.setToken('valid-token');

    vi.spyOn(client, 'stat').mockResolvedValue({
      path: '/notes/doc.txt',
      type: 'file',
      size: 42,
      ctime: 1000,
      mtime: 2000,
      etag: '"hash123"',
    });

    const stat = await fsp.stat(vscode.Uri.parse('personal-vault:/notes/doc.txt'));
    expect(stat.size).toBe(42);
    expect(stat.type).toBe(mockVscode.FileType.File);
    expect(stat.permissions).toBe(mockVscode.FilePermission.Readonly);

    vi.spyOn(client, 'listDirectory').mockResolvedValue([
      { name: 'subfolder', type: 'directory', path: '/subfolder' },
      { name: 'hello.txt', type: 'file', path: '/hello.txt' },
    ]);

    const entries = await fsp.readDirectory(vscode.Uri.parse('personal-vault:/'));
    expect(entries).toEqual([
      ['subfolder', mockVscode.FileType.Directory],
      ['hello.txt', mockVscode.FileType.File],
    ]);
  });

  it('reads file contents cleanly and rejects client-side write/save attempts', async () => {
    sessionManager.setToken('valid-token');

    const fileContent = new TextEncoder().encode('Hello from Vault!');
    vi.spyOn(client, 'readFile').mockResolvedValue({
      data: fileContent,
      etag: '"initial-etag-999"',
    });

    const readBytes = await fsp.readFile(vscode.Uri.parse('personal-vault:/notes/todo.txt'));
    expect(readBytes).toEqual(fileContent);

    // Any attempt to write or save back to the vault must throw NoPermissions
    const updatedBytes = new TextEncoder().encode('Updated todo list');
    await expect(
      fsp.writeFile(
        vscode.Uri.parse('personal-vault:/notes/todo.txt'),
        updatedBytes,
        { create: false, overwrite: true }
      )
    ).rejects.toThrow(/Personal Vault is strictly read-only/);
  });

  it('strictly rejects createDirectory, delete, and rename operations', async () => {
    sessionManager.setToken('valid-token');

    await expect(
      fsp.createDirectory(vscode.Uri.parse('personal-vault:/new-folder'))
    ).rejects.toThrow(/Personal Vault is strictly read-only/);

    await expect(
      fsp.delete(vscode.Uri.parse('personal-vault:/old.txt'), { recursive: false })
    ).rejects.toThrow(/Personal Vault is strictly read-only/);

    await expect(
      fsp.rename(
        vscode.Uri.parse('personal-vault:/a.txt'),
        vscode.Uri.parse('personal-vault:/b.txt'),
        { overwrite: true }
      )
    ).rejects.toThrow(/Personal Vault is strictly read-only/);
  });
});
