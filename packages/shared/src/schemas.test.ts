import { describe, expect, it } from 'vitest';
import { createBookmarkSchema, registerSchema, searchQuerySchema, updateBookmarkSchema } from './schemas.js';

describe('createBookmarkSchema', () => {
  it('normalizes tags and accepts optional fields', () => {
    const parsed = createBookmarkSchema.parse({ url: ' https://example.com ', tags: ['#React', 'react', 'CSS'] });
    expect(parsed).toEqual({ url: 'https://example.com', tags: ['react', 'css'] });
  });

  it('rejects non-http URLs', () => {
    const result = createBookmarkSchema.safeParse({ url: 'chrome://settings' });
    expect(result.success).toBe(false);
  });
});

describe('updateBookmarkSchema', () => {
  it('requires at least one field', () => {
    expect(updateBookmarkSchema.safeParse({}).success).toBe(false);
    expect(updateBookmarkSchema.safeParse({ readLater: false }).success).toBe(true);
    expect(updateBookmarkSchema.safeParse({ collectionId: null }).success).toBe(true);
  });
});

describe('searchQuerySchema', () => {
  it('parses comma separated and repeated tags', () => {
    expect(searchQuerySchema.parse({ tags: 'a,B' }).tags).toEqual(['a', 'b']);
    expect(searchQuerySchema.parse({ tags: ['a', 'c'] }).tags).toEqual(['a', 'c']);
  });

  it('coerces paging and booleans with defaults', () => {
    const parsed = searchQuerySchema.parse({ page: '2', readLater: 'true' });
    expect(parsed).toMatchObject({ page: 2, pageSize: 20, readLater: true, tags: [] });
  });

  it('bounds page size', () => {
    expect(searchQuerySchema.safeParse({ pageSize: '500' }).success).toBe(false);
  });
});

describe('registerSchema', () => {
  it('lower-cases email and enforces password length', () => {
    expect(registerSchema.parse({ email: ' Ada@Example.com ', password: 'longenough' }).email).toBe('ada@example.com');
    expect(registerSchema.safeParse({ email: 'ada@example.com', password: 'short' }).success).toBe(false);
  });
});
