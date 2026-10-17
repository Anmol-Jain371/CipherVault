import Fastify, { FastifyInstance } from 'fastify';
import { ServerConfig } from './config.js';
import { CryptoEngine } from './crypto/crypto.engine.js';
import { RateLimiter } from './auth/rate-limiter.js';
import { SessionStore } from './auth/session-store.js';
import { AuthService } from './auth/auth.service.js';
import { StorageEngine } from './storage/storage.engine.js';
import { registerAuthRoutes } from './routes/auth.routes.js';
import { registerVaultRoutes } from './routes/vault.routes.js';
import { VaultError, VaultErrorCode } from '@personal-vault/shared';

export interface AppContext {
  app: FastifyInstance;
  cryptoEngine: CryptoEngine;
  authService: AuthService;
  storageEngine: StorageEngine;
}

export function buildServer(config: ServerConfig): AppContext {
  const app = Fastify({
    logger: {
      level: config.logLevel,
      // Redact sensitive fields from logging
      redact: ['req.headers.authorization', 'body.password'],
    },
    bodyLimit: 50 * 1024 * 1024, // 50MB
    trustProxy: '127.0.0.1', // Trust proxy headers strictly from local loopback (cloudflared)
  });

  // Raw body parser for octet-stream file uploads
  app.addContentTypeParser(
    'application/octet-stream',
    { parseAs: 'buffer' },
    (_req, body, done) => {
      done(null, body);
    }
  );

  // Allow text/plain as buffer
  app.addContentTypeParser(
    'text/plain',
    { parseAs: 'buffer' },
    (_req, body, done) => {
      done(null, body);
    }
  );

  const cryptoEngine = new CryptoEngine();
  const rateLimiter = new RateLimiter(config.maxFailedAttempts, config.lockoutDurationMs);
  const sessionStore = new SessionStore(config.sessionIdleTimeoutMs, config.sessionMaxLifetimeMs);
  const authService = new AuthService(config.storagePath, cryptoEngine, rateLimiter, sessionStore);
  const storageEngine = new StorageEngine(config.storagePath, cryptoEngine);

  // Centralized Error Handling
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof VaultError) {
      return reply.status(error.statusCode).send({
        error: {
          code: error.code,
          message: error.message,
          details: error.details,
        },
      });
    }

    // Fastify / schema validation errors
    const err = error as Record<string, unknown> | null;
    if (err && typeof err.statusCode === 'number') {
      return reply.status(err.statusCode).send({
        error: {
          code: VaultErrorCode.INTERNAL_ERROR,
          message: typeof err.message === 'string' ? err.message : 'Validation error',
        },
      });
    }

    app.log.error(error);
    return reply.status(500).send({
      error: {
        code: VaultErrorCode.INTERNAL_ERROR,
        message: 'An internal server error occurred',
      },
    });
  });

  // Register route groups
  registerAuthRoutes(app, authService);
  registerVaultRoutes(app, authService, storageEngine);

  return { app, cryptoEngine, authService, storageEngine };
}
