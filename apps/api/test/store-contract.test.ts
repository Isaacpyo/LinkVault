import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { normalizeUrl, searchQuerySchema, type SearchQueryInput } from '@linkvault/shared';
import { seedLibrary } from '../src/demo/demo.js';
import { DuplicateError } from '../src/errors.js';
import { HIGHLIGHT_PRE } from '../src/store/highlight.js';
import { bookmarkIdFor, newId } from '../src/store/ids.js';
import { MemoryStore } from '../src/store/memory.js';
import { OpenSearchStore } from '../src/store/opensearch.js';
import type { BookmarkRecord, Store, UserRecord } from '../src/store/types.js';

/**
 * The same behavioural contract, run against every backend. CI provides an
 * OpenSearch service container through OPENSEARCH_TEST_URL; locally the
 * OpenSearch run happens when that variable is set (e.g. with docker compose up opensearch).
 */
interface Backend {
  name: string;
  create(): Promise<{ store: Store; cleanup(): Promise<void> }>;
}

const backends: Backend[] = [
  {
    name: 'memory',
    create: async () => ({ store: new MemoryStore(), cleanup: async () => {} }),
  },
];

const testUrl = process.env.OPENSEARCH_TEST_URL;
if (testUrl) {
  backends.push({
    name: 'opensearch',
    create: async () => {
      const prefix = `lvtest-${randomBytes(4).toString('hex')}`;
      const store = new OpenSearchStore({ url: testUrl, indexPrefix: prefix, replicas: 0 });
      await store.init();
      await store.init(); // idempotent
      return {
        store,
        cleanup: async () => {
          await store.client.indices.delete({ index: `${prefix}-*` });
          await store.close();
        },
      };
    },
  });
}

const user = (overrides: Partial<UserRecord> = {}): UserRecord => ({
  id: newId(),
  email: `${randomBytes(4).toString('hex')}@example.com`,
  name: null,
  passwordHash: 'x',
  isDemo: false,
  demoExpiresAt: null,
  createdAt: new Date().toISOString(),
  ...overrides,
});

const q = (input: SearchQueryInput = {}) => searchQuerySchema.parse(input);

