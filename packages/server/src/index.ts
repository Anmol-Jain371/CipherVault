import { loadConfig } from './config.js';
import { buildServer } from './server.js';
import { PROTOCOL_VERSION } from '@personal-vault/shared';

export async function startDaemon() {
  const config = loadConfig();
  console.log(`[Personal Vault Daemon] Protocol v${PROTOCOL_VERSION}`);
  console.log(`[Personal Vault Daemon] Host: ${config.host}:${config.port}`);
  console.log(`[Personal Vault Daemon] Vault Storage: ${config.storagePath}`);

  const { app, storageEngine } = buildServer(config);

  await storageEngine.ensureReady();

  try {
    await app.listen({ port: config.port, host: config.host });
    console.log(`[Personal Vault Daemon] Successfully listening at http://${config.host}:${config.port}`);
  } catch (err) {
    console.error('[Personal Vault Daemon] Failed to start server:', err);
    process.exit(1);
  }

  // Graceful shutdown
  const shutdown = async () => {
    console.log('\n[Personal Vault Daemon] Shutting down cleanly...');
    await app.close();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  return { app, config };
}

if (process.argv[1]?.endsWith('index.js')) {
  startDaemon();
}
