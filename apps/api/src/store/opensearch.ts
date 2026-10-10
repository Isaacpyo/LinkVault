import { Client, errors, type API } from '@opensearch-project/opensearch';
import type { SearchQuery, TagCount } from '@linkvault/shared';
import { DuplicateError } from '../errors.js';
import { userDocIdFor } from './ids.js';
import { bookmarksMapping, collectionsMapping, settings, usersMapping } from './mappings.js';
import { buildSearchBody, buildSummaryBody } from './queries.js';
import type {
  BookmarkPatch,
  BookmarkRecord,
  BookmarkSummaryRecord,
  CollectionRecord,
  Store,
  StoreSearchResult,
  StoreSummary,
  UserRecord,
} from './types.js';

export interface OpenSearchStoreOptions {
  url: string;
  indexPrefix: string;
  replicas: number;
  /** Inject a client in tests; otherwise one is created from `url`. */
  client?: Client;
}

interface Bucket {
  key: string;
  doc_count: number;
}

const WAIT = 'wait_for' as const;

/**
 * OpenSearch-backed store. OpenSearch is the system of record here: documents
 * are written with `refresh=wait_for` so a client always reads its own writes.
 */
export class OpenSearchStore implements Store {
  readonly backend = 'opensearch' as const;
  readonly persistent = true;
  readonly client: Client;
  readonly indices: { users: string; collections: string; bookmarks: string };
  private readonly replicas: number;

  constructor(options: OpenSearchStoreOptions) {
    this.client =
      options.client ??
      new Client({
        node: options.url,
        requestTimeout: 15_000,
        maxRetries: 2,
        compression: 'gzip',
      });
    this.indices = {
      users: `${options.indexPrefix}-users`,
      collections: `${options.indexPrefix}-collections`,
      bookmarks: `${options.indexPrefix}-bookmarks`,
    };
    this.replicas = options.replicas;
  }

  async init(): Promise<void> {
    const specs = [
      [this.indices.users, usersMapping],
      [this.indices.collections, collectionsMapping],
      [this.indices.bookmarks, bookmarksMapping],
    ] as const;
    for (const [index, mappings] of specs) {
      const { body: exists } = await this.client.indices.exists({ index });
      if (exists) {
        // Additive mapping changes apply in place; breaking ones need a reindex.
        await this.client.indices.putMapping({ index, body: mappings as never });
        continue;
      }
      try {
        await this.client.indices.create({
          index,
          body: { settings: settings(this.replicas), mappings } as never,
        });
      } catch (error) {
        // Another instance won the race to create it.
        if (!isErrorType(error, 'resource_already_exists_exception')) throw error;
      }
    }
  }

  async ping(): Promise<boolean> {
    try {
      const { body } = await this.client.ping();
      return body === true;
    } catch {
      return false;
    }
  }

  async close(): Promise<void> {
    await this.client.close();
  }

  // ---------------------------------------------------------------- users

  async createUser(user: UserRecord): Promise<void> {
    try {
      await this.client.index({
        index: this.indices.users,
        id: userDocIdFor(user.email),
        op_type: 'create',
        refresh: WAIT,
        body: user,
      });
    } catch (error) {
      if (error instanceof errors.ResponseError && error.statusCode === 409) {
        throw new DuplicateError('An account with this email already exists');
      }
      throw error;
    }
  }

  async findUserByEmail(email: string): Promise<UserRecord | null> {
    return this.getSource<UserRecord>(this.indices.users, userDocIdFor(email));
  }

  async getUser(id: string): Promise<UserRecord | null> {
    const hits = await this.searchSources<UserRecord>(this.indices.users, {
      size: 1,
      query: { bool: { filter: [{ term: { id } }] } },
    });
    return hits[0] ?? null;
  }

  async listExpiredDemoUsers(now: Date, limit: number): Promise<UserRecord[]> {
    return this.searchSources<UserRecord>(this.indices.users, {
      size: limit,
      query: {
        bool: { filter: [{ term: { isDemo: true } }, { range: { demoExpiresAt: { lt: now.toISOString() } } }] },
      },
    });
  }

  async deleteUserData(userId: string): Promise<void> {
    const byUser = { query: { bool: { filter: [{ term: { userId } }] } } };
    await this.client.deleteByQuery({
      index: this.indices.bookmarks,
      refresh: true,
      conflicts: 'proceed',
      body: byUser as never,
    });
    await this.client.deleteByQuery({
      index: this.indices.collections,
      refresh: true,
      conflicts: 'proceed',
      body: byUser as never,
    });
    await this.client.deleteByQuery({
      index: this.indices.users,
      refresh: true,
      conflicts: 'proceed',
      body: { query: { bool: { filter: [{ term: { id: userId } }] } } } as never,
    });
  }

  // ---------------------------------------------------------- collections

  async listCollections(userId: string): Promise<CollectionRecord[]> {
    return this.searchSources<CollectionRecord>(this.indices.collections, {
      size: 500,
      query: { bool: { filter: [{ term: { userId } }] } },
      sort: [{ 'name.raw': { order: 'asc' } }],
    });
  }

  async getCollection(userId: string, id: string): Promise<CollectionRecord | null> {
    const doc = await this.getSource<CollectionRecord>(this.indices.collections, id);
    return doc && doc.userId === userId ? doc : null;
  }

  async putCollection(collection: CollectionRecord): Promise<void> {
    await this.client.index({
      index: this.indices.collections,
      id: collection.id,
      refresh: WAIT,
      body: collection,
    });
  }

