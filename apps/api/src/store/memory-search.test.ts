import { describe, expect, it } from 'vitest';
import { HIGHLIGHT_POST, HIGHLIGHT_PRE } from './highlight.js';
import {
  highlightFragments,
  highlightWhole,
  indexFields,
  matches,
  parseQuery,
  stem,
  tokenize,
} from './memory-search.js';

describe('stem', () => {
  it('conflates simple English inflections', () => {
    expect(stem('bookmarks')).toBe('bookmark');
    expect(stem('indexes')).toBe('index');
    expect(stem('indexing')).toBe('index');
    expect(stem('queries')).toBe('query');
    expect(stem('class')).toBe('class');
  });
});

describe('tokenize', () => {
  it('lower-cases, folds accents and records offsets', () => {
    expect(tokenize('Café Search')).toEqual([
      { term: 'cafe', start: 0, end: 4 },
      { term: 'search', start: 5, end: 11 },
    ]);
  });
});

describe('parseQuery', () => {
  it('parses phrases, exclusions and prefixes', () => {
    expect(parseQuery('"service worker" -react cach*')).toEqual({
      terms: ['service', 'worker'],
      phrases: [['service', 'worker']],
      excluded: ['react'],
      prefixes: ['cach'],
    });
  });
});

describe('matches', () => {
  const doc = indexFields([
    { name: 'title', text: 'Service Worker API', boost: 3 },
    { name: 'content', text: 'Workers intercept network requests and cache responses.', boost: 1 },
  ]);

  it('requires every term (AND)', () => {
    expect(matches(doc, parseQuery('worker cache'))).toBe(true);
    expect(matches(doc, parseQuery('worker kubernetes'))).toBe(false);
  });

  it('respects exclusions and phrases', () => {
    expect(matches(doc, parseQuery('worker -cache'))).toBe(false);
    expect(matches(doc, parseQuery('"service worker"'))).toBe(true);
    expect(matches(doc, parseQuery('"worker service"'))).toBe(false);
  });

  it('supports prefix queries', () => {
    expect(matches(doc, parseQuery('interc*'))).toBe(true);
  });
});

describe('highlighting', () => {
  const mark = (s: string) => `${HIGHLIGHT_PRE}${s}${HIGHLIGHT_POST}`;

  it('marks every matching token in a whole field', () => {
    expect(highlightWhole('Search engines index documents', parseQuery('index'))).toBe(
      `Search engines ${mark('index')} documents`,
    );
    expect(highlightWhole('Nothing here', parseQuery('index'))).toBeNull();
  });

  it('builds a bounded fragment around the first match', () => {
    const text = `${'lorem ipsum '.repeat(40)}the flamingo stands on one leg ${'dolor sit '.repeat(40)}`;
    const [fragment] = highlightFragments(text, parseQuery('flamingo'), 120, 1);
    expect(fragment).toContain(mark('flamingo'));
    expect(fragment!.length).toBeLessThan(140);
  });
});
