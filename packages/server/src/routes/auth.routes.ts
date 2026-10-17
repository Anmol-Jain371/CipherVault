import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { AuthService } from '../auth/auth.service.js';
import { VaultError, VaultErrorCode } from '@personal-vault/shared';

interface LoginBody {
  password: string;
}

interface InitBody {
  password: string;
}

export function isRemoteOrProxiedRequest(request: FastifyRequest): boolean {
  // If request contains Cloudflare proxy headers, it was received via tunnel
  if (request.headers['cf-connecting-ip'] || request.headers['cf-ray']) {
    return true;
  }
  // Check client IP (if trustProxy resolved x-forwarded-for from cloudflared)
  const ip = request.ip;
  const isLoopbackIp = ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
  if (!isLoopbackIp) {
    return true;
  }
  // Check underlying socket remote address directly
  const socketAddr = request.raw.socket.remoteAddress;
  const isSocketLoopback = !socketAddr || socketAddr === '127.0.0.1' || socketAddr === '::1' || socketAddr === '::ffff:127.0.0.1';
  if (!isSocketLoopback) {
    return true;
  }
  return false;
}

export function registerAuthRoutes(app: FastifyInstance, authService: AuthService) {
  // Check status (public endpoint)
  app.get('/api/v1/auth/status', async (request: FastifyRequest, reply: FastifyReply) => {
    const initialized = await authService.isInitialized();
    const authHeader = request.headers.authorization;
    let authenticated = false;
    let expiresAt: number | undefined;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.slice(7).trim();
      try {
        const session = authService.authenticateToken(token);
        authenticated = true;
        expiresAt = session.expiresAt;
      } catch {
        authenticated = false;
      }
    }

    return reply.send({
      vaultInitialized: initialized,
      authenticated,
      expiresAt,
    });
  });

  // Initialize vault with master password (only permitted from local host machine)
  app.post('/api/v1/auth/init', async (request: FastifyRequest<{ Body: InitBody }>, reply: FastifyReply) => {
    if (isRemoteOrProxiedRequest(request)) {
      throw new VaultError(
        VaultErrorCode.UNAUTHORIZED,
        'Vault initialization is restricted to local connections on the host machine only. Remote initialization over tunnels is prohibited.',
        403
      );
    }

    const body = request.body;
    if (!body || !body.password) {
      throw new VaultError(VaultErrorCode.INVALID_CREDENTIALS, 'Master password is required', 400);
    }

    const session = await authService.initializeVault(body.password);
    return reply.send({
      token: session.token,
      expiresAt: session.expiresAt,
      idleTimeoutMs: authService.getIdleTimeoutMs(),
    });
  });

  // Login / unlock vault with master password
  app.post('/api/v1/auth/login', async (request: FastifyRequest<{ Body: LoginBody }>, reply: FastifyReply) => {
    const body = request.body;
    if (!body || !body.password) {
      throw new VaultError(VaultErrorCode.INVALID_CREDENTIALS, 'Master password is required', 400);
    }

    const cfIp = request.headers['cf-connecting-ip'];
    const clientIp = typeof cfIp === 'string' && cfIp.trim() !== '' ? cfIp.trim() : (request.ip || '127.0.0.1');
    const session = await authService.login(body.password, clientIp);

    return reply.send({
      token: session.token,
      expiresAt: session.expiresAt,
      idleTimeoutMs: authService.getIdleTimeoutMs(),
    });
  });

  // Logout / revoke session
  app.post('/api/v1/auth/logout', async (request: FastifyRequest, reply: FastifyReply) => {
    const authHeader = request.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.slice(7).trim();
      authService.logout(token);
    }
    return reply.send({ success: true, message: 'Session terminated' });
  });

  // Explicitly lock the vault and drop all active sessions (Requires authentication)
  app.post('/api/v1/auth/lock', async (request: FastifyRequest, reply: FastifyReply) => {
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new VaultError(VaultErrorCode.UNAUTHORIZED, 'Missing or malformed Authorization header', 401);
    }
    const token = authHeader.slice(7).trim();
    authService.authenticateToken(token);

    authService.lockAll();
    return reply.send({ success: true, message: 'Vault locked cleanly' });
  });
}
