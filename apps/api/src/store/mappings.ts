/** Index settings + mappings. `dynamic: strict` turns a typo in a field name into an error instead of silent junk. */

const keyword = { type: 'keyword' } as const;
const date = { type: 'date' } as const;
const bool = { type: 'boolean' } as const;
const integer = { type: 'integer' } as const;
const storedOnly = { type: 'text', index: false } as const;

export const settings = (replicas: number) => ({
  number_of_shards: 1,
  number_of_replicas: replicas,
});

export const usersMapping = {
  dynamic: 'strict',
  properties: {
    id: keyword,
    email: keyword,
    name: storedOnly,
    passwordHash: { type: 'keyword', index: false, doc_values: false },
    isDemo: bool,
    demoExpiresAt: date,
    createdAt: date,
  },
} as const;

export const collectionsMapping = {
  dynamic: 'strict',
  properties: {
    id: keyword,
    userId: keyword,
    name: { type: 'text', fields: { raw: { type: 'keyword', ignore_above: 256 } } },
    color: keyword,
    createdAt: date,
    updatedAt: date,
  },
} as const;

export const bookmarksMapping = {
  dynamic: 'strict',
  properties: {
    id: keyword,
    userId: keyword,
    url: { type: 'text', analyzer: 'simple', fields: { raw: { type: 'keyword', ignore_above: 2048 } } },
    normalizedUrl: { type: 'keyword', ignore_above: 2048 },
    domain: { type: 'keyword', fields: { text: { type: 'text', analyzer: 'simple' } } },
    title: { type: 'text', analyzer: 'english', fields: { raw: { type: 'keyword', ignore_above: 512 } } },
    customTitle: bool,
    excerpt: { type: 'text', analyzer: 'english' },
    content: { type: 'text', analyzer: 'english' },
    contentHtml: storedOnly,
    siteName: { type: 'text', analyzer: 'standard' },
    byline: storedOnly,
    lang: keyword,
    tags: keyword,
    collectionId: keyword,
    readLater: bool,
    status: keyword,
    error: storedOnly,
    wordCount: integer,
    readingMinutes: integer,
    attempts: integer,
    createdAt: date,
    updatedAt: date,
    fetchedAt: date,
  },
} as const;
