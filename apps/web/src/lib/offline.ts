import type { Bookmark, ReaderContent } from '@linkvault/shared';
import type { ApiClient } from './api';

/**
 * "Read later" offline copies live in Cache Storage under the same URL the
 * reader fetches, so the service worker can answer that request when the
 * network is gone. The page writes; the service worker reads.
 */
export const READ_LATER_CACHE = 'linkvault-read-later-v1';

export interface OfflineArticle extends ReaderContent {
  cachedAt: string;
}

const supported = () => typeof caches !== 'undefined';

export async function saveOffline(api: ApiClient, id: string): Promise<OfflineArticle | null> {
  if (!supported()) return null;
  const content = await api.content(id);
  const article: OfflineArticle = { ...content, cachedAt: new Date().toISOString() };
  const cache = await caches.open(READ_LATER_CACHE);
  await cache.put(
    api.contentUrl(id),
    new Response(JSON.stringify(article), { headers: { 'content-type': 'application/json' } }),
  );
  return article;
}

export async function removeOffline(api: ApiClient, id: string): Promise<void> {
  if (!supported()) return;
  const cache = await caches.open(READ_LATER_CACHE);
  await cache.delete(api.contentUrl(id), { ignoreVary: true });
}

export async function getOffline(api: ApiClient, id: string): Promise<OfflineArticle | null> {
  if (!supported()) return null;
  const cache = await caches.open(READ_LATER_CACHE);
  const response = await cache.match(api.contentUrl(id), { ignoreVary: true });
  return response ? ((await response.json()) as OfflineArticle) : null;
}

export async function listOffline(): Promise<OfflineArticle[]> {
  if (!supported()) return [];
  const cache = await caches.open(READ_LATER_CACHE);
  const requests = await cache.keys();
  const articles = await Promise.all(
    requests.map(async (request) => {
      const response = await cache.match(request, { ignoreVary: true });
      return response ? ((await response.json()) as OfflineArticle) : null;
    }),
  );
  return articles.filter((a): a is OfflineArticle => a !== null).sort((a, b) => (a.cachedAt < b.cachedAt ? 1 : -1));
}

export async function clearOffline(): Promise<void> {
  if (supported()) await caches.delete(READ_LATER_CACHE);
}

/** Upper bound on read-later items synced (50 per page). */
const MAX_SYNC_PAGES = 20;

/**
 * Makes the offline cache match the server's read-later list: downloads missing
 * articles and drops copies whose bookmark is no longer marked read later (or was
 * deleted). Bookmarks that are temporarily pending or failed keep their copy.
 */
export async function syncReadLater(api: ApiClient): Promise<{ saved: number; removed: number }> {
  if (!supported()) return { saved: 0, removed: 0 };
  const wanted = new Map<string, Bookmark>();
  for (let page = 1; page <= MAX_SYNC_PAGES; page++) {
    const params = new URLSearchParams({ readLater: 'true', pageSize: '50', page: String(page), sort: 'newest' });
    const result = await api.search(params);
    for (const item of result.items) wanted.set(item.bookmark.id, item.bookmark);
    if (page * result.pageSize >= result.total) break;
  }

  const cached = await listOffline();
  let removed = 0;
  for (const article of cached) {
    if (!wanted.has(article.id)) {
      await removeOffline(api, article.id);
      removed++;
    }
  }
  const cachedIds = new Set(cached.map((a) => a.id));
  let saved = 0;
  for (const bookmark of wanted.values()) {
    if (cachedIds.has(bookmark.id) || bookmark.status !== 'ready') continue;
    try {
      await saveOffline(api, bookmark.id);
      saved++;
    } catch {
      // One failed download should not stop the rest; it is retried on the next sync.
    }
  }
  return { saved, removed };
}
