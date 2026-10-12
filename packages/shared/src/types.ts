export const BOOKMARK_STATUSES = ['pending', 'ready', 'failed'] as const;
export type BookmarkStatus = (typeof BOOKMARK_STATUSES)[number];

export const COLLECTION_COLORS = ['slate', 'red', 'amber', 'emerald', 'sky', 'violet', 'pink'] as const;
export type CollectionColor = (typeof COLLECTION_COLORS)[number];

export const SEARCH_SORTS = ['relevance', 'newest', 'oldest'] as const;
export type SearchSort = (typeof SEARCH_SORTS)[number];

export interface PublicUser {
  id: string;
  email: string;
  name: string | null;
  isDemo: boolean;
  /** ISO timestamp after which a demo sandbox is deleted; null for real accounts. */
  demoExpiresAt: string | null;
  createdAt: string;
}

export interface AuthResponse {
  token: string;
  user: PublicUser;
}

export interface Bookmark {
  id: string;
  url: string;
  domain: string;
  title: string;
  excerpt: string | null;
  siteName: string | null;
  byline: string | null;
  lang: string | null;
  tags: string[];
  collectionId: string | null;
  readLater: boolean;
  status: BookmarkStatus;
  /** Human-readable reason when status is "failed". */
  error: string | null;
  wordCount: number | null;
  readingMinutes: number | null;
  createdAt: string;
  updatedAt: string;
  fetchedAt: string | null;
}

export interface SaveBookmarkResponse {
  bookmark: Bookmark;
  /** false when the URL was already saved and the request merged into it. */
  created: boolean;
}

/** A run of text inside a search snippet; `highlight` marks a query match. */
export interface HighlightSegment {
  text: string;
  highlight: boolean;
}

export type Snippet = HighlightSegment[];

export interface SearchHit {
  bookmark: Bookmark;
  /** Title with matches marked, or null when the title did not match. */
  titleSegments: HighlightSegment[] | null;
  snippets: Snippet[];
}

export interface TagCount {
  tag: string;
  count: number;
}

export interface SearchResponse {
  items: SearchHit[];
  total: number;
  page: number;
  pageSize: number;
  facets: { tags: TagCount[] };
  tookMs: number;
}

export interface Collection {
  id: string;
  name: string;
  color: CollectionColor;
  bookmarkCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface LibrarySummary {
  total: number;
  readLater: number;
  unsorted: number;
  pending: number;
  tags: TagCount[];
}

export interface ReaderContent {
  id: string;
  url: string;
  title: string;
  siteName: string | null;
  byline: string | null;
  excerpt: string | null;
  /** Sanitized article HTML produced by Readability + DOMPurify. */
  contentHtml: string | null;
  readingMinutes: number | null;
  status: BookmarkStatus;
  savedAt: string;
}

export interface HealthResponse {
  status: 'ok' | 'degraded';
  backend: 'opensearch' | 'memory';
  /** false when data lives only in process memory (resets on restart). */
  persistent: boolean;
  search: 'up' | 'down';
  version: string;
  uptimeSeconds: number;
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}
