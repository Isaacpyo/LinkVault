import type { SearchQuery } from '@linkvault/shared';
import { HIGHLIGHT_POST, HIGHLIGHT_PRE } from './highlight.js';

/** Fields searched by free text, with boosts. Kept in one place so both backends agree. */
export const SEARCH_FIELDS = ['title^3', 'tags^2', 'excerpt^1.5', 'content', 'siteName', 'domain.text', 'url'];

export const SNIPPET_FRAGMENT_SIZE = 180;
export const SNIPPET_FRAGMENTS = 2;
export const TAG_FACET_SIZE = 30;

type Clause = Record<string, unknown>;

/** Filters shared by search and summaries. `userId` is always the first filter. */
export function buildFilters(
  userId: string,
  query: Pick<SearchQuery, 'tags' | 'collectionId' | 'readLater' | 'status'>,
) {
  const filter: Clause[] = [{ term: { userId } }];
  const mustNot: Clause[] = [];
  for (const tag of query.tags) filter.push({ term: { tags: tag } });
  if (query.collectionId === 'none') mustNot.push({ exists: { field: 'collectionId' } });
  else if (query.collectionId) filter.push({ term: { collectionId: query.collectionId } });
  if (query.readLater !== undefined) filter.push({ term: { readLater: query.readLater } });
  if (query.status) filter.push({ term: { status: query.status } });
  return { filter, mustNot };
}

/** Builds the OpenSearch request body for GET /bookmarks. Pure, so it is unit-tested directly. */
export function buildSearchBody(userId: string, query: SearchQuery) {
  const { filter, mustNot } = buildFilters(userId, query);
  const text = query.q?.trim();
  const sort = query.sort ?? (text ? 'relevance' : 'newest');

  const must: Clause[] = text
    ? [
        {
          simple_query_string: {
            query: text,
            fields: SEARCH_FIELDS,
            default_operator: 'and',
            flags: 'AND|OR|NOT|PHRASE|PREFIX|PRECEDENCE|WHITESPACE|ESCAPE',
            lenient: true,
          },
        },
      ]
    : [{ match_all: {} }];

  const sortClause =
    sort === 'relevance' && text
      ? ['_score', { createdAt: { order: 'desc' } }]
      : [{ createdAt: { order: sort === 'oldest' ? 'asc' : 'desc' } }, { id: { order: 'asc' } }];

  return {
    from: (query.page - 1) * query.pageSize,
    size: query.pageSize,
    track_total_hits: true,
    query: { bool: { must, filter, must_not: mustNot } },
    sort: sortClause,
    _source: { excludes: ['content', 'contentHtml'] },
    aggs: { tags: { terms: { field: 'tags', size: TAG_FACET_SIZE } } },
    ...(text
      ? {
          highlight: {
            pre_tags: [HIGHLIGHT_PRE],
            post_tags: [HIGHLIGHT_POST],
            require_field_match: true,
            fields: {
              title: { number_of_fragments: 0 },
              excerpt: { number_of_fragments: 0 },
              content: { fragment_size: SNIPPET_FRAGMENT_SIZE, number_of_fragments: SNIPPET_FRAGMENTS },
            },
          },
        }
      : {}),
  };
}

/** Aggregations for the sidebar: counts per collection, tag cloud, read-later, unsorted and pending totals. */
export function buildSummaryBody(userId: string) {
  return {
    size: 0,
    track_total_hits: true,
    query: { bool: { filter: [{ term: { userId } }] } },
    aggs: {
      readLater: { filter: { term: { readLater: true } } },
      pending: { filter: { term: { status: 'pending' } } },
      unsorted: { missing: { field: 'collectionId' } },
      tags: { terms: { field: 'tags', size: 100 } },
      collections: { terms: { field: 'collectionId', size: 500 } },
    },
  };
}
