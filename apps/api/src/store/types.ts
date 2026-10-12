import type { BookmarkStatus, CollectionColor, LibrarySummary, SearchQuery, TagCount } from '@linkvault/shared';

export interface UserRecord {
  id: string;
  email: string;
  name: string | null;
  passwordHash: string;
  isDemo: boolean;
  demoExpiresAt: string | null;
  createdAt: string;
}

export interface CollectionRecord {
  id: string;
  userId: string;
  name: string;
  color: CollectionColor;
  createdAt: string;
  updatedAt: string;
}

export interface BookmarkRecord {
  id: string;
  userId: string;
  url: string;
  normalizedUrl: string;
  domain: string;
  title: string;
  /** True once the user renamed the bookmark; extraction then leaves the title alone. */
  customTitle: boolean;
  excerpt: string | null;
  /** Plain text extracted by Readability; the main full-text field. */
  content: string | null;
  /** Sanitized reader HTML; stored, not indexed. */
  contentHtml: string | null;
  siteName: string | null;
  byline: string | null;
  lang: string | null;
  tags: string[];
  collectionId: string | null;
  readLater: boolean;
  status: BookmarkStatus;
  error: string | null;
  wordCount: number | null;
  readingMinutes: number | null;
  attempts: number;
  createdAt: string;
  updatedAt: string;
  fetchedAt: string | null;
}

/** Bookmark without the heavy text fields — what list/search queries return. */
export type BookmarkSummaryRecord = Omit<BookmarkRecord, 'content' | 'contentHtml'>;

export type BookmarkPatch = Partial<Omit<BookmarkRecord, 'id' | 'userId' | 'normalizedUrl' | 'createdAt'>>;

export interface StoreSearchHit {
  bookmark: BookmarkSummaryRecord;
  /** Highlight fragments containing HIGHLIGHT_PRE/POST markers. */
  highlights: { title: string[]; content: string[]; excerpt: string[] };
  score: number | null;
}

export interface StoreSearchResult {
  hits: StoreSearchHit[];
  total: number;
  tagFacets: TagCount[];
  tookMs: number;
}

export interface StoreSummary extends LibrarySummary {
  collectionCounts: Record<string, number>;
}

/**
 * Persistence + search boundary. Every per-user method takes the owner's id and
 * must only ever read or write that user's documents (tenant isolation lives here,
 * not in the routes).
 */
export interface Store {
  readonly backend: 'opensearch' | 'memory';
  readonly persistent: boolean;

  init(): Promise<void>;
  ping(): Promise<boolean>;
  close(): Promise<void>;

  /** Throws DuplicateError when the email is already registered. */
  createUser(user: UserRecord): Promise<void>;
  findUserByEmail(email: string): Promise<UserRecord | null>;
  getUser(id: string): Promise<UserRecord | null>;
  listExpiredDemoUsers(now: Date, limit: number): Promise<UserRecord[]>;
  /** Deletes the user and every collection and bookmark they own. */
  deleteUserData(userId: string): Promise<void>;

  listCollections(userId: string): Promise<CollectionRecord[]>;
  getCollection(userId: string, id: string): Promise<CollectionRecord | null>;
  putCollection(collection: CollectionRecord): Promise<void>;
  /** Deletes the collection and moves its bookmarks to "unsorted". Returns false if it did not exist. */
  deleteCollection(userId: string, id: string): Promise<boolean>;

  getBookmark(userId: string, id: string): Promise<BookmarkRecord | null>;
  putBookmark(bookmark: BookmarkRecord): Promise<void>;
  putBookmarks(bookmarks: BookmarkRecord[]): Promise<void>;
  patchBookmark(userId: string, id: string, patch: BookmarkPatch): Promise<BookmarkRecord | null>;
  deleteBookmark(userId: string, id: string): Promise<boolean>;
  searchBookmarks(userId: string, query: SearchQuery): Promise<StoreSearchResult>;
  summary(userId: string): Promise<StoreSummary>;
  /** Pending bookmarks across all users, oldest first — used to resume ingestion after a restart. */
  listPendingBookmarks(limit: number): Promise<BookmarkRecord[]>;
}
