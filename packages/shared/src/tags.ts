export const MAX_TAGS = 20;
export const MAX_TAG_LENGTH = 32;

/**
 * Canonical tag: lower-case, no leading "#", whitespace collapsed to "-",
 * only letters, digits and - _ . + kept. Returns "" when nothing is left.
 */
export function normalizeTag(raw: string): string {
  return raw
    .trim()
    .replace(/^#+/, '')
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^\p{L}\p{N}\-_.+]/gu, '')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_TAG_LENGTH);
}

/**
 * Parses tags from free text ("react, #CSS , web perf") or an array.
 * Commas and newlines separate tags; result is normalized, de-duplicated and capped.
 */
export function parseTags(input: string | readonly string[] | null | undefined): string[] {
  if (!input) return [];
  const parts = typeof input === 'string' ? input.split(/[,\n]/) : input;
  const seen = new Set<string>();
  for (const part of parts) {
    const tag = normalizeTag(part);
    if (tag) seen.add(tag);
    if (seen.size >= MAX_TAGS) break;
  }
  return [...seen];
}

/** Union of two tag lists, preserving order of first appearance. */
export function mergeTags(existing: readonly string[], incoming: readonly string[]): string[] {
  return parseTags([...existing, ...incoming]);
}
