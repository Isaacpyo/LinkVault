import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type {
  ApiErrorBody,
  AuthResponse,
  Collection,
  HealthResponse,
  LibrarySummary,
  ReaderContent,
  SaveBookmarkResponse,
  SearchResponse,
} from '@linkvault/shared';
import { FetchError } from '../src/ingest/fetcher.js';
import { articleHtml, createTestApp, longParagraphs, register, type TestApp } from './helpers.js';

let t: TestApp;

beforeEach(async () => {
  t = await createTestApp();
});

afterEach(async () => {
  await t.app.close();
});

const settle = () => t.app.ingest.queue.onIdle();

describe('health', () => {
  it('reports backend and persistence', async () => {
    const res = await t.app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json<HealthResponse>()).toMatchObject({
      status: 'ok',
      backend: 'memory',
      persistent: false,
      search: 'up',
    });
  });

  it('returns a JSON 404 for unknown routes', async () => {
    const res = await t.app.inject({ method: 'GET', url: '/nope' });
    expect(res.statusCode).toBe(404);
    expect(res.json<ApiErrorBody>().error.code).toBe('NOT_FOUND');
  });
});

describe('auth', () => {
  it('registers, logs in and returns the current user', async () => {
    const reg = await t.app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email: 'Ada@Example.com', password: 'correct horse battery', name: 'Ada' },
    });
    expect(reg.statusCode).toBe(201);
    expect(reg.json<AuthResponse>().user).toMatchObject({ email: 'ada@example.com', name: 'Ada', isDemo: false });

    const login = await t.app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'ada@example.com', password: 'correct horse battery' },
    });
    expect(login.statusCode).toBe(200);
    const { token } = login.json<AuthResponse>();

    const me = await t.app.inject({ method: 'GET', url: '/auth/me', headers: { authorization: `Bearer ${token}` } });
    expect(me.json<{ user: { email: string } }>().user.email).toBe('ada@example.com');
  });

  it('rejects duplicate emails, bad passwords and invalid input', async () => {
    await register(t.app, 'dup@example.com');
    const dup = await t.app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email: 'dup@example.com', password: 'another password' },
    });
    expect(dup.statusCode).toBe(409);

    const wrong = await t.app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'dup@example.com', password: 'wrong password' },
    });
    expect(wrong.statusCode).toBe(401);
    const unknown = await t.app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'nobody@example.com', password: 'whatever1' },
    });
    expect(unknown.json<ApiErrorBody>().error.message).toBe(wrong.json<ApiErrorBody>().error.message);

    const invalid = await t.app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email: 'not-an-email', password: 'x' },
    });
    expect(invalid.statusCode).toBe(400);
    const body = invalid.json<ApiErrorBody>();
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.details).toMatchObject({ fields: { email: expect.any(String), password: expect.any(String) } });
  });

  it('requires a valid bearer token on protected routes', async () => {
    expect((await t.app.inject({ method: 'GET', url: '/bookmarks' })).statusCode).toBe(401);
    const forged = await t.app.inject({
      method: 'GET',
      url: '/bookmarks',
      headers: { authorization: 'Bearer abc.def.ghi' },
    });
    expect(forged.statusCode).toBe(401);
    expect(forged.json<ApiErrorBody>().error.code).toBe('UNAUTHORIZED');
  });

  it('creates an isolated, seeded, expiring demo sandbox', async () => {
    const res = await t.app.inject({ method: 'POST', url: '/auth/demo' });
    expect(res.statusCode).toBe(201);
    const { token, user } = res.json<AuthResponse>();
    expect(user.isDemo).toBe(true);
    expect(new Date(user.demoExpiresAt!).getTime()).toBeGreaterThan(Date.now());

    const headers = { authorization: `Bearer ${token}` };
    const summary = (await t.app.inject({ method: 'GET', url: '/library/summary', headers })).json<LibrarySummary>();
    expect(summary.total).toBe(14);

    // A second visitor gets their own sandbox.
    const other = (await t.app.inject({ method: 'POST', url: '/auth/demo' })).json<AuthResponse>();
    expect(other.user.id).not.toBe(user.id);

    // Demo accounts cannot be entered with a password.
    const login = await t.app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: user.email, password: 'anything-at-all' },
    });
    expect(login.statusCode).toBe(401);
  });
});

