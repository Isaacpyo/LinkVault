import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import Fastify, { type FastifyBaseLogger, type FastifyInstance, type FastifyServerOptions } from 'fastify';
import { InvalidUrlError, type ApiErrorBody } from '@linkvault/shared';
import { requireAuth } from './auth/plugin.js';
import { TokenService } from './auth/tokens.js';
import type { Config } from './config.js';
import { AppError } from './errors.js';
import { HttpPageFetcher, type PageFetcher } from './ingest/fetcher.js';
import { IngestService } from './ingest/service.js';
import { isSearchUnavailableError } from './store/opensearch.js';
import type { Store } from './store/types.js';
import { authRoutes } from './routes/auth.js';
import { bookmarkRoutes } from './routes/bookmarks.js';
import { collectionRoutes } from './routes/collections.js';
import type { RouteContext } from './routes/context.js';
import { healthRoutes } from './routes/health.js';

export interface AppOptions {
  config: Config;
  store: Store;
  /** Override the HTTP fetcher (tests). */
  fetcher?: PageFetcher;
  logger?: FastifyServerOptions['logger'] | FastifyBaseLogger;
  ingest?: { retryDelayMs?: number };
}

declare module 'fastify' {
  interface FastifyInstance {
    ingest: IngestService;
  }
}

const errorBody = (code: string, message: string, details?: unknown): ApiErrorBody => ({
  error: { code, message, ...(details !== undefined && { details }) },
});

export async function buildApp(options: AppOptions): Promise<FastifyInstance> {
  const { config, store } = options;
  const loggerOption =
    options.logger && typeof options.logger === 'object' && 'child' in options.logger
      ? { loggerInstance: options.logger as FastifyBaseLogger }
      : { logger: options.logger ?? { level: config.logLevel } };

  const app = Fastify({
    ...loggerOption,
    trustProxy: config.trustProxy,
    bodyLimit: 1024 * 1024,
  });

  const fetcher = options.fetcher ?? new HttpPageFetcher(config.fetch);
  const ingest = new IngestService(store, fetcher, app.log, {
    concurrency: config.ingestConcurrency,
    ...(options.ingest?.retryDelayMs !== undefined && { retryDelayMs: options.ingest.retryDelayMs }),
  });
  app.decorate('ingest', ingest);
  app.decorateRequest('auth', null);

  await app.register(cors, {
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      const allowed =
        config.corsOrigins.includes(origin) ||
        (config.allowExtensionOrigins && origin.startsWith('chrome-extension://'));
      callback(null, allowed);
    },
    methods: ['GET', 'POST', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    maxAge: 86_400,
  });

  await app.register(rateLimit, {
    max: 300,
    timeWindow: '1 minute',
    errorResponseBuilder: (_request, context) =>
      new AppError(429, 'RATE_LIMITED', `Too many requests. Try again in ${context.after}.`),
  });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof AppError) {
      return reply.code(error.statusCode).send(errorBody(error.code, error.message, error.details));
    }
    if (error instanceof InvalidUrlError) return reply.code(400).send(errorBody('VALIDATION_ERROR', error.message));
    if (isSearchUnavailableError(error)) {
      request.log.error({ err: error }, 'search backend unavailable');
      return reply
        .code(503)
        .send(errorBody('SERVICE_UNAVAILABLE', 'Search is temporarily unavailable. Try again shortly.'));
    }
    const status = (error as { statusCode?: number }).statusCode;
    if (status === 413) return reply.code(413).send(errorBody('PAYLOAD_TOO_LARGE', 'Request body is too large'));
    if (status && status >= 400 && status < 500) {
      return reply.code(status).send(errorBody('BAD_REQUEST', (error as Error).message));
    }
    request.log.error({ err: error }, 'unhandled error');
    return reply.code(500).send(errorBody('INTERNAL', 'Something went wrong on our side'));
  });

  app.setNotFoundHandler((request, reply) =>
    reply.code(404).send(errorBody('NOT_FOUND', `Route ${request.method} ${request.url} not found`)),
  );

  const context: RouteContext = {
    config,
    store,
    tokens: new TokenService(config.jwtSecret, config.jwtTtl),
    ingest,
    startedAt: Date.now(),
  };

  healthRoutes(app, context);
  authRoutes(app, context);
  await app.register(async (scope) => {
    scope.addHook('onRequest', requireAuth(context.tokens));
    bookmarkRoutes(scope, context);
    collectionRoutes(scope, context);
  });

  app.addHook('onClose', async () => {
    await ingest.queue.stop();
    if (fetcher instanceof HttpPageFetcher) await fetcher.close();
  });

  return app;
}
