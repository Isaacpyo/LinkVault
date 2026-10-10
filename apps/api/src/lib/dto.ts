import type { Bookmark, Collection, PublicUser, ReaderContent, SearchHit } from '@linkvault/shared';
import { hasHighlight, parseHighlight } from '../store/highlight.js';
import type {
  BookmarkRecord,
  BookmarkSummaryRecord,
  CollectionRecord,
  StoreSearchHit,
  UserRecord,
} from '../store/types.js';

export const toPublicUser = (user: UserRecord): PublicUser => ({
  id: user.id,
  email: user.email,
  name: user.name,
  isDemo: user.isDemo,
  demoExpiresAt: user.demoExpiresAt,
  createdAt: user.createdAt,
});

export const toBookmark = (r: BookmarkSummaryRecord | BookmarkRecord): Bookmark => ({
  id: r.id,
  url: r.url,
  domain: r.domain,
  title: r.title,
  excerpt: r.excerpt,
  siteName: r.siteName,
  byline: r.byline,
  lang: r.lang,
  tags: r.tags,
  collectionId: r.collectionId,
  readLater: r.readLater,
  status: r.status,
  error: r.error,
  wordCount: r.wordCount,
  readingMinutes: r.readingMinutes,
  createdAt: r.createdAt,
  updatedAt: r.updatedAt,
  fetchedAt: r.fetchedAt,
});

export const toCollection = (c: CollectionRecord, bookmarkCount: number): Collection => ({
  id: c.id,
  name: c.name,
  color: c.color,
  bookmarkCount,
  createdAt: c.createdAt,
  updatedAt: c.updatedAt,
});

/** Snippets are shown inline, so paragraph breaks inside a fragment become single spaces. */
const toSnippet = (fragment: string) => parseHighlight(fragment.replace(/\s+/g, ' ').trim());

/** Converts marker-delimited fragments into render-safe segments. Content snippets win; excerpt is the fallback. */
export function toSearchHit(hit: StoreSearchHit): SearchHit {
  const title = hit.highlights.title[0] ? parseHighlight(hit.highlights.title[0]) : null;
  const fragments = hit.highlights.content.length ? hit.highlights.content : hit.highlights.excerpt;
  return {
    bookmark: toBookmark(hit.bookmark),
    titleSegments: title && hasHighlight(title) ? title : null,
    snippets: fragments.map(toSnippet).filter(hasHighlight),
  };
}

export const toReaderContent = (r: BookmarkRecord): ReaderContent => ({
  id: r.id,
  url: r.url,
  title: r.title,
  siteName: r.siteName,
  byline: r.byline,
  excerpt: r.excerpt,
  contentHtml: r.contentHtml,
  readingMinutes: r.readingMinutes,
  status: r.status,
  savedAt: r.createdAt,
});
