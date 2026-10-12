import { describe, expect, it } from 'vitest';
import { MAX_TAG_LENGTH, MAX_TAGS, mergeTags, normalizeTag, parseTags } from './tags.js';

describe('normalizeTag', () => {
  it('lower-cases, strips hashes and collapses whitespace', () => {
    expect(normalizeTag('  #Web   Performance ')).toBe('web-performance');
  });

  it('keeps unicode letters and safe punctuation', () => {
    expect(normalizeTag('Café')).toBe('café');
    expect(normalizeTag('c++')).toBe('c++');
    expect(normalizeTag('node.js')).toBe('node.js');
  });

  it('drops unsafe characters', () => {
    expect(normalizeTag('<script>')).toBe('script');
    expect(normalizeTag('a/b\\c')).toBe('abc');
    expect(normalizeTag('!!!')).toBe('');
  });

  it('caps the length', () => {
    expect(normalizeTag('x'.repeat(100))).toHaveLength(MAX_TAG_LENGTH);
  });
});

describe('parseTags', () => {
  it('splits on commas and newlines, de-duplicating', () => {
    expect(parseTags('React, #react, CSS\nweb perf')).toEqual(['react', 'css', 'web-perf']);
  });

  it('accepts arrays and ignores empties', () => {
    expect(parseTags(['  ', 'Search', '', 'search'])).toEqual(['search']);
  });

  it('returns an empty list for nullish input', () => {
    expect(parseTags(undefined)).toEqual([]);
    expect(parseTags(null)).toEqual([]);
    expect(parseTags('')).toEqual([]);
  });

  it('caps the number of tags', () => {
    const many = Array.from({ length: 50 }, (_, i) => `tag${i}`);
    expect(parseTags(many)).toHaveLength(MAX_TAGS);
  });
});

describe('mergeTags', () => {
  it('unions while keeping first-seen order', () => {
    expect(mergeTags(['a', 'b'], ['B', 'c'])).toEqual(['a', 'b', 'c']);
  });
});
