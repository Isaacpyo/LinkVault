import type { FastifyInstance } from 'fastify';
import {
  createBookmarkSchema,
  domainOf,
  lookupQuerySchema,
  mergeTags,
  normalizeUrl,
  searchQuerySchema,
  updateBookmarkSchema,
  type LibrarySummary,
  type SaveBookmarkResponse,
  type SearchResponse,
} from '@linkvault/shared';
import { claims } from '../auth/plugin.js';
import { badRequest, notFound } from '../errors.js';
import { toBookmark, toReaderContent, toSearchHit } from '../lib/dto.js';
import { parse } from '../lib/validate.js';
import { bookmarkIdFor } from '../store/ids.js';
import type { BookmarkPatch, BookmarkRecord } from '../store/types.js';
import type { RouteContext } from './context.js';

const idParam = (params: unknown) => (params as { id: string }).id;

/** Routes registered inside an authenticated scope. */
export function bookmarkRoutes(app: FastifyInstance, { store, ingest }: RouteContext) {
  const assertCollection = async (userId: string, collectionId: string | null | undefined) => {
    if (!collectionId) return;
    if (!(await store.getCollection(userId, collectionId))) throw badRequest('Collection not found');
  };

  app.get('/library/summary', async (request): Promise<LibrarySummary> => {
    const { collectionCounts: _counts, ...summary } = await store.summary(claims(request).sub);
    return summary;
  });

  app.get('/bookmarks', async (request): Promise<SearchResponse> => {
    const query = parse(searchQuerySchema, request.query);
    const result = await store.searchBookmarks(claims(request).sub, query);
    return {
      items: result.hits.map(toSearchHit),
      total: result.total,
      page: query.page,
      pageSize: query.pageSize,
      facets: { tags: result.tagFacets },
      tookMs: result.tookMs,
    };
  });

  // Captured page HTML can be a few MB, so this route gets a larger body limit.
  app.post(
    '/bookmarks',
    { bodyLimit: 4 * 1024 * 1024, config: { rateLimit: { max: 60, timeWindow: '1 minute' } } },
    async (request, reply): Promise<SaveBookmarkResponse> => {
      const { sub } = claims(request);
      const input = parse(createBookmarkSchema, request.body);
      const normalizedUrl = normalizeUrl(input.url);
      const id = bookmarkIdFor(sub, normalizedUrl);
      await assertCollection(sub, input.collectionId);
      const now = new Date().toISOString();
      const existing = await store.getBookmark(sub, id);

      if (existing) {
        // Idempotent save: merge into the existing bookmark instead of duplicating.
        const refetch = Boolean(input.html) || existing.status === 'failed';
        const patch: BookmarkPatch = {
          tags: mergeTags(existing.tags, input.tags ?? []),
          updatedAt: now,
          ...(input.collectionId !== undefined && { collectionId: input.collectionId }),
          ...(input.readLater !== undefined && { readLater: input.readLater }),
          ...(refetch && { status: 'pending' as const, error: null }),
        };
        const updated = await store.patchBookmark(sub, id, patch);
        if (!updated) throw notFound('Bookmark');
        if (refetch) ingest.enqueue({ bookmarkId: id, userId: sub, ...(input.html && { html: input.html }) });
        reply.code(200);
        return { bookmark: toBookmark(updated), created: false };
      }

      const domain = domainOf(normalizedUrl);
      const record: BookmarkRecord = {
        id,
        userId: sub,
        url: input.url,
        normalizedUrl,
        domain,
        title: input.title || domain,
        customTitle: false,
        excerpt: null,
        content: null,
        contentHtml: null,
        siteName: null,
        byline: null,
        lang: null,
        tags: input.tags ?? [],
        collectionId: input.collectionId ?? null,
        readLater: input.readLater ?? false,
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
      ingest.enqueue({ bookmarkId: id, userId: sub, ...(input.html && { html: input.html }) });
      reply.code(201);
      return { bookmark: toBookmark(record), created: true };
    },
  );

  app.get('/bookmarks/lookup', async (request) => {
    const { sub } = claims(request);
    const { url } = parse(lookupQuerySchema, request.query);
    const existing = await store.getBookmark(sub, bookmarkIdFor(sub, normalizeUrl(url)));
    return { bookmark: existing ? toBookmark(existing) : null };
  });

  app.get('/bookmarks/:id', async (request) => {
    const bookmark = await store.getBookmark(claims(request).sub, idParam(request.params));
    if (!bookmark) throw notFound('Bookmark');
    return { bookmark: toBookmark(bookmark) };
  });

  app.get('/bookmarks/:id/content', async (request, reply) => {
    const bookmark = await store.getBookmark(claims(request).sub, idParam(request.params));
    if (!bookmark) throw notFound('Bookmark');
    reply.header('cache-control', 'private, no-cache');
    return toReaderContent(bookmark);
  });

  app.patch('/bookmarks/:id', async (request) => {
    const { sub } = claims(request);
    const input = parse(updateBookmarkSchema, request.body);
    await assertCollection(sub, input.collectionId);
    const patch: BookmarkPatch = {
      updatedAt: new Date().toISOString(),
      ...(input.title !== undefined && { title: input.title, customTitle: true }),
      ...(input.tags !== undefined && { tags: input.tags }),
      ...(input.collectionId !== undefined && { collectionId: input.collectionId }),
      ...(input.readLater !== undefined && { readLater: input.readLater }),
    };
    const updated = await store.patchBookmark(sub, idParam(request.params), patch);
    if (!updated) throw notFound('Bookmark');
    return { bookmark: toBookmark(updated) };
  });

  app.post('/bookmarks/:id/refetch', async (request, reply) => {
    const { sub } = claims(request);
    const id = idParam(request.params);
    const updated = await store.patchBookmark(sub, id, {
      status: 'pending',
      error: null,
      updatedAt: new Date().toISOString(),
    });
    if (!updated) throw notFound('Bookmark');
    ingest.enqueue({ bookmarkId: id, userId: sub });
    reply.code(202);
    return { bookmark: toBookmark(updated) };
  });

  app.delete('/bookmarks/:id', async (request, reply) => {
    const deleted = await store.deleteBookmark(claims(request).sub, idParam(request.params));
    if (!deleted) throw notFound('Bookmark');
    return reply.code(204).send();
  });
}