describe('bookmarks', () => {
  it('saves a URL, extracts it in the background and makes it searchable', async () => {
    const { headers } = await register(t.app);
    t.fetcher.set('https://example.com/post?utm_source=newsletter', {
      html: articleHtml('Caching strategies', longParagraphs('flamingo caching')),
    });

    const res = await t.app.inject({
      method: 'POST',
      url: '/bookmarks',
      headers,
      payload: { url: 'https://example.com/post?utm_source=newsletter', tags: ['Web', '#perf'] },
    });
    expect(res.statusCode).toBe(201);
    const saved = res.json<SaveBookmarkResponse>();
    expect(saved).toMatchObject({
      created: true,
      bookmark: { status: 'pending', tags: ['web', 'perf'], domain: 'example.com' },
    });

    await settle();
    // The original URL is fetched (some sites need their query string); dedupe uses the normalized form.
    expect(t.fetcher.calls).toEqual(['https://example.com/post?utm_source=newsletter']);

    const found = await t.app.inject({ method: 'GET', url: '/bookmarks?q=flamingo', headers });
    const body = found.json<SearchResponse>();
    expect(body.total).toBe(1);
    const hit = body.items[0]!;
    expect(hit.bookmark).toMatchObject({ title: 'Caching strategies', status: 'ready' });
    expect(hit.snippets[0]?.some((s) => s.highlight && s.text.toLowerCase() === 'flamingo')).toBe(true);

    const content = await t.app.inject({ method: 'GET', url: `/bookmarks/${saved.bookmark.id}/content`, headers });
    expect(content.json<ReaderContent>().contentHtml).toContain('<p>');
  });

  it('dedupes saves of the same page and merges tags', async () => {
    const { headers } = await register(t.app);
    t.fetcher.set('https://example.com/a', { html: articleHtml('A', longParagraphs('a')) });
    const first = await t.app.inject({
      method: 'POST',
      url: '/bookmarks',
      headers,
      payload: { url: 'https://example.com/a', tags: ['one'] },
    });
    await settle();
    const second = await t.app.inject({
      method: 'POST',
      url: '/bookmarks',
      headers,
      payload: { url: 'https://EXAMPLE.com/a/#comments', tags: ['two'], readLater: true },
    });
    expect(second.statusCode).toBe(200);
    const merged = second.json<SaveBookmarkResponse>();
    expect(merged.created).toBe(false);
    expect(merged.bookmark.id).toBe(first.json<SaveBookmarkResponse>().bookmark.id);
    expect(merged.bookmark).toMatchObject({ tags: ['one', 'two'], readLater: true, status: 'ready' });
  });

  it('uses HTML captured by the extension instead of fetching', async () => {
    const { headers } = await register(t.app);
    const res = await t.app.inject({
      method: 'POST',
      url: '/bookmarks',
      headers,
      payload: {
        url: 'https://intranet.example.com/wiki',
        title: 'Tab title',
        html: articleHtml('Team wiki', longParagraphs('onboarding')),
      },
    });
    await settle();
    expect(t.fetcher.calls).toEqual([]);
    const bookmark = await t.app.inject({
      method: 'GET',
      url: `/bookmarks/${res.json<SaveBookmarkResponse>().bookmark.id}`,
      headers,
    });
    expect(bookmark.json<SaveBookmarkResponse>().bookmark).toMatchObject({ title: 'Team wiki', status: 'ready' });
  });

  it('marks unreachable pages as failed but keeps them, and can retry', async () => {
    const { headers } = await register(t.app);
    t.fetcher.set('https://down.example.com/', { error: new FetchError('The site responded with HTTP 503', true) });
    const res = await t.app.inject({
      method: 'POST',
      url: '/bookmarks',
      headers,
      payload: { url: 'https://down.example.com/' },
    });
    const { id } = res.json<SaveBookmarkResponse>().bookmark;
    await settle();
    expect(t.fetcher.calls).toHaveLength(2); // one retry for a retryable failure

    let bookmark = (
      await t.app.inject({ method: 'GET', url: `/bookmarks/${id}`, headers })
    ).json<SaveBookmarkResponse>().bookmark;
    expect(bookmark).toMatchObject({ status: 'failed', error: 'The site responded with HTTP 503' });

    t.fetcher.set('https://down.example.com/', { html: articleHtml('Back up', longParagraphs('recovery')) });
    const retry = await t.app.inject({ method: 'POST', url: `/bookmarks/${id}/refetch`, headers });
    expect(retry.statusCode).toBe(202);
    await settle();
    bookmark = (await t.app.inject({ method: 'GET', url: `/bookmarks/${id}`, headers })).json<SaveBookmarkResponse>()
      .bookmark;
    expect(bookmark).toMatchObject({ status: 'ready', title: 'Back up', error: null });
  });

  it('updates, looks up and deletes bookmarks; custom titles survive re-extraction', async () => {
    const { headers } = await register(t.app);
    t.fetcher.set('https://example.com/b', { html: articleHtml('Original', longParagraphs('b')) });
    const { id } = (
      await t.app.inject({ method: 'POST', url: '/bookmarks', headers, payload: { url: 'https://example.com/b' } })
    ).json<SaveBookmarkResponse>().bookmark;
    await settle();

    const patched = await t.app.inject({
      method: 'PATCH',
      url: `/bookmarks/${id}`,
      headers,
      payload: { title: 'My name', tags: ['x'], readLater: true },
    });
    expect(patched.json<SaveBookmarkResponse>().bookmark).toMatchObject({
      title: 'My name',
      tags: ['x'],
      readLater: true,
    });

    await t.app.inject({ method: 'POST', url: `/bookmarks/${id}/refetch`, headers });
    await settle();
    const lookup = await t.app.inject({
      method: 'GET',
      url: `/bookmarks/lookup?url=${encodeURIComponent('https://example.com/b/')}`,
      headers,
    });
    expect(lookup.json<{ bookmark: { title: string } }>().bookmark.title).toBe('My name');

    expect((await t.app.inject({ method: 'PATCH', url: `/bookmarks/${id}`, headers, payload: {} })).statusCode).toBe(
      400,
    );
    expect((await t.app.inject({ method: 'DELETE', url: `/bookmarks/${id}`, headers })).statusCode).toBe(204);
    expect((await t.app.inject({ method: 'GET', url: `/bookmarks/${id}`, headers })).statusCode).toBe(404);
    const gone = await t.app.inject({
      method: 'GET',
      url: `/bookmarks/lookup?url=${encodeURIComponent('https://example.com/b')}`,
      headers,
    });
    expect(gone.json<{ bookmark: null }>().bookmark).toBeNull();
  });

  it('isolates users from each other', async () => {
    const alice = await register(t.app);
    const bob = await register(t.app);
    t.fetcher.set('https://example.com/secret', { html: articleHtml('Secret plans', longParagraphs('secret')) });
    const { id } = (
      await t.app.inject({
        method: 'POST',
        url: '/bookmarks',
        headers: alice.headers,
        payload: { url: 'https://example.com/secret' },
      })
    ).json<SaveBookmarkResponse>().bookmark;
    await settle();

    expect((await t.app.inject({ method: 'GET', url: `/bookmarks/${id}`, headers: bob.headers })).statusCode).toBe(404);
    expect(
      (await t.app.inject({ method: 'GET', url: `/bookmarks/${id}/content`, headers: bob.headers })).statusCode,
    ).toBe(404);
    expect(
      (await t.app.inject({ method: 'PATCH', url: `/bookmarks/${id}`, headers: bob.headers, payload: { title: 'x' } }))
        .statusCode,
    ).toBe(404);
    expect((await t.app.inject({ method: 'DELETE', url: `/bookmarks/${id}`, headers: bob.headers })).statusCode).toBe(
      404,
    );
    const search = await t.app.inject({ method: 'GET', url: '/bookmarks?q=secret', headers: bob.headers });
    expect(search.json<SearchResponse>().total).toBe(0);
  });

  it('applies back-pressure when a user floods the ingest queue', async () => {
    const { headers } = await register(t.app);
    // Pages that never finish keep jobs in the queue.
    t.fetcher.fetch = () => new Promise(() => {});
    const statuses: number[] = [];
    for (let i = 0; i < 12; i++) {
      const res = await t.app.inject({
        method: 'POST',
        url: '/bookmarks',
        headers,
        payload: { url: `https://example.com/p${i}` },
      });
      statuses.push(res.statusCode);
    }
    expect(statuses.filter((s) => s === 201)).toHaveLength(10);
    expect(statuses.slice(10)).toEqual([429, 429]);
    // A second user is unaffected.
    const other = await register(t.app);
    const res = await t.app.inject({
      method: 'POST',
      url: '/bookmarks',
      headers: other.headers,
      payload: { url: 'https://example.com/x' },
    });
    expect(res.statusCode).toBe(201);
    await t.app.ingest.queue.stop(0);
  });

  it('re-queues a bookmark whose pending job was lost', async () => {
    const { headers, user } = await register(t.app);
    t.fetcher.set('https://example.com/lost', { html: articleHtml('Found again', longParagraphs('recovery')) });
    const first = await t.app.inject({
      method: 'POST',
      url: '/bookmarks',
      headers,
      payload: { url: 'https://example.com/lost' },
    });
    const { id } = first.json<SaveBookmarkResponse>().bookmark;
    await settle();
    // Simulate a crash mid-extraction: the document is pending but no job exists.
    await t.store.patchBookmark(user.id, id, { status: 'pending' });
    const again = await t.app.inject({
      method: 'POST',
      url: '/bookmarks',
      headers,
      payload: { url: 'https://example.com/lost' },
    });
    expect(again.json<SaveBookmarkResponse>().created).toBe(false);
    await settle();
    const bookmark = (
      await t.app.inject({ method: 'GET', url: `/bookmarks/${id}`, headers })
    ).json<SaveBookmarkResponse>().bookmark;
    expect(bookmark.status).toBe('ready');
  });

  it('validates input at the boundary', async () => {
    const { headers } = await register(t.app);
    const bad = await t.app.inject({
      method: 'POST',
      url: '/bookmarks',
      headers,
      payload: { url: 'javascript:alert(1)' },
    });
    expect(bad.statusCode).toBe(400);
    const missingCollection = await t.app.inject({
      method: 'POST',
      url: '/bookmarks',
      headers,
      payload: { url: 'https://example.com', collectionId: '00000000-0000-4000-8000-000000000000' },
    });
    expect(missingCollection.json<ApiErrorBody>().error.message).toBe('Collection not found');
    const badQuery = await t.app.inject({ method: 'GET', url: '/bookmarks?pageSize=1000', headers });
    expect(badQuery.statusCode).toBe(400);
    const badJson = await t.app.inject({
      method: 'POST',
      url: '/bookmarks',
      headers: { ...headers, 'content-type': 'application/json' },
      payload: '{nope',
    });
    expect(badJson.statusCode).toBe(400);
  });
});

