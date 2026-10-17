/**
 * Standardized Vault Error Codes and Classes
 */

export enum VaultErrorCode {
  UNAUTHORIZED = 'VAULT_UNAUTHORIZED',
  SESSION_EXPIRED = 'VAULT_SESSION_EXPIRED',
  RATE_LIMITED = 'VAULT_RATE_LIMITED',
  NOT_FOUND = 'VAULT_NOT_FOUND',
  ALREADY_EXISTS = 'VAULT_ALREADY_EXISTS',
  IS_DIRECTORY = 'VAULT_IS_DIRECTORY',
  NOT_A_DIRECTORY = 'VAULT_NOT_A_DIRECTORY',
  INVALID_PATH = 'VAULT_INVALID_PATH',
  PATH_TRAVERSAL_DETECTED = 'VAULT_PATH_TRAVERSAL_DETECTED',
  INTEGRITY_CHECK_FAILED = 'VAULT_INTEGRITY_CHECK_FAILED',
  CONCURRENCY_CONFLICT = 'VAULT_CONCURRENCY_CONFLICT', // 412 Precondition Failed
  FILE_TOO_LARGE = 'VAULT_FILE_TOO_LARGE',
  VAULT_LOCKED = 'VAULT_LOCKED',
  VAULT_NOT_INITIALIZED = 'VAULT_NOT_INITIALIZED',
  INVALID_CREDENTIALS = 'VAULT_INVALID_CREDENTIALS',
  INTERNAL_ERROR = 'VAULT_INTERNAL_ERROR',
  READ_ONLY_MODE = 'VAULT_READ_ONLY_MODE',
}

export class VaultError extends Error {
  public readonly code: VaultErrorCode;
  public readonly statusCode: number;
  public readonly details?: Record<string, unknown>;

  constructor(
    code: VaultErrorCode,
    message: string,
    statusCode: number = 500,
    details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'VaultError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    Object.setPrototypeOf(this, VaultError.prototype);
  }
}

export interface ApiErrorResponse {
  error: {
    code: VaultErrorCode;
    message: string;
    details?: Record<string, unknown>;
  };
}
