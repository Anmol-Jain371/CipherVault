import path from 'node:path';
import os from 'node:os';
import dotenv from 'dotenv';
import { DEFAULT_PORT } from '@personal-vault/shared';

// Load .env if present
dotenv.config();

export interface ServerConfig {
  host: string;
  port: number;
  storagePath: string;
  sessionIdleTimeoutMs: number;
  sessionMaxLifetimeMs: number;
  maxFailedAttempts: number;
  lockoutDurationMs: number;
  logLevel: 'info' | 'warn' | 'error' | 'debug';
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const host = env.VAULT_HOST || '127.0.0.1';
  
  // Security validation: Warn if binding to public interface
  if (host !== '127.0.0.1' && host !== 'localhost') {
    // We strictly enforce 127.0.0.1 unless explicitly intended, but enforce localhost binding
    if (host === '0.0.0.0') {
      throw new Error(
        'SECURITY VIOLATION: VAULT_HOST cannot be 0.0.0.0. The vault server must bind to localhost (127.0.0.1) behind a tunnel.'
      );
    }
  }

  const rawPort = env.VAULT_PORT;
  let port = DEFAULT_PORT;
  if (rawPort) {
    const parsed = parseInt(rawPort, 10);
    if (isNaN(parsed) || parsed < 1024 || parsed > 65535) {
      throw new Error(`Invalid VAULT_PORT: "${rawPort}". Must be a valid port between 1024 and 65535.`);
    }
    port = parsed;
  }

  // Dedicated storage directory outside the source code repository
  const defaultStorage = path.join(os.homedir(), '.personal-vault', 'data');
  const storagePath = env.VAULT_STORAGE_PATH ? path.resolve(env.VAULT_STORAGE_PATH) : defaultStorage;

  const idleMinutes = parseInt(env.VAULT_SESSION_IDLE_TIMEOUT_MINUTES || '15', 10);
  const maxHours = parseInt(env.VAULT_SESSION_MAX_HOURS || '8', 10);
  const maxFailed = parseInt(env.VAULT_MAX_FAILED_ATTEMPTS || '5', 10);
  const lockoutMinutes = parseInt(env.VAULT_LOCKOUT_MINUTES || '15', 10);

  const logLevel = (['info', 'warn', 'error', 'debug'].includes(env.VAULT_LOG_LEVEL || '')
    ? env.VAULT_LOG_LEVEL
    : 'info') as ServerConfig['logLevel'];

  return {
    host,
    port,
    storagePath,
    sessionIdleTimeoutMs: Math.max(1, idleMinutes) * 60 * 1000,
    sessionMaxLifetimeMs: Math.max(1, maxHours) * 60 * 60 * 1000,
    maxFailedAttempts: Math.max(3, maxFailed),
    lockoutDurationMs: Math.max(1, lockoutMinutes) * 60 * 1000,
    logLevel,
  };
}