  async deleteCollection(userId: string, id: string): Promise<boolean> {
    const existing = await this.getCollection(userId, id);
    if (!existing) return false;
    await this.client.updateByQuery({
      index: this.indices.bookmarks,
      refresh: true,
      conflicts: 'proceed',
      body: {
        query: { bool: { filter: [{ term: { userId } }, { term: { collectionId: id } }] } },
        script: { source: 'ctx._source.collectionId = null', lang: 'painless' },
      } as never,
    });
    await this.client.delete({ index: this.indices.collections, id, refresh: WAIT });
    return true;
  }

  // ------------------------------------------------------------ bookmarks

  async getBookmark(userId: string, id: string): Promise<BookmarkRecord | null> {
    const doc = await this.getSource<BookmarkRecord>(this.indices.bookmarks, id);
    return doc && doc.userId === userId ? doc : null;
  }

  async putBookmark(bookmark: BookmarkRecord): Promise<void> {
    await this.client.index({
      index: this.indices.bookmarks,
      id: bookmark.id,
      refresh: WAIT,
      body: bookmark,
    });
  }

  async putBookmarks(bookmarks: BookmarkRecord[]): Promise<void> {
    if (!bookmarks.length) return;
    const body = bookmarks.flatMap((doc) => [{ index: { _index: this.indices.bookmarks, _id: doc.id } }, doc]);
    const { body: result } = await this.client.bulk({ refresh: WAIT, body: body as never });
    if (result.errors) {
      const first = result.items.find((item) => item.index?.error)?.index?.error;
      throw new Error(`Bulk indexing failed: ${first?.reason ?? 'unknown error'}`);
    }
  }

  async patchBookmark(userId: string, id: string, patch: BookmarkPatch): Promise<BookmarkRecord | null> {
    const existing = await this.getBookmark(userId, id);
    if (!existing) return null;
    const { body } = await this.client.update({
      index: this.indices.bookmarks,
      id,
      refresh: WAIT,
      retry_on_conflict: 3,
      _source: true,
      body: { doc: patch } as never,
    });
    const updated = (body as API.Update_ResponseBody).get?._source as BookmarkRecord | undefined;
    return updated ?? { ...existing, ...patch };
  }

  async deleteBookmark(userId: string, id: string): Promise<boolean> {
    const existing = await this.getBookmark(userId, id);
    if (!existing) return false;
    await this.client.delete({ index: this.indices.bookmarks, id, refresh: WAIT });
    return true;
  }

  async searchBookmarks(userId: string, query: SearchQuery): Promise<StoreSearchResult> {
    const { body } = await this.client.search({
      index: this.indices.bookmarks,
      body: buildSearchBody(userId, query) as never,
    });
    const total = body.hits.total;
    const tagBuckets = (body.aggregations?.tags as { buckets?: Bucket[] } | undefined)?.buckets ?? [];
    return {
      total: typeof total === 'number' ? total : (total?.value ?? 0),
      tookMs: body.took,
      tagFacets: tagBuckets.map(toTagCount),
      hits: body.hits.hits.map((hit) => {
        const highlight = (hit.highlight ?? {}) as Record<string, string[] | undefined>;
        return {
          bookmark: hit._source as BookmarkSummaryRecord,
          score: typeof hit._score === 'number' ? hit._score : null,
          highlights: {
            title: highlight.title ?? [],
            excerpt: highlight.excerpt ?? [],
            content: highlight.content ?? [],
          },
        };
      }),
    };
  }

  async summary(userId: string): Promise<StoreSummary> {
    const { body } = await this.client.search({
      index: this.indices.bookmarks,
      body: buildSummaryBody(userId) as never,
    });
    const aggs = (body.aggregations ?? {}) as Record<string, { doc_count?: number; buckets?: Bucket[] }>;
    const total = body.hits.total;
    return {
      total: typeof total === 'number' ? total : (total?.value ?? 0),
      readLater: aggs.readLater?.doc_count ?? 0,
      pending: aggs.pending?.doc_count ?? 0,
      unsorted: aggs.unsorted?.doc_count ?? 0,
      tags: (aggs.tags?.buckets ?? []).map(toTagCount),
      collectionCounts: Object.fromEntries((aggs.collections?.buckets ?? []).map((b) => [b.key, b.doc_count])),
    };
  }

  async listPendingBookmarks(limit: number): Promise<BookmarkRecord[]> {
    return this.searchSources<BookmarkRecord>(this.indices.bookmarks, {
      size: limit,
      query: { bool: { filter: [{ term: { status: 'pending' } }] } },
      sort: [{ createdAt: { order: 'asc' } }],
    });
  }

  // -------------------------------------------------------------- helpers

  private async getSource<T>(index: string, id: string): Promise<T | null> {
    const { body } = await this.client.get({ index, id }, { ignore: [404] });
    return body.found ? (body._source as T) : null;
  }

  private async searchSources<T>(index: string, body: Record<string, unknown>): Promise<T[]> {
    const { body: result } = await this.client.search({ index, body: body as never });
    return result.hits.hits.map((hit) => hit._source as T);
  }
}

const toTagCount = (bucket: Bucket): TagCount => ({ tag: String(bucket.key), count: bucket.doc_count });

function isErrorType(error: unknown, type: string): boolean {
  if (!(error instanceof errors.ResponseError)) return false;
  const body = error.body as { error?: { type?: string } } | undefined;
  return body?.error?.type === type;
}

/** True for transport-level failures (cluster unreachable, timeouts) that should surface as 503. */
export function isSearchUnavailableError(error: unknown): boolean {
  return (
    error instanceof errors.ConnectionError ||
    error instanceof errors.TimeoutError ||
    error instanceof errors.NoLivingConnectionsError
  );
}