describe('search and collections over the demo library', () => {
  let headers: Record<string, string>;

  beforeEach(async () => {
    const { token } = (await t.app.inject({ method: 'POST', url: '/auth/demo' })).json<AuthResponse>();
    headers = { authorization: `Bearer ${token}` };
  });

  it('returns highlighted title and snippet segments without HTML', async () => {
    const res = await t.app.inject({ method: 'GET', url: '/bookmarks?q=service%20worker', headers });
    const hit = res.json<SearchResponse>().items[0]!;
    expect(hit.bookmark.title).toBe('Service Worker API');
    expect(hit.titleSegments).toEqual([
      { text: 'Service', highlight: true },
      { text: ' ', highlight: false },
      { text: 'Worker', highlight: true },
      { text: ' API', highlight: false },
    ]);
    expect(hit.snippets.length).toBeGreaterThan(0);
    expect(JSON.stringify(hit)).not.toContain('');
  });

  it('filters by tags and exposes facets', async () => {
    const res = await t.app.inject({ method: 'GET', url: '/bookmarks?tags=search&tags=ranking', headers });
    const body = res.json<SearchResponse>();
    expect(body.items.map((i) => i.bookmark.title)).toEqual(['Okapi BM25']);
    expect(body.facets.tags).toContainEqual({ tag: 'ranking', count: 1 });
  });

  it('creates, renames and deletes collections, keeping bookmarks', async () => {
    const list = (await t.app.inject({ method: 'GET', url: '/collections', headers })).json<{
      collections: Collection[];
    }>();
    expect(list.collections.map((c) => [c.name, c.bookmarkCount])).toEqual([
      ['Design & UX', 3],
      ['Frontend', 3],
      ['Search engineering', 4],
    ]);

    const created = await t.app.inject({
      method: 'POST',
      url: '/collections',
      headers,
      payload: { name: 'Later', color: 'amber' },
    });
    expect(created.statusCode).toBe(201);
    const { collection } = created.json<{ collection: Collection }>();
    const dup = await t.app.inject({ method: 'POST', url: '/collections', headers, payload: { name: 'later' } });
    expect(dup.statusCode).toBe(409);

    const renamed = await t.app.inject({
      method: 'PATCH',
      url: `/collections/${collection.id}`,
      headers,
      payload: { name: 'Someday' },
    });
    expect(renamed.json<{ collection: Collection }>().collection.name).toBe('Someday');

    const frontend = list.collections.find((c) => c.name === 'Frontend')!;
    expect((await t.app.inject({ method: 'DELETE', url: `/collections/${frontend.id}`, headers })).statusCode).toBe(
      204,
    );
    const summary = (await t.app.inject({ method: 'GET', url: '/library/summary', headers })).json<LibrarySummary>();
    expect(summary).toMatchObject({ total: 14, unsorted: 7 });
  });

  it('moves a bookmark into a collection', async () => {
    const { collection } = (
      await t.app.inject({ method: 'POST', url: '/collections', headers, payload: { name: 'Picks' } })
    ).json<{ collection: Collection }>();
    const [first] = (await t.app.inject({ method: 'GET', url: '/bookmarks', headers })).json<SearchResponse>().items;
    await t.app.inject({
      method: 'PATCH',
      url: `/bookmarks/${first!.bookmark.id}`,
      headers,
      payload: { collectionId: collection.id },
    });
    const inPicks = (
      await t.app.inject({ method: 'GET', url: `/bookmarks?collectionId=${collection.id}`, headers })
    ).json<SearchResponse>();
    expect(inPicks.items.map((i) => i.bookmark.id)).toEqual([first!.bookmark.id]);
  });
});

