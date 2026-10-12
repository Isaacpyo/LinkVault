import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end smoke test of the main flow. Playwright starts three servers:
 * a fixture site, the API (built) and the web app (built, served by vite preview).
 * The API uses the in-memory store unless E2E_OPENSEARCH_URL is set (CI sets it).
 */
const API_PORT = 4310;
const WEB_PORT = 4311;
const FIXTURE_PORT = 4312;
const opensearch = process.env.E2E_OPENSEARCH_URL;

export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: Boolean(process.env.CI),
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'node e2e/fixtures/server.mjs',
      port: FIXTURE_PORT,
      env: { FIXTURE_PORT: String(FIXTURE_PORT) },
    },
    {
      command: 'npm run build -w @linkvault/api && node apps/api/dist/server.js',
      url: `http://localhost:${API_PORT}/health`,
      timeout: 120_000,
      env: {
        NODE_ENV: 'test',
        PORT: String(API_PORT),
        LOG_LEVEL: 'warn',
        JWT_SECRET: 'e2e-secret-that-is-at-least-32-characters',
        CORS_ORIGINS: `http://localhost:${WEB_PORT}`,
        ALLOW_PRIVATE_FETCH: 'true',
        ...(opensearch
          ? { SEARCH_BACKEND: 'opensearch', OPENSEARCH_URL: opensearch, OPENSEARCH_INDEX_PREFIX: `e2e-${Date.now()}` }
          : { SEARCH_BACKEND: 'memory' }),
      },
    },
    {
      command: `npm run build -w @linkvault/web && npm run preview -w @linkvault/web -- --port ${WEB_PORT} --strictPort`,
      url: `http://localhost:${WEB_PORT}`,
      timeout: 120_000,
      env: { VITE_API_URL: `http://localhost:${API_PORT}` },
    },
  ],
});

export const FIXTURE_URL = `http://127.0.0.1:${FIXTURE_PORT}`;
