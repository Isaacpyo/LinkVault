import { describe, expect, it } from 'vitest';
import { hashIndex, pluralize, relativeTime } from './format';

describe('relativeTime', () => {
  const now = new Date('2026-01-10T12:00:00Z').getTime();
  it('formats past and future times', () => {
    expect(relativeTime('2026-01-09T12:00:00Z', now)).toBe('yesterday');
    expect(relativeTime('2026-01-10T15:00:00Z', now)).toBe('in 3 hours');
    expect(relativeTime('2026-01-10T11:59:40Z', now)).toBe('just now');
    expect(relativeTime('2025-12-20T12:00:00Z', now)).toBe('3 weeks ago');
  });
});

describe('pluralize', () => {
  it('picks singular or plural', () => {
    expect(pluralize(1, 'bookmark')).toBe('1 bookmark');
    expect(pluralize(1200, 'bookmark')).toBe('1,200 bookmarks');
  });
});

describe('hashIndex', () => {
  it('is stable and in range', () => {
    expect(hashIndex('example.com', 6)).toBe(hashIndex('example.com', 6));
    expect(hashIndex('example.com', 6)).toBeLessThan(6);
  });
});
