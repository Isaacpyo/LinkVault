import { errors } from '@opensearch-project/opensearch';
import type { FastifyBaseLogger } from 'fastify';
import { describe, expect, it } from 'vitest';
import { MemoryStore } from '../store/memory.js';
import type { BookmarkRecord } from '../store/types.js';
import { FetchError, type FetchedPage, type PageFetcher } from './fetcher.js';
import { IngestService } from './service.js';

const silent = { info() {}, warn() {}, error() {}, debug() {}, child: () => silent } as unknown as FastifyBaseLogger;

const page = (title: string): FetchedPage => ({
  body: Buffer.from(
    `<html><head><title>${title}</title></head><body><article><h1>${title}</h1><p>${'Readable paragraph text about indexing. '.repeat(20)}</p></article></body></html>`,
  ),
  contentType: 'text/html',
  finalUrl: 'https://example.com/a',
});

function bookmark(overrides: Partial<BookmarkRecord> = {}): BookmarkRecord {
  const now = new Date().toISOString();
  return {
    id: 'b1',
    userId: 'u1',
    url: 'https://example.com/a',
    normalizedUrl: 'https://example.com/a',
    domain: 'example.com',
    title: 'example.com',
    customTitle: false,
    excerpt: null,
    content: null,
    contentHtml: null,
    siteName: null,
    byline: null,
    lang: null,
    tags: [],
    collectionId: null,
    readLater: false,
    status: 'pending',
    error: null,
    wordCount: null,
    readingMinutes: null,
    attempts: 0,
    createdAt: now,
    updatedAt: now,
    fetchedAt: null,
    ...overrides,
  };
}

describe('IngestService', () => {
  it('keeps a title the user set while the page was being fetched', async () => {
    const store = new MemoryStore();
    await store.putBookmark(bookmark());
    let release!: () => void;
    const fetcher: PageFetcher = {
      fetch: () => new Promise((resolve) => (release = () => resolve(page('Page title')))),
    };
    const service = new IngestService(store, fetcher, silent, { concurrency: 1, retryDelayMs: 0 });
    const running = service.process({ bookmarkId: 'b1', userId: 'u1' });
    await new Promise((resolve) => setTimeout(resolve, 5));
    await store.patchBookmark('u1', 'b1', { title: 'My own title', customTitle: true });
    release();
    await running;
    expect(await store.getBookmark('u1', 'b1')).toMatchObject({ title: 'My own title', status: 'ready' });
  });

  it('retries when the search cluster is briefly unreachable', async () => {
    const store = new MemoryStore();
    await store.putBookmark(bookmark());
    let failures = 1;
    const original = store.getBookmark.bind(store);
    store.getBookmark = async (...args) => {
      if (failures-- > 0) throw new errors.ConnectionError('connect ECONNREFUSED');
      return original(...args);
    };
    const service = new IngestService(store, { fetch: async () => page('Recovered') }, silent, {
      concurrency: 1,
      retryDelayMs: 0,
    });
    await service.process({ bookmarkId: 'b1', userId: 'u1' });
    expect(await original('u1', 'b1')).toMatchObject({ title: 'Recovered', status: 'ready' });
  });

  it('marks permanent failures with a readable reason', async () => {
    const store = new MemoryStore();
    await store.putBookmark(bookmark());
    const service = new IngestService(
      store,
      {
        fetch: async () =>
          Promise.reject(new FetchError('Only web pages can be extracted (this is application/pdf)', false)),
      },
      silent,
      { concurrency: 1, retryDelayMs: 0 },
    );
    await service.process({ bookmarkId: 'b1', userId: 'u1' });
    expect(await store.getBookmark('u1', 'b1')).toMatchObject({
      status: 'failed',
      error: 'Only web pages can be extracted (this is application/pdf)',
    });
  });
});
