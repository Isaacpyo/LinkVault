import { z } from 'zod';
import { MAX_TAGS, parseTags } from './tags.js';
import { BOOKMARK_STATUSES, COLLECTION_COLORS, SEARCH_SORTS } from './types.js';
import { isSaveableUrl } from './url.js';

export const MAX_URL_LENGTH = 2048;
/** Upper bound for page HTML captured by the extension. */
export const MAX_CAPTURED_HTML = 3_000_000;

const email = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .pipe(z.email({ error: 'Enter a valid email address' }));

export const registerSchema = z.object({
  email,
  password: z
    .string()
    .min(8, { error: 'Password must be at least 8 characters' })
    .max(128, { error: 'Password is too long' }),
  name: z.string().trim().min(1).max(60).optional(),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email,
  password: z.string().min(1, { error: 'Password is required' }).max(128),
});
export type LoginInput = z.infer<typeof loginSchema>;

const url = z
  .string()
  .trim()
  .min(1, { error: 'URL is required' })
  .max(MAX_URL_LENGTH, { error: 'URL is too long' })
  .refine(isSaveableUrl, { error: 'Only http(s) URLs can be saved' });

const tags = z
  .array(z.string().max(64))
  .max(MAX_TAGS * 2)
  .transform((value) => parseTags(value));

const id = z.string().uuid({ error: 'Invalid id' });

export const createBookmarkSchema = z.object({
  url,
  title: z.string().trim().max(300).optional(),
  tags: tags.optional(),
  collectionId: id.nullable().optional(),
  readLater: z.boolean().optional(),
  /** Page HTML as rendered in the user's browser (extension only). */
  html: z.string().max(MAX_CAPTURED_HTML, { error: 'Captured page is too large' }).optional(),
});
export type CreateBookmarkInput = z.infer<typeof createBookmarkSchema>;

export const updateBookmarkSchema = z
  .object({
    title: z.string().trim().min(1).max(300).optional(),
    tags: tags.optional(),
    collectionId: id.nullable().optional(),
    readLater: z.boolean().optional(),
  })
  .refine((value) => Object.values(value).some((v) => v !== undefined), { error: 'Nothing to update' });
export type UpdateBookmarkInput = z.infer<typeof updateBookmarkSchema>;

const boolString = z.enum(['true', 'false']).transform((value) => value === 'true');

/** Query-string parameters for GET /bookmarks. Arrays arrive as "a,b" or repeated params. */
export const searchQuerySchema = z.object({
  q: z.string().trim().max(200).optional(),
  tags: z
    .union([z.string(), z.array(z.string())])
    .optional()
    .transform((value) => parseTags(Array.isArray(value) ? value.join(',') : value)),
  collectionId: z.union([id, z.literal('none')]).optional(),
  readLater: boolString.optional(),
  status: z.enum(BOOKMARK_STATUSES).optional(),
  sort: z.enum(SEARCH_SORTS).optional(),
  page: z.coerce.number().int().min(1).max(100).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});
export type SearchQueryInput = z.input<typeof searchQuerySchema>;
export type SearchQuery = z.output<typeof searchQuerySchema>;

export const createCollectionSchema = z.object({
  name: z.string().trim().min(1, { error: 'Name is required' }).max(60),
  color: z.enum(COLLECTION_COLORS).optional(),
});
export type CreateCollectionInput = z.infer<typeof createCollectionSchema>;

export const updateCollectionSchema = createCollectionSchema
  .partial()
  .refine((value) => value.name !== undefined || value.color !== undefined, { error: 'Nothing to update' });
export type UpdateCollectionInput = z.infer<typeof updateCollectionSchema>;

export const lookupQuerySchema = z.object({ url });