describe('rate limiting behind a proxy', () => {
  it('cannot be bypassed by spoofing X-Forwarded-For when TRUST_PROXY is a hop count', async () => {
    const proxied = await createTestApp({ env: { TRUST_PROXY: '1' } });
    const statuses: number[] = [];
    for (let i = 0; i < 12; i++) {
      const res = await proxied.app.inject({
        method: 'POST',
        url: '/auth/login',
        // The client controls the left part; the proxy appends the real address on the right.
        headers: { 'x-forwarded-for': `10.0.0.${i}, 203.0.113.7` },
        payload: { email: 'nobody@example.com', password: 'wrong-password' },
      });
      statuses.push(res.statusCode);
    }
    // A different real client (right-most entry) has its own budget.
    const other = await proxied.app.inject({
      method: 'POST',
      url: '/auth/login',
      headers: { 'x-forwarded-for': '203.0.113.8' },
      payload: { email: 'nobody@example.com', password: 'wrong-password' },
    });
    await proxied.app.close();
    expect(statuses.slice(0, 10).every((s) => s === 401)).toBe(true);
    expect(statuses.slice(10)).toEqual([429, 429]);
    expect(other.statusCode).toBe(401);
  });
});

describe('CORS', () => {
  it('allows the configured web origin and extension origins only', async () => {
    const preflight = (origin: string) =>
      t.app.inject({
        method: 'OPTIONS',
        url: '/bookmarks',
        headers: {
          origin,
          'access-control-request-method': 'POST',
          'access-control-request-headers': 'authorization,content-type',
        },
      });
    expect((await preflight('http://localhost:5173')).headers['access-control-allow-origin']).toBe(
      'http://localhost:5173',
    );
    expect((await preflight('chrome-extension://abcdefghijklmnop')).headers['access-control-allow-origin']).toBe(
      'chrome-extension://abcdefghijklmnop',
    );
    expect((await preflight('https://evil.example.com')).headers['access-control-allow-origin']).toBeUndefined();
  });
});
