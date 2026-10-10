import type { SearchQuery, TagCount } from '@linkvault/shared';
import { DuplicateError } from '../errors.js';
import {
  highlightFragments,
  highlightWhole,
  indexFields,
  isEmptyQuery,
  matches,
  parseQuery,
  score,
} from './memory-search.js';
import { TAG_FACET_SIZE } from './queries.js';
import type {
  BookmarkPatch,
  BookmarkRecord,
  BookmarkSummaryRecord,
  CollectionRecord,
  Store,
  StoreSearchHit,
  StoreSearchResult,
  StoreSummary,
  UserRecord,
} from './types.js';

const clone = <T>(value: T): T => structuredClone(value);

function summarize(record: BookmarkRecord): BookmarkSummaryRecord {
  const { content: _content, contentHtml: _contentHtml, ...rest } = record;
  return clone(rest);
}

function countTags(records: Iterable<BookmarkRecord>, limit: number): TagCount[] {
  const counts = new Map<string, number>();
  for (const r of records) for (const tag of r.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  return [...counts]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
    .slice(0, limit);
}

/**
 * In-process implementation of the Store interface. Used by tests and as a
 * zero-config fallback when OPENSEARCH_URL is not set. Not persistent.
 */
export class MemoryStore implements Store {
  readonly backend = 'memory' as const;
  readonly persistent = false;

  private users = new Map<string, UserRecord>();
  private collections = new Map<string, CollectionRecord>();
  private bookmarks = new Map<string, BookmarkRecord>();

  async init(): Promise<void> {}
  async ping(): Promise<boolean> {
    return true;
  }
  async close(): Promise<void> {}

  async createUser(user: UserRecord): Promise<void> {
    const email = user.email.toLowerCase();
    for (const existing of this.users.values()) {
      if (existing.email.toLowerCase() === email) throw new DuplicateError('An account with this email already exists');
    }
    this.users.set(user.id, clone(user));
  }

  async findUserByEmail(email: string): Promise<UserRecord | null> {
    const needle = email.trim().toLowerCase();
    for (const user of this.users.values()) if (user.email.toLowerCase() === needle) return clone(user);
    return null;
  }

  async getUser(id: string): Promise<UserRecord | null> {
    const user = this.users.get(id);
    return user ? clone(user) : null;
  }

  async listExpiredDemoUsers(now: Date, limit: number): Promise<UserRecord[]> {
    return [...this.users.values()]
      .filter((u) => u.isDemo && u.demoExpiresAt !== null && new Date(u.demoExpiresAt) < now)
      .slice(0, limit)
      .map(clone);
  }

  async deleteUserData(userId: string): Promise<void> {
    for (const [id, b] of this.bookmarks) if (b.userId === userId) this.bookmarks.delete(id);
    for (const [id, c] of this.collections) if (c.userId === userId) this.collections.delete(id);
    this.users.delete(userId);
  }

  async listCollections(userId: string): Promise<CollectionRecord[]> {
    return [...this.collections.values()]
      .filter((c) => c.userId === userId)
      .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
      .map(clone);
  }

  async getCollection(userId: string, id: string): Promise<CollectionRecord | null> {
    const c = this.collections.get(id);
    return c && c.userId === userId ? clone(c) : null;
  }

  async putCollection(collection: CollectionRecord): Promise<void> {
    this.collections.set(collection.id, clone(collection));
  }

  async deleteCollection(userId: string, id: string): Promise<boolean> {
    const c = this.collections.get(id);
    if (!c || c.userId !== userId) return false;
    for (const b of this.bookmarks.values()) {
      if (b.userId === userId && b.collectionId === id) b.collectionId = null;
    }
    this.collections.delete(id);
    return true;
  }

  async getBookmark(userId: string, id: string): Promise<BookmarkRecord | null> {
    const b = this.bookmarks.get(id);
    return b && b.userId === userId ? clone(b) : null;
  }

  async putBookmark(bookmark: BookmarkRecord): Promise<void> {
    this.bookmarks.set(bookmark.id, clone(bookmark));
  }

  async putBookmarks(bookmarks: BookmarkRecord[]): Promise<void> {
    for (const b of bookmarks) this.bookmarks.set(b.id, clone(b));
  }

  async patchBookmark(userId: string, id: string, patch: BookmarkPatch): Promise<BookmarkRecord | null> {
    const b = this.bookmarks.get(id);
    if (!b || b.userId !== userId) return null;
    const defined = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
    const updated = { ...b, ...clone(defined) } as BookmarkRecord;
    this.bookmarks.set(id, updated);
    return clone(updated);
  }

  async deleteBookmark(userId: string, id: string): Promise<boolean> {
    const b = this.bookmarks.get(id);
    if (!b || b.userId !== userId) return false;
    this.bookmarks.delete(id);
    return true;
  }

  async searchBookmarks(userId: string, query: SearchQuery): Promise<StoreSearchResult> {
    const started = performance.now();
    const filtered = [...this.bookmarks.values()].filter((b) => {
      if (b.userId !== userId) return false;
      if (!query.tags.every((t) => b.tags.includes(t))) return false;
      if (query.collectionId === 'none' && b.collectionId !== null) return false;
      if (query.collectionId && query.collectionId !== 'none' && b.collectionId !== query.collectionId) return false;
      if (query.readLater !== undefined && b.readLater !== query.readLater) return false;
      if (query.status && b.status !== query.status) return false;
      return true;
    });

    const text = query.q?.trim() ?? '';
    const parsed = parseQuery(text);
    const useText = text.length > 0 && !isEmptyQuery(parsed);
    const sort = query.sort ?? (useText ? 'relevance' : 'newest');

    const indexed = filtered.map((b) => ({
      record: b,
      index: indexFields([
        { name: 'title', text: b.title, boost: 3 },
        { name: 'tags', text: b.tags.join(' '), boost: 2 },
        { name: 'excerpt', text: b.excerpt ?? '', boost: 1.5 },
        { name: 'content', text: b.content ?? '', boost: 1 },
        { name: 'siteName', text: b.siteName ?? '', boost: 1 },
        { name: 'domain', text: b.domain, boost: 1 },
        { name: 'url', text: b.url, boost: 1 },
      ]),
    }));

    let matched = useText ? indexed.filter((d) => matches(d.index, parsed)) : indexed;
    // Mirror "AND|NOT" semantics for a query that is only exclusions.
    if (!useText && parsed.excluded.length) matched = indexed.filter((d) => matches(d.index, parsed));

    const docFrequency = new Map<string, number>();
    if (useText) {
      for (const d of indexed) {
        const seen = new Set<string>();
        for (const f of d.index) for (const term of f.counts.keys()) seen.add(term);
        for (const term of seen) docFrequency.set(term, (docFrequency.get(term) ?? 0) + 1);
      }
    }

    const scored = matched.map((d) => ({
      ...d,
      score: useText ? score(d.index, parsed, docFrequency, indexed.length) : null,
    }));
    const byDate = (a: BookmarkRecord, b: BookmarkRecord) =>
      a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : a.id < b.id ? -1 : 1;
    scored.sort((a, b) => {
      if (sort === 'relevance' && useText) return (b.score ?? 0) - (a.score ?? 0) || -byDate(a.record, b.record);
      return sort === 'oldest' ? byDate(a.record, b.record) : -byDate(a.record, b.record);
    });

    const from = (query.page - 1) * query.pageSize;
    const page = scored.slice(from, from + query.pageSize);
    const hits: StoreSearchHit[] = page.map(({ record, score: s }) => {
      const title = useText ? highlightWhole(record.title, parsed) : null;
      const excerpt = useText && record.excerpt ? highlightWhole(record.excerpt, parsed) : null;
      return {
        bookmark: summarize(record),
        score: s,
        highlights: {
          title: title ? [title] : [],
          excerpt: excerpt ? [excerpt] : [],
          content: useText && record.content ? highlightFragments(record.content, parsed) : [],
        },
      };
    });

    return {
      hits,
      total: scored.length,
      tagFacets: countTags(
        scored.map((s) => s.record),
        TAG_FACET_SIZE,
      ),
      tookMs: Math.round(performance.now() - started),
    };
  }

  async summary(userId: string): Promise<StoreSummary> {
    const mine = [...this.bookmarks.values()].filter((b) => b.userId === userId);
    const collectionCounts: Record<string, number> = {};
    for (const b of mine)
      if (b.collectionId) collectionCounts[b.collectionId] = (collectionCounts[b.collectionId] ?? 0) + 1;
    return {
      total: mine.length,
      readLater: mine.filter((b) => b.readLater).length,
      pending: mine.filter((b) => b.status === 'pending').length,
      unsorted: mine.filter((b) => b.collectionId === null).length,
      tags: countTags(mine, 100),
      collectionCounts,
    };
  }

  async listPendingBookmarks(limit: number): Promise<BookmarkRecord[]> {
    return [...this.bookmarks.values()]
      .filter((b) => b.status === 'pending')
      .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1))
      .slice(0, limit)
      .map(clone);
  }
}
