import { z } from 'zod';

const DEV_JWT_SECRET = 'dev-only-insecure-secret-change-me-0123456789';

const boolish = z
  .enum(['true', 'false', '1', '0', ''])
  .optional()
  .transform((value) => value === 'true' || value === '1');

const csv = z
  .string()
  .optional()
  .transform((value) =>
    (value ?? '')
      .split(',')
      .map((item) => item.trim().replace(/\/$/, ''))
      .filter(Boolean),
  );

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  HOST: z.string().default('0.0.0.0'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  TRUST_PROXY: boolish,

  JWT_SECRET: z.string().optional(),
  JWT_TTL: z.string().default('7d'),

  CORS_ORIGINS: csv,
  ALLOW_EXTENSION_ORIGINS: z
    .enum(['true', 'false'])
    .default('true')
    .transform((value) => value === 'true'),

  SEARCH_BACKEND: z.enum(['opensearch', 'memory']).optional(),
  OPENSEARCH_URL: z.string().url().optional(),
  OPENSEARCH_INDEX_PREFIX: z
    .string()
    .regex(/^[a-z0-9][a-z0-9_-]*$/, 'lower-case letters, digits, - and _ only')
    .default('linkvault'),
  OPENSEARCH_REPLICAS: z.coerce.number().int().min(0).max(5).default(0),

  ALLOW_PRIVATE_FETCH: boolish,
  FETCH_TIMEOUT_MS: z.coerce.number().int().min(1000).max(60_000).default(10_000),
  FETCH_MAX_BYTES: z.coerce.number().int().min(100_000).max(20_000_000).default(5_000_000),
  INGEST_CONCURRENCY: z.coerce.number().int().min(1).max(8).default(2),

  DEMO_ENABLED: z
    .enum(['true', 'false'])
    .default('true')
    .transform((value) => value === 'true'),
  DEMO_TTL_HOURS: z.coerce
    .number()
    .min(1)
    .max(24 * 30)
    .default(24),
  SEED_LOCAL_DEMO_ACCOUNT: boolish,
});

export interface Config {
  env: 'development' | 'test' | 'production';
  port: number;
  host: string;
  logLevel: string;
  trustProxy: boolean;
  jwtSecret: string;
  jwtTtl: string;
  corsOrigins: string[];
  allowExtensionOrigins: boolean;
  backend: 'opensearch' | 'memory';
  opensearch: { url: string; indexPrefix: string; replicas: number } | null;
  fetch: { allowPrivate: boolean; timeoutMs: number; maxBytes: number };
  ingestConcurrency: number;
  demo: { enabled: boolean; ttlHours: number; seedLocalAccount: boolean };
  warnings: string[];
}

export class ConfigError extends Error {}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  // `KEY=` lines in .env files mean "not set".
  const defined = Object.fromEntries(Object.entries(env).filter(([, value]) => value !== undefined && value !== ''));
  const parsed = envSchema.safeParse(defined);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => `  ${issue.path.join('.')}: ${issue.message}`).join('\n');
    throw new ConfigError(`Invalid environment:\n${issues}`);
  }
  const e = parsed.data;
  const warnings: string[] = [];
  const isProd = e.NODE_ENV === 'production';

  let jwtSecret = e.JWT_SECRET;
  if (!jwtSecret) {
    if (isProd) throw new ConfigError('JWT_SECRET is required in production');
    jwtSecret = DEV_JWT_SECRET;
    warnings.push('JWT_SECRET not set: using an insecure development secret.');
  } else if (jwtSecret.length < 32) {
    throw new ConfigError('JWT_SECRET must be at least 32 characters');
  }

  const backend = e.SEARCH_BACKEND ?? (e.OPENSEARCH_URL ? 'opensearch' : 'memory');
  if (backend === 'opensearch' && !e.OPENSEARCH_URL) {
    throw new ConfigError('SEARCH_BACKEND=opensearch requires OPENSEARCH_URL');
  }
  if (backend === 'memory') {
    warnings.push('Using the in-memory store: data is lost when the process restarts. Set OPENSEARCH_URL to persist.');
  }
  if (e.ALLOW_PRIVATE_FETCH) {
    warnings.push(
      'ALLOW_PRIVATE_FETCH is on: the page fetcher can reach private networks. Never enable in production.',
    );
  }

  const corsOrigins = e.CORS_ORIGINS.length ? e.CORS_ORIGINS : ['http://localhost:5173', 'http://localhost:4173'];

  return {
    env: e.NODE_ENV,
    port: e.PORT,
    host: e.HOST,
    logLevel: e.LOG_LEVEL,
    trustProxy: e.TRUST_PROXY,
    jwtSecret,
    jwtTtl: e.JWT_TTL,
    corsOrigins,
    allowExtensionOrigins: e.ALLOW_EXTENSION_ORIGINS,
    backend,
    opensearch:
      backend === 'opensearch' && e.OPENSEARCH_URL
        ? { url: e.OPENSEARCH_URL, indexPrefix: e.OPENSEARCH_INDEX_PREFIX, replicas: e.OPENSEARCH_REPLICAS }
        : null,
    fetch: { allowPrivate: e.ALLOW_PRIVATE_FETCH, timeoutMs: e.FETCH_TIMEOUT_MS, maxBytes: e.FETCH_MAX_BYTES },
    ingestConcurrency: e.INGEST_CONCURRENCY,
    demo: { enabled: e.DEMO_ENABLED, ttlHours: e.DEMO_TTL_HOURS, seedLocalAccount: e.SEED_LOCAL_DEMO_ACCOUNT },
    warnings,
  };
}
