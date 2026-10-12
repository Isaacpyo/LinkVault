import type { FastifyInstance } from 'fastify';
import type { AuthResponse } from '@linkvault/shared';
import { buildApp } from '../src/app.js';
import { loadConfig, type Config } from '../src/config.js';
import { FetchError, type FetchedPage, type PageFetcher } from '../src/ingest/fetcher.js';
import { MemoryStore } from '../src/store/memory.js';
import type { Store } from '../src/store/types.js';

export function testConfig(env: Record<string, string> = {}): Config {
  return loadConfig({
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    JWT_SECRET: 'test-secret-that-is-at-least-32-characters-long',
    SEARCH_BACKEND: 'memory',
    ...env,
  });
}

type FakeResponse = { html: string; contentType?: string } | { error: FetchError };

/** In-memory PageFetcher: maps URLs to canned responses and records calls. */
export class FakeFetcher implements PageFetcher {
  readonly calls: string[] = [];
  constructor(private readonly pages: Record<string, FakeResponse> = {}) {}

  set(url: string, response: FakeResponse) {
    this.pages[url] = response;
  }

  async fetch(url: string): Promise<FetchedPage> {
    this.calls.push(url);
    const page = this.pages[url];
    if (!page) throw new FetchError('The site responded with HTTP 404', false);
    if ('error' in page) throw page.error;
    return { body: Buffer.from(page.html), contentType: page.contentType ?? 'text/html; charset=utf-8', finalUrl: url };
  }
}

export interface TestApp {
  app: FastifyInstance;
  store: Store;
  fetcher: FakeFetcher;
}

export async function createTestApp(
  options: { store?: Store; fetcher?: FakeFetcher; env?: Record<string, string> } = {},
): Promise<TestApp> {
  const store = options.store ?? new MemoryStore();
  const fetcher = options.fetcher ?? new FakeFetcher();
  await store.init();
  const app = await buildApp({
    config: testConfig(options.env),
    store,
    fetcher,
    logger: false,
    ingest: { retryDelayMs: 0 },
  });
  await app.ready();
  return { app, store, fetcher };
}

export async function register(
  app: FastifyInstance,
  email = `user-${Math.random().toString(36).slice(2)}@example.com`,
) {
  const res = await app.inject({
    method: 'POST',
    url: '/auth/register',
    payload: { email, password: 'correct horse battery' },
  });
  if (res.statusCode !== 201) throw new Error(`register failed: ${res.body}`);
  const body = res.json<AuthResponse>();
  return { ...body, headers: { authorization: `Bearer ${body.token}` } };
}

export const articleHtml = (title: string, body: string) =>
  `<!doctype html><html lang="en"><head><title>${title}</title></head><body><article><h1>${title}</h1>${body
    .split('\n\n')
    .map((p) => `<p>${p}</p>`)
    .join('')}</article></body></html>`;

/** Paragraphs long enough for Readability to treat them as an article. */
export const longParagraphs = (topic: string) =>
  [
    `This article explains ${topic} in depth, starting with the fundamentals and building towards practical advice that teams can apply to production systems without much ceremony.`,
    `The second section covers trade-offs around ${topic}, including performance, operability and the hidden costs that only show up once real users depend on the feature every day.`,
    `Finally we look at testing ${topic}, how to keep the feedback loop fast, and how to recognise when an abstraction has stopped paying for itself and should be removed.`,
  ].join('\n\n');
