import { buildApp } from './app.js';
import { ConfigError, loadConfig } from './config.js';
import { cleanupExpiredDemos, ensureLocalDemoAccount, LOCAL_DEMO_EMAIL } from './demo/demo.js';
import { createStore } from './store/index.js';

const DEMO_CLEANUP_INTERVAL_MS = 30 * 60 * 1000;

async function main() {
  let config;
  try {
    config = loadConfig();
  } catch (error) {
    if (error instanceof ConfigError) {
      console.error(error.message);
      process.exit(1);
    }
    throw error;
  }

  const store = createStore(config);
  const app = await buildApp({
    config,
    store,
    logger:
      config.env === 'development'
        ? { level: config.logLevel, transport: { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss' } } }
        : { level: config.logLevel },
  });
  for (const warning of config.warnings) app.log.warn(warning);

  // OpenSearch may still be booting (docker compose) — retry init for a while.
  for (let attempt = 1; ; attempt++) {
    try {
      await store.init();
      break;
    } catch (error) {
      if (attempt >= 20) throw error;
      app.log.warn({ attempt, err: (error as Error).message }, 'store not ready, retrying in 3s');
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
  }
  app.log.info({ backend: store.backend }, 'store ready');

  if (config.demo.seedLocalAccount) {
    const { created } = await ensureLocalDemoAccount(store);
    if (created) app.log.info(`seeded local demo account ${LOCAL_DEMO_EMAIL}`);
  }

  const resumed = await app.ingest.resumePending();
  if (resumed) app.log.info({ resumed }, 'resumed pending ingest jobs');

  const cleanup = () =>
    cleanupExpiredDemos(store, app.log).catch((err: unknown) => app.log.error({ err }, 'demo cleanup failed'));
  void cleanup();
  const timer = setInterval(() => void cleanup(), DEMO_CLEANUP_INTERVAL_MS);
  timer.unref();

  await app.listen({ port: config.port, host: config.host });

  const shutdown = async (signal: string) => {
    app.log.info({ signal }, 'shutting down');
    clearInterval(timer);
    await app.close();
    await store.close();
    process.exit(0);
  };
  process.once('SIGTERM', () => void shutdown('SIGTERM'));
  process.once('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