describe.each(backends)('$name store', (backend) => {
  let store: Store;
  let cleanup: () => Promise<void>;
  const alice = user({ email: 'alice@example.com' });
  const bob = user({ email: 'bob@example.com' });

  beforeAll(async () => {
    ({ store, cleanup } = await backend.create());
    await store.createUser(alice);
    await store.createUser(bob);
    await seedLibrary(store, alice.id);
    await seedLibrary(store, bob.id);
  });

  afterAll(async () => {
    await cleanup();
  });

  describe('users', () => {
    it('enforces unique emails case-insensitively', async () => {
      await expect(store.createUser(user({ email: 'alice@example.com' }))).rejects.toBeInstanceOf(DuplicateError);
      await expect(store.createUser(user({ email: 'ALICE@example.com' }))).rejects.toBeInstanceOf(DuplicateError);
    });

    it('finds users by email and id', async () => {
      expect((await store.findUserByEmail('Alice@Example.com'))?.id).toBe(alice.id);
      expect((await store.getUser(bob.id))?.email).toBe('bob@example.com');
      expect(await store.getUser(newId())).toBeNull();
    });

    it('lists expired demo users and deletes all of their data', async () => {
      const expired = user({ isDemo: true, demoExpiresAt: new Date(Date.now() - 60_000).toISOString() });
      const active = user({ isDemo: true, demoExpiresAt: new Date(Date.now() + 3_600_000).toISOString() });
      await store.createUser(expired);
      await store.createUser(active);
      await seedLibrary(store, expired.id);

      const found = await store.listExpiredDemoUsers(new Date(), 50);
      expect(found.map((u) => u.id)).toEqual([expired.id]);

      await store.deleteUserData(expired.id);
      expect(await store.getUser(expired.id)).toBeNull();
      expect((await store.summary(expired.id)).total).toBe(0);
      expect(await store.listCollections(expired.id)).toEqual([]);
      expect(await store.findUserByEmail(expired.email)).toBeNull();
    });
  });

  describe('search', () => {
    it('finds documents by full text with highlighted snippets', async () => {
      const result = await store.searchBookmarks(alice.id, q({ q: 'service worker' }));
      expect(result.total).toBeGreaterThan(0);
      const top = result.hits[0]!;
      expect(top.bookmark.title).toBe('Service Worker API');
      expect(top.highlights.content.join(' ')).toContain(HIGHLIGHT_PRE);
      expect(top.bookmark).not.toHaveProperty('content');
      expect(top.bookmark).not.toHaveProperty('contentHtml');
    });

    it('stems English words', async () => {
      const result = await store.searchBookmarks(alice.id, q({ q: 'highlighters' }));
      expect(result.hits.map((h) => h.bookmark.title)).toContain('Highlighting search results');
    });

    it('requires all terms and supports exclusion', async () => {
      const both = await store.searchBookmarks(alice.id, q({ q: 'service worker flamingo' }));
      expect(both.total).toBe(0);
      const excluded = await store.searchBookmarks(alice.id, q({ q: 'cache -worker' }));
      expect(excluded.hits.map((h) => h.bookmark.title)).not.toContain('Service Worker API');
    });

    it('never returns another user’s bookmarks', async () => {
      const result = await store.searchBookmarks(alice.id, q({ pageSize: 50 }));
      expect(result.total).toBe(14);
      expect(result.hits.every((h) => h.bookmark.userId === alice.id)).toBe(true);
    });

    it('AND-s tag filters and returns facets for the result set', async () => {
      const search = await store.searchBookmarks(alice.id, q({ tags: 'search' }));
      expect(search.total).toBe(3);
      const both = await store.searchBookmarks(alice.id, q({ tags: ['search', 'ranking'] }));
      expect(both.hits.map((h) => h.bookmark.title)).toEqual(['Okapi BM25']);
      expect(search.tagFacets[0]).toEqual({ tag: 'search', count: 3 });
    });

    it('filters by collection, unsorted, read later and status', async () => {
      const [design] = (await store.listCollections(alice.id)).filter((c) => c.name === 'Design & UX');
      const inDesign = await store.searchBookmarks(alice.id, q({ collectionId: design!.id }));
      expect(inDesign.total).toBe(3);
      const unsorted = await store.searchBookmarks(alice.id, q({ collectionId: 'none' }));
      expect(unsorted.total).toBe(4);
      const readLater = await store.searchBookmarks(alice.id, q({ readLater: 'true' }));
      expect(readLater.total).toBe(3);
      const pending = await store.searchBookmarks(alice.id, q({ status: 'pending' }));
      expect(pending.total).toBe(0);
    });

    it('sorts by date and paginates', async () => {
      const newest = await store.searchBookmarks(alice.id, q({ pageSize: 5 }));
      expect(newest.total).toBe(14);
      expect(newest.hits).toHaveLength(5);
      expect(newest.hits[0]!.bookmark.title).toBe('You Might Not Need an Effect');
      const page3 = await store.searchBookmarks(alice.id, q({ pageSize: 5, page: 3 }));
      expect(page3.hits).toHaveLength(4);
      const oldest = await store.searchBookmarks(alice.id, q({ sort: 'oldest', pageSize: 1 }));
      expect(oldest.hits[0]!.bookmark.title).toContain('Twelve-Factor');
    });

    it('summarizes the library', async () => {
      const summary = await store.summary(alice.id);
      expect(summary).toMatchObject({ total: 14, readLater: 3, pending: 0, unsorted: 4 });
      expect(Object.values(summary.collectionCounts).sort()).toEqual([3, 3, 4]);
      expect(summary.tags.find((t) => t.tag === 'search')?.count).toBe(3);
    });
  });

  describe('mutations', () => {
    const url = 'https://example.com/contract-test';
    let record: BookmarkRecord;

    beforeAll(async () => {
      const now = new Date().toISOString();
      record = {
        id: bookmarkIdFor(alice.id, normalizeUrl(url)),
        userId: alice.id,
        url,
        normalizedUrl: normalizeUrl(url),
        domain: 'example.com',
        title: 'example.com',
        customTitle: false,
        excerpt: null,
        content: null,
        contentHtml: null,
        siteName: null,
        byline: null,
        lang: null,
        tags: ['temp'],
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
      };
      await store.putBookmark(record);
    });

    it('lists pending bookmarks for recovery', async () => {
      const pending = await store.listPendingBookmarks(10);
      expect(pending.map((b) => b.id)).toContain(record.id);
    });

    it('patches only the owner’s bookmark and makes new text searchable', async () => {
      expect(await store.patchBookmark(bob.id, record.id, { title: 'hijacked' })).toBeNull();
      const updated = await store.patchBookmark(alice.id, record.id, {
        title: 'Flamingo field guide',
        content: 'Flamingos balance on one leg to conserve heat.',
        status: 'ready',
      });
      expect(updated).toMatchObject({ title: 'Flamingo field guide', status: 'ready', tags: ['temp'] });
      const found = await store.searchBookmarks(alice.id, q({ q: 'flamingo' }));
      expect(found.hits.map((h) => h.bookmark.id)).toEqual([record.id]);
    });

    it('deleting a collection moves its bookmarks to unsorted', async () => {
      const [frontend] = (await store.listCollections(alice.id)).filter((c) => c.name === 'Frontend');
      expect(await store.deleteCollection(bob.id, frontend!.id)).toBe(false);
      expect(await store.deleteCollection(alice.id, frontend!.id)).toBe(true);
      expect(await store.getCollection(alice.id, frontend!.id)).toBeNull();
      const unsorted = await store.searchBookmarks(alice.id, q({ collectionId: 'none' }));
      expect(unsorted.total).toBe(4 + 3 + 1);
    });

    it('deletes only the owner’s bookmark', async () => {
      expect(await store.deleteBookmark(bob.id, record.id)).toBe(false);
      expect(await store.deleteBookmark(alice.id, record.id)).toBe(true);
      expect(await store.getBookmark(alice.id, record.id)).toBeNull();
    });
  });
});
