import { describe, expect, it } from 'vitest';
import { searchQuerySchema } from '@linkvault/shared';
import { buildSearchBody, buildSummaryBody } from './queries.js';

const query = (input: Record<string, unknown> = {}) => searchQuerySchema.parse(input);

describe('buildSearchBody', () => {
  it('always filters by the owner first', () => {
    const body = buildSearchBody('user-1', query());
    expect(body.query.bool.filter[0]).toEqual({ term: { userId: 'user-1' } });
    expect(buildSummaryBody('user-1').query.bool.filter[0]).toEqual({ term: { userId: 'user-1' } });
  });

  it('uses match_all, newest-first and no highlight without a query', () => {
    const body = buildSearchBody('u', query());
    expect(body.query.bool.must).toEqual([{ match_all: {} }]);
    expect(body.sort[0]).toEqual({ createdAt: { order: 'desc' } });
    expect(body).not.toHaveProperty('highlight');
  });

  it('builds a simple_query_string with AND semantics and highlights for text', () => {
    const body = buildSearchBody('u', query({ q: 'inverted index' }));
    const must = body.query.bool.must[0] as { simple_query_string: Record<string, unknown> };
    expect(must.simple_query_string).toMatchObject({ query: 'inverted index', default_operator: 'and' });
    expect(must.simple_query_string.fields).toContain('title^3');
    expect(body.sort[0]).toBe('_score');
    expect(body).toHaveProperty('highlight.fields.content.number_of_fragments', 2);
  });

  it('AND-s tag filters and supports the unsorted pseudo collection', () => {
    const body = buildSearchBody('u', query({ tags: 'react,css', collectionId: 'none', readLater: 'true' }));
    expect(body.query.bool.filter).toEqual([
      { term: { userId: 'u' } },
      { term: { tags: 'react' } },
      { term: { tags: 'css' } },
      { term: { readLater: true } },
    ]);
    expect(body.query.bool.must_not).toEqual([{ exists: { field: 'collectionId' } }]);
  });

  it('paginates and never returns heavy fields', () => {
    const body = buildSearchBody('u', query({ page: '3', pageSize: '10' }));
    expect(body.from).toBe(20);
    expect(body.size).toBe(10);
    expect(body._source.excludes).toEqual(['content', 'contentHtml']);
  });

  it('honours an explicit sort over relevance', () => {
    const body = buildSearchBody('u', query({ q: 'x', sort: 'oldest' }));
    expect(body.sort[0]).toEqual({ createdAt: { order: 'asc' } });
  });
});
