import type { FastifyInstance } from 'fastify';
import type { HealthResponse } from '@linkvault/shared';
import { VERSION } from '../version.js';
import type { RouteContext } from './context.js';

export function healthRoutes(app: FastifyInstance, { store, startedAt }: RouteContext) {
  app.get('/', async () => ({ name: 'LinkVault API', version: VERSION, health: '/health' }));

  // Always 200 so the platform health check (liveness) does not restart the
  // service when only the search cluster is down; `status` reports degradation.
  app.get('/health', { config: { rateLimit: false } }, async (): Promise<HealthResponse> => {
    const up = await store.ping();
    return {
      status: up ? 'ok' : 'degraded',
      backend: store.backend,
      persistent: store.persistent,
      search: up ? 'up' : 'down',
      version: VERSION,
      uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
    };
  });
}
