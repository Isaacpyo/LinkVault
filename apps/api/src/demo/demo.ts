import { randomBytes } from 'node:crypto';
import type { FastifyBaseLogger } from 'fastify';
import { domainOf, normalizeUrl } from '@linkvault/shared';
import { hashPassword } from '../auth/passwords.js';
import { textToHtml } from '../ingest/extract.js';
import { bookmarkIdFor, newId } from '../store/ids.js';
import type { BookmarkRecord, CollectionRecord, Store, UserRecord } from '../store/types.js';
import { SEED_BOOKMARKS, SEED_COLLECTIONS } from './seed-data.js';

export const LOCAL_DEMO_EMAIL = 'demo@linkvault.local';
export const LOCAL_DEMO_PASSWORD = 'linkvault-demo';

const DAY = 24 * 60 * 60 * 1000;
const countWords = (text: string) => (text.match(/[\p{L}\p{N}]+/gu) ?? []).length;

/** Fills a library with the demo collections and pre-extracted bookmarks. */
export async function seedLibrary(store: Store, userId: string, now = new Date()): Promise<void> {
  const iso = now.toISOString();
  const collections = new Map<string, CollectionRecord>();
  for (const seed of SEED_COLLECTIONS) {
    const collection: CollectionRecord = {
      id: newId(),
      userId,
      name: seed.name,
      color: seed.color,
      createdAt: iso,
      updatedAt: iso,
    };
    collections.set(seed.key, collection);
    await store.putCollection(collection);
  }

  const bookmarks = SEED_BOOKMARKS.map((seed, index): BookmarkRecord => {
    const normalizedUrl = normalizeUrl(seed.url);
    const content = seed.paragraphs.join('\n\n');
    const wordCount = countWords(content);
    // Stagger timestamps so "newest" ordering is stable and realistic.
    const created = new Date(now.getTime() - seed.daysAgo * DAY - index * 60_000).toISOString();
    return {
      id: bookmarkIdFor(userId, normalizedUrl),
      userId,
      url: seed.url,
      normalizedUrl,
      domain: domainOf(seed.url),
      title: seed.title,
      customTitle: false,
      excerpt: seed.paragraphs[0] ?? null,
      content,
      contentHtml: textToHtml(content),
      siteName: seed.siteName,
      byline: seed.byline ?? null,
      lang: 'en',
      tags: seed.tags,
      collectionId: seed.collection ? (collections.get(seed.collection)?.id ?? null) : null,
      readLater: seed.readLater ?? false,
      status: 'ready',
      error: null,
      wordCount,
      readingMinutes: Math.max(1, Math.ceil(wordCount / 230)),
      attempts: 0,
      createdAt: created,
      updatedAt: created,
      fetchedAt: created,
    };
  });
  await store.putBookmarks(bookmarks);
}

/** Creates an isolated, seeded sandbox account that expires after `ttlHours`. */
export async function createDemoSandbox(store: Store, ttlHours: number, now = new Date()): Promise<UserRecord> {
  const suffix = randomBytes(5).toString('hex');
  const user: UserRecord = {
    id: newId(),
    email: `demo-${suffix}@demo.linkvault`,
    name: 'Demo visitor',
    // Random secret: the sandbox can only be entered through its token.
    passwordHash: await hashPassword(randomBytes(24).toString('hex')),
    isDemo: true,
    demoExpiresAt: new Date(now.getTime() + ttlHours * 60 * 60 * 1000).toISOString(),
    createdAt: now.toISOString(),
  };
  await store.createUser(user);
  await seedLibrary(store, user.id, now);
  return user;
}

/** Local development convenience: a fixed, non-expiring account with the demo library. */
export async function ensureLocalDemoAccount(store: Store): Promise<{ created: boolean }> {
  if (await store.findUserByEmail(LOCAL_DEMO_EMAIL)) return { created: false };
  const now = new Date();
  const user: UserRecord = {
    id: newId(),
    email: LOCAL_DEMO_EMAIL,
    name: 'Local demo',
    passwordHash: await hashPassword(LOCAL_DEMO_PASSWORD),
    isDemo: false,
    demoExpiresAt: null,
    createdAt: now.toISOString(),
  };
  await store.createUser(user);
  await seedLibrary(store, user.id, now);
  return { created: true };
}

/** Deletes demo sandboxes past their expiry. Returns how many were removed. */
export async function cleanupExpiredDemos(store: Store, log: FastifyBaseLogger, now = new Date()): Promise<number> {
  let removed = 0;
  for (;;) {
    const expired = await store.listExpiredDemoUsers(now, 50);
    if (!expired.length) break;
    for (const user of expired) {
      await store.deleteUserData(user.id);
      removed++;
    }
    if (expired.length < 50) break;
  }
  if (removed) log.info({ removed }, 'expired demo sandboxes deleted');
  return removed;
}
