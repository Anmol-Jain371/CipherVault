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

      const isHost = this.sessionManager.isHost();

      return {
        type: stat.type === 'directory' ? vscode.FileType.Directory : vscode.FileType.File,
        permissions: isHost ? undefined : vscode.FilePermission.Readonly,
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

  public async createDirectory(uri: vscode.Uri): Promise<void> {
    if (!this.sessionManager.isUnlocked()) {
      throw vscode.FileSystemError.NoPermissions('Personal Vault is locked. Unlock to create folders.');
    }

    if (!this.sessionManager.isHost()) {
      throw vscode.FileSystemError.NoPermissions(
        'Personal Vault is strictly read-only for viewers. Only the host with Master Password can create folders.'
      );
    }

    try {
      const canonicalPath = uri.path || '/';
      await this.client.createDirectory(canonicalPath);
      this.sessionManager.touch();
      this._emitter.fire([{ type: vscode.FileChangeType.Created, uri }]);
    } catch (err: any) {
      throw vscode.FileSystemError.NoPermissions(`Failed to create directory: ${err.message}`);
    }
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
    uri: vscode.Uri,
    content: Uint8Array,
    _options: { create: boolean; overwrite: boolean }
  ): Promise<void> {
    if (!this.sessionManager.isUnlocked() || !this.sessionManager.isHost()) {
      throw vscode.FileSystemError.NoPermissions(
        'Personal Vault is strictly read-only for viewers. Use "Export File to Local Workspace" to code locally in college lab.'
      );
    }

    try {
      const canonicalPath = uri.path;
      const lastEtag = this.etagCache.get(canonicalPath);
      const stat = await this.client.writeFile(canonicalPath, content, lastEtag);

      if (stat.etag) {
        this.etagCache.set(canonicalPath, stat.etag);
      }
      this.sessionManager.touch();
      this._emitter.fire([{ type: vscode.FileChangeType.Changed, uri }]);
    } catch (err: any) {
      throw vscode.FileSystemError.NoPermissions(`Failed to save vault file: ${err.message}`);
    }
  }

  public async delete(uri: vscode.Uri, options: { recursive: boolean }): Promise<void> {
    if (!this.sessionManager.isUnlocked()) {
      throw vscode.FileSystemError.NoPermissions('Personal Vault is locked. Unlock to delete files.');
    }

    if (!this.sessionManager.isHost()) {
      throw vscode.FileSystemError.NoPermissions(
        'Personal Vault is strictly read-only for viewers. Only the host with Master Password can delete files.'
      );
    }

    try {
      const canonicalPath = uri.path;
      await this.client.deleteEntry(canonicalPath, options.recursive);
      this.etagCache.delete(canonicalPath);
      this.sessionManager.touch();
      this._emitter.fire([{ type: vscode.FileChangeType.Deleted, uri }]);
    } catch (err: any) {
      throw vscode.FileSystemError.NoPermissions(`Failed to delete entry: ${err.message}`);
    }
  }

  public async rename(
    oldUri: vscode.Uri,
    newUri: vscode.Uri,
    _options: { overwrite: boolean }
  ): Promise<void> {
    if (!this.sessionManager.isUnlocked()) {
      throw vscode.FileSystemError.NoPermissions('Personal Vault is locked.');
    }

    if (!this.sessionManager.isHost()) {
      throw vscode.FileSystemError.NoPermissions(
        'Personal Vault is strictly read-only for viewers. Only the host with Master Password can rename files.'
      );
    }

    try {
      await this.client.rename(oldUri.path, newUri.path);
      const oldEtag = this.etagCache.get(oldUri.path);
      if (oldEtag) {
        this.etagCache.delete(oldUri.path);
        this.etagCache.set(newUri.path, oldEtag);
      }
      this.sessionManager.touch();
      this._emitter.fire([
        { type: vscode.FileChangeType.Deleted, uri: oldUri },
        { type: vscode.FileChangeType.Created, uri: newUri },
      ]);
    } catch (err: any) {
      throw vscode.FileSystemError.NoPermissions(`Failed to rename entry: ${err.message}`);
    }
  }
}
