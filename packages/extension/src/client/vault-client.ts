import {
  VaultFileStat,
  VaultDirectoryEntry,
  VaultError,
  VaultErrorCode,
  HEADER_IF_MATCH,
  HEADER_ETAG,
  LoginResponse,
} from '@personal-vault/shared';

export interface ClientConfig {
  baseUrl: string;
  timeoutMs?: number;
}

export class VaultClient {
  private baseUrl: string;
  private sessionToken: string | null = null;
  private timeoutMs: number;

  constructor(config: ClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/+$/, '');
    this.timeoutMs = config.timeoutMs || 10000; // 10s default timeout
  }

  public setBaseUrl(url: string): void {
    this.baseUrl = url.replace(/\/+$/, '');
  }

  public getBaseUrl(): string {
    return this.baseUrl;
  }

  public setToken(token: string | null): void {
    this.sessionToken = token;
  }

  public getToken(): string | null {
    return this.sessionToken;
  }

  public isAuthenticated(): boolean {
    return this.sessionToken !== null;
  }

  private getAuthHeaders(extra?: Record<string, string>): Record<string, string> {
    const headers: Record<string, string> = { ...extra };
    if (this.sessionToken) {
      headers['authorization'] = `Bearer ${this.sessionToken}`;
    }
    return headers;
  }

  /**
   * Internal fetch with explicit abort timeout to prevent UI freezes on network disruption.
   */
  private async fetchWithTimeout(url: string, options: RequestInit = {}): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      return res;
    } catch (err: any) {
      if (err.name === 'AbortError') {
        throw new VaultError(
          VaultErrorCode.INTERNAL_ERROR,
          `Request timed out after ${this.timeoutMs / 1000}s contacting vault at ${this.baseUrl}. Ensure your home laptop is online.`,
          504
        );
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  private async handleResponse<T>(res: Response): Promise<T> {
    if (!res.ok) {
      let errPayload: any;
      try {
        errPayload = await res.json();
      } catch {
        // Not JSON
      }

      const code = errPayload?.error?.code || VaultErrorCode.INTERNAL_ERROR;
      const message = errPayload?.error?.message || `HTTP ${res.status}: ${res.statusText}`;

      throw new VaultError(code, message, res.status, errPayload?.error?.details);
    }

    return (await res.json()) as T;
  }

  public async getStatus(): Promise<{ vaultInitialized: boolean; authenticated: boolean; expiresAt?: number }> {
    const res = await this.fetchWithTimeout(`${this.baseUrl}/api/v1/auth/status`, {
      method: 'GET',
      headers: this.getAuthHeaders(),
    });
    return this.handleResponse(res);
  }

  public async initVault(password: string): Promise<LoginResponse> {
    const res = await this.fetchWithTimeout(`${this.baseUrl}/api/v1/auth/init`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    const data = await this.handleResponse<LoginResponse>(res);
    this.sessionToken = data.token;
    return data;
  }

  public async login(password: string): Promise<LoginResponse> {
    const res = await this.fetchWithTimeout(`${this.baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    const data = await this.handleResponse<LoginResponse>(res);
    this.sessionToken = data.token;
    return data;
  }

  public async lock(): Promise<void> {
    try {
      if (this.sessionToken) {
        await this.fetchWithTimeout(`${this.baseUrl}/api/v1/auth/lock`, {
          method: 'POST',
          headers: this.getAuthHeaders(),
        });
      }
    } catch {
      // Best-effort network notification; local lock must never fail even if server is offline
    } finally {
      this.sessionToken = null;
    }
  }

  public async stat(canonicalPath: string): Promise<VaultFileStat> {
    const res = await this.fetchWithTimeout(`${this.baseUrl}/api/v1/vault/stat?path=${encodeURIComponent(canonicalPath)}`, {
      method: 'GET',
      headers: this.getAuthHeaders(),
    });
    return this.handleResponse<VaultFileStat>(res);
  }

  public async listDirectory(canonicalPath: string): Promise<VaultDirectoryEntry[]> {
    const res = await this.fetchWithTimeout(`${this.baseUrl}/api/v1/vault/list?path=${encodeURIComponent(canonicalPath)}`, {
      method: 'GET',
      headers: this.getAuthHeaders(),
    });
    const data = await this.handleResponse<{ path: string; entries: VaultDirectoryEntry[] }>(res);
    return data.entries;
  }

  public async readFile(canonicalPath: string): Promise<{ data: Uint8Array; etag: string }> {
    const res = await this.fetchWithTimeout(`${this.baseUrl}/api/v1/vault/read?path=${encodeURIComponent(canonicalPath)}`, {
      method: 'GET',
      headers: this.getAuthHeaders(),
    });

    if (!res.ok) {
      await this.handleResponse(res); // Will throw appropriate VaultError
    }

    const etag = res.headers.get(HEADER_ETAG) || '';
    const arrayBuffer = await res.arrayBuffer();
    return {
      data: new Uint8Array(arrayBuffer),
      etag,
    };
  }

  public async writeFile(
    canonicalPath: string,
    content: Uint8Array,
    ifMatchEtag?: string
  ): Promise<VaultFileStat> {
    const headers: Record<string, string> = {
      'content-type': 'application/octet-stream',
    };
    if (ifMatchEtag) {
      headers[HEADER_IF_MATCH] = ifMatchEtag;
    }

    const res = await this.fetchWithTimeout(`${this.baseUrl}/api/v1/vault/write?path=${encodeURIComponent(canonicalPath)}`, {
      method: 'PUT',
      headers: this.getAuthHeaders(headers),
      body: content,
    });

    return this.handleResponse<VaultFileStat>(res);
  }

  public async createDirectory(canonicalPath: string): Promise<void> {
    const res = await this.fetchWithTimeout(`${this.baseUrl}/api/v1/vault/mkdir`, {
      method: 'POST',
      headers: this.getAuthHeaders({ 'content-type': 'application/json' }),
      body: JSON.stringify({ path: canonicalPath }),
    });
    await this.handleResponse(res);
  }

  public async deleteEntry(canonicalPath: string, recursive: boolean = false): Promise<void> {
    const res = await this.fetchWithTimeout(
      `${this.baseUrl}/api/v1/vault/entry?path=${encodeURIComponent(canonicalPath)}&recursive=${recursive}`,
      {
        method: 'DELETE',
        headers: this.getAuthHeaders(),
      }
    );
    await this.handleResponse(res);
  }

  public async rename(oldCanonical: string, newCanonical: string): Promise<void> {
    const res = await this.fetchWithTimeout(`${this.baseUrl}/api/v1/vault/rename`, {
      method: 'POST',
      headers: this.getAuthHeaders({ 'content-type': 'application/json' }),
      body: JSON.stringify({ oldPath: oldCanonical, newPath: newCanonical }),
    });
    await this.handleResponse(res);
  }
}
