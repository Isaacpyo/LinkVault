import { createHash, randomUUID } from 'node:crypto';

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

/**
 * Deterministic bookmark id: one document per (user, normalized URL). Saving the
 * same page twice resolves to the same id, which makes saves idempotent.
 */
export const bookmarkIdFor = (userId: string, normalizedUrl: string) =>
  sha256(`${userId}\n${normalizedUrl}`).slice(0, 32);

/** Deterministic user document id so `op_type=create` enforces unique emails without a race. */
export const userDocIdFor = (email: string) => sha256(email.trim().toLowerCase()).slice(0, 40);

export const newId = () => randomUUID();
