/**
 * Query parameters that only carry attribution/tracking data. Removing them lets
 * the same article shared from two places dedupe to one bookmark.
 */
const TRACKING_PARAMS = new Set([
  'fbclid',
  'gclid',
  'dclid',
  'gbraid',
  'wbraid',
  'msclkid',
  'yclid',
  'igshid',
  'mc_cid',
  'mc_eid',
  '_hsenc',
  '_hsmi',
  'ref_src',
  'ref_url',
]);

export class InvalidUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidUrlError';
  }
}

/** True for http(s) URLs that the API can fetch. Rejects chrome://, file://, about:, etc. */
export function isSaveableUrl(input: string): boolean {
  try {
    const url = new URL(input);
    return (url.protocol === 'http:' || url.protocol === 'https:') && url.hostname.length > 0;
  } catch {
    return false;
  }
}

/**
 * Canonical form of a URL used for de-duplication:
 * lower-cased host, no credentials, no fragment, no default port, no tracking
 * params, sorted query string and no trailing slash (except for the root path).
 */
export function normalizeUrl(input: string): string {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    throw new InvalidUrlError('Not a valid URL');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new InvalidUrlError('Only http and https URLs can be saved');
  }
  if (!url.hostname) throw new InvalidUrlError('URL has no host');

  url.username = '';
  url.password = '';
  url.hash = '';
  url.hostname = url.hostname.replace(/\.$/, '');

  const kept = [...url.searchParams.entries()]
    .filter(([key]) => !key.toLowerCase().startsWith('utm_') && !TRACKING_PARAMS.has(key.toLowerCase()))
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  url.search = new URLSearchParams(kept).toString();

  if (url.pathname.length > 1 && url.pathname.endsWith('/')) {
    url.pathname = url.pathname.replace(/\/+$/, '');
  }
  return url.toString();
}

/** Host without a leading "www." — used for display and as a search/filter field. */
export function domainOf(input: string): string {
  try {
    return new URL(input).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}
