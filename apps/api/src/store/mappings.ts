/** Index settings + mappings. `dynamic: strict` turns a typo in a field name into an error instead of silent junk. */

const keyword = { type: 'keyword' } as const;
const date = { type: 'date' } as const;
const bool = { type: 'boolean' } as const;
const integer = { type: 'integer' } as const;
const storedOnly = { type: 'text', index: false } as const;

/**
 * Every field searched by free text must drop English stopwords: with AND semantics across
 * fields, a stopword kept by any one field ("the" in a keyword or simple-analyzed field)
 * becomes a required term and the query matches nothing.
 */
export const settings = (replicas: number) => ({
  number_of_shards: 1,
  number_of_replicas: replicas,
  analysis: {
    tokenizer: {
      alphanumeric: { type: 'pattern', pattern: '[^\\p{L}\\p{N}]+' },
    },
    filter: {
      english_stop: { type: 'stop', stopwords: '_english_' },
      english_stemmer: { type: 'stemmer', language: 'english' },
    },
    analyzer: {
      // URLs and domains: split on punctuation, then treat like English text.
      url_text: {
        type: 'custom',
        tokenizer: 'alphanumeric',
        filter: ['lowercase', 'asciifolding', 'english_stop', 'english_stemmer'],
      },
    },
  },
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
    url: { type: 'text', analyzer: 'url_text', fields: { raw: { type: 'keyword', ignore_above: 2048 } } },
    normalizedUrl: { type: 'keyword', ignore_above: 2048 },
    domain: { type: 'keyword', fields: { text: { type: 'text', analyzer: 'url_text' } } },
    title: { type: 'text', analyzer: 'english', fields: { raw: { type: 'keyword', ignore_above: 512 } } },
    customTitle: bool,
    excerpt: { type: 'text', analyzer: 'english' },
    content: { type: 'text', analyzer: 'english' },
    contentHtml: storedOnly,
    siteName: { type: 'text', analyzer: 'english' },
    byline: storedOnly,
    lang: keyword,
    tags: { type: 'keyword', fields: { text: { type: 'text', analyzer: 'english' } } },
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
