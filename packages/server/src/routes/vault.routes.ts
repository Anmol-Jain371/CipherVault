import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { AuthService } from '../auth/auth.service.js';
import { StorageEngine } from '../storage/storage.engine.js';
import { isRemoteOrProxiedRequest } from './auth.routes.js';
import {
  VaultError,
  VaultErrorCode,
  HEADER_IF_MATCH,
  HEADER_ETAG,
} from '@personal-vault/shared';

export function registerVaultRoutes(
  app: FastifyInstance,
  authService: AuthService,
  storageEngine: StorageEngine
) {
  // Pre-handler hook to authenticate all /api/v1/vault/* endpoints
  app.addHook('preHandler', async (request: FastifyRequest, _reply: FastifyReply) => {
    if (!request.url.startsWith('/api/v1/vault/')) {
      return;
    }

    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new VaultError(VaultErrorCode.UNAUTHORIZED, 'Missing or malformed Authorization header', 401);
    }

    const token = authHeader.slice(7).trim();
    const session = authService.authenticateToken(token);
    (request as any).session = session;
  });

  // Stat file or directory
  app.get('/api/v1/vault/stat', async (request: FastifyRequest<{ Querystring: { path: string } }>, reply: FastifyReply) => {
    const { path } = request.query;
    if (!path) {
      throw new VaultError(VaultErrorCode.INVALID_PATH, 'Path query parameter is required', 400);
    }

    const stat = await storageEngine.stat(path);
    reply.header(HEADER_ETAG, stat.etag);
    return reply.send(stat);
  });

  // List directory entries
  app.get('/api/v1/vault/list', async (request: FastifyRequest<{ Querystring: { path?: string } }>, reply: FastifyReply) => {
    const canonicalPath = request.query.path || '/';
    const entries = await storageEngine.listDirectory(canonicalPath);
    return reply.send({ path: canonicalPath, entries });
  });

  // Read decrypted file
  app.get('/api/v1/vault/read', async (request: FastifyRequest<{ Querystring: { path: string } }>, reply: FastifyReply) => {
    const { path } = request.query;
    if (!path) {
      throw new VaultError(VaultErrorCode.INVALID_PATH, 'Path query parameter is required', 400);
    }

    const { plaintext, etag, stat } = await storageEngine.readFile(path);
    reply.header(HEADER_ETAG, etag);
    reply.header('content-type', 'application/octet-stream');
    reply.header('content-length', stat.size);
    return reply.send(plaintext);
  });

  // Write file (host-authorized encrypted write; strictly forbidden for remote clients or viewers)
  app.put('/api/v1/vault/write', async (request: FastifyRequest<{ Querystring: { path: string; overwrite?: string } }>, reply: FastifyReply) => {
    const session = (request as any).session;
    if (isRemoteOrProxiedRequest(request) || !session || session.role !== 'host') {
      throw new VaultError(
        VaultErrorCode.READ_ONLY_MODE,
        'Personal Vault is read-only. Remote write and file creation operations are strictly prohibited.',
        403
      );
    }

    const { path, overwrite } = request.query;
    if (!path) {
      throw new VaultError(VaultErrorCode.INVALID_PATH, 'Path query parameter is required', 400);
    }

    const ifMatch = request.headers[HEADER_IF_MATCH] as string | undefined;

    // Check if replacing an existing file without explicit overwrite authorization
    const exists = await storageEngine.stat(path).then((s) => s.type === 'file').catch(() => false);
    if (exists && overwrite !== 'true' && !ifMatch) {
      throw new VaultError(
        VaultErrorCode.ALREADY_EXISTS,
        `File "${path}" already exists in the vault. Overwriting requires explicit overwrite authorization (?overwrite=true).`,
        409
      );
    }

    // Fastify raw buffer handling
    let bodyBuffer: Buffer;
    if (Buffer.isBuffer(request.body)) {
      bodyBuffer = request.body;
    } else if (typeof request.body === 'string') {
      bodyBuffer = Buffer.from(request.body, 'utf8');
    } else if (request.body && typeof request.body === 'object') {
      bodyBuffer = Buffer.from(JSON.stringify(request.body), 'utf8');
    } else {
      bodyBuffer = Buffer.alloc(0);
    }

    const { etag, stat } = await storageEngine.writeFile(path, bodyBuffer, ifMatch);
    reply.header(HEADER_ETAG, etag);
    return reply.send(stat);
  });

  // Create directory (host-authorized only; strictly forbidden for remote clients or viewers)
  app.post('/api/v1/vault/mkdir', async (request: FastifyRequest<{ Body: { path: string } }>, reply: FastifyReply) => {
    const session = (request as any).session;
    if (isRemoteOrProxiedRequest(request) || !session || session.role !== 'host') {
      throw new VaultError(
        VaultErrorCode.READ_ONLY_MODE,
        'Personal Vault is read-only. Remote folder creation operations are strictly prohibited.',
        403
      );
    }

    const { path } = request.body || {};
    if (!path) {
      throw new VaultError(VaultErrorCode.INVALID_PATH, 'Path is required', 400);
    }
    await storageEngine.createDirectory(path);
    return reply.send({ success: true, path });
  });

  // Delete file or directory (host-authorized only; strictly forbidden for remote clients or viewers)
  app.delete('/api/v1/vault/entry', async (request: FastifyRequest<{ Querystring: { path: string; recursive?: string } }>, reply: FastifyReply) => {
    const session = (request as any).session;
    if (isRemoteOrProxiedRequest(request) || !session || session.role !== 'host') {
      throw new VaultError(
        VaultErrorCode.READ_ONLY_MODE,
        'Personal Vault is read-only. Remote deletion operations are strictly prohibited.',
        403
      );
    }

    const { path, recursive } = request.query;
    if (!path) {
      throw new VaultError(VaultErrorCode.INVALID_PATH, 'Path query parameter is required', 400);
    }
    await storageEngine.deleteEntry(path, recursive === 'true');
    return reply.send({ success: true, path });
  });

  // Rename or move (host-authorized only; strictly forbidden for remote clients or viewers)
  app.post('/api/v1/vault/rename', async (request: FastifyRequest<{ Body: { oldPath: string; newPath: string } }>, reply: FastifyReply) => {
    const session = (request as any).session;
    if (isRemoteOrProxiedRequest(request) || !session || session.role !== 'host') {
      throw new VaultError(
        VaultErrorCode.READ_ONLY_MODE,
        'Personal Vault is read-only. Remote rename and move operations are strictly prohibited.',
        403
      );
    }

    const { oldPath, newPath } = request.body || {};
    if (!oldPath || !newPath) {
      throw new VaultError(VaultErrorCode.INVALID_PATH, 'oldPath and newPath are required', 400);
    }
    await storageEngine.renameEntry(oldPath, newPath);
    return reply.send({ success: true, oldPath, newPath });
  });
}


