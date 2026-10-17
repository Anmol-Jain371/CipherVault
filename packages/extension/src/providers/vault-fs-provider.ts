import * as vscode from 'vscode';
import { VaultClient } from '../client/vault-client.js';
import { SessionManager } from '../session/session-manager.js';
import { VaultError, VaultErrorCode } from '@personal-vault/shared';

export class VaultFileSystemProvider implements vscode.FileSystemProvider {
  private _emitter = new vscode.EventEmitter<vscode.FileChangeEvent[]>();
  public readonly onDidChangeFile: vscode.Event<vscode.FileChangeEvent[]> = this._emitter.event;

  // In-memory cache of last seen ETags for concurrency verification
  private etagCache = new Map<string, string>();

  constructor(
    private client: VaultClient,
    private sessionManager: SessionManager
  ) {}

  public watch(): vscode.Disposable {
    // Return a dummy disposable for virtual files
    return new vscode.Disposable(() => {});
  }

  public async stat(uri: vscode.Uri): Promise<vscode.FileStat> {
    if (!this.sessionManager.isUnlocked()) {
      throw vscode.FileSystemError.NoPermissions('Personal Vault is locked. Unlock to browse files.');
    }

    try {
      const canonicalPath = uri.path || '/';
      const stat = await this.client.stat(canonicalPath);
      this.sessionManager.touch();

      return {
        type: stat.type === 'directory' ? vscode.FileType.Directory : vscode.FileType.File,
        permissions: vscode.FilePermission.Readonly,
        ctime: stat.ctime,
        mtime: stat.mtime,
        size: stat.size,
      };
    } catch (err: any) {
      if (err instanceof VaultError && err.code === VaultErrorCode.NOT_FOUND) {
        throw vscode.FileSystemError.FileNotFound(uri);
      }
      throw err;
    }
  }

  public async readDirectory(uri: vscode.Uri): Promise<[string, vscode.FileType][]> {
    if (!this.sessionManager.isUnlocked()) {
      throw vscode.FileSystemError.NoPermissions('Personal Vault is locked. Unlock to browse files.');
    }

    const canonicalPath = uri.path || '/';
    const entries = await this.client.listDirectory(canonicalPath);
    this.sessionManager.touch();

    return entries.map((e) => [
      e.name,
      e.type === 'directory' ? vscode.FileType.Directory : vscode.FileType.File,
    ]);
  }

  public async createDirectory(_uri: vscode.Uri): Promise<void> {
    throw vscode.FileSystemError.NoPermissions(
      'Personal Vault is strictly read-only. Creating folders from the remote client is prohibited.'
    );
  }

  public async readFile(uri: vscode.Uri): Promise<Uint8Array> {
    if (!this.sessionManager.isUnlocked()) {
      throw vscode.FileSystemError.NoPermissions('Personal Vault is locked. Unlock to open files.');
    }

    try {
      const canonicalPath = uri.path;
      const { data, etag } = await this.client.readFile(canonicalPath);

      // Track ETag in memory
      if (etag) {
        this.etagCache.set(canonicalPath, etag);
      }
      this.sessionManager.touch();

      return data;
    } catch (err: any) {
      if (err instanceof VaultError && err.code === VaultErrorCode.NOT_FOUND) {
        throw vscode.FileSystemError.FileNotFound(uri);
      }
      throw err;
    }
  }

  public async writeFile(
    _uri: vscode.Uri,
    _content: Uint8Array,
    _options: { create: boolean; overwrite: boolean }
  ): Promise<void> {
    throw vscode.FileSystemError.NoPermissions(
      'Personal Vault is strictly read-only. Modifying or saving vault files from the remote client is prohibited.'
    );
  }

  public async delete(_uri: vscode.Uri, _options: { recursive: boolean }): Promise<void> {
    throw vscode.FileSystemError.NoPermissions(
      'Personal Vault is strictly read-only. Deleting files or folders from the remote client is prohibited.'
    );
  }

  public async rename(
    _oldUri: vscode.Uri,
    _newUri: vscode.Uri,
    _options: { overwrite: boolean }
  ): Promise<void> {
    throw vscode.FileSystemError.NoPermissions(
      'Personal Vault is strictly read-only. Renaming or moving entries from the remote client is prohibited.'
    );
  }
}
