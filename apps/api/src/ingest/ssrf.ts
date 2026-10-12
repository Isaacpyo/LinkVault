import dns from 'node:dns';
import type { LookupAddress, LookupOptions } from 'node:dns';
import ipaddr from 'ipaddr.js';

/**
 * SSRF guard for the page fetcher. The API fetches arbitrary user-supplied URLs,
 * so without this anyone could make it read cloud metadata (169.254.169.254),
 * localhost admin ports or other private services.
 *
 * Two layers:
 *  1. `assertFetchableUrl` rejects bad schemes, ports, internal hostnames and
 *     private IP literals before any network activity.
 *  2. `safeLookup` is installed as the socket's DNS resolver, so the address that
 *     is actually connected to is checked — this also defeats DNS rebinding,
 *     because there is no gap between "check" and "use".
 */

export class BlockedUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BlockedUrlError';
  }
}

const ALLOWED_PORTS = new Set(['', '80', '443']);
const INTERNAL_HOST_SUFFIXES = ['.localhost', '.local', '.internal', '.lan', '.home.arpa'];

/** True only for globally routable unicast addresses (IPv4 or IPv6, including IPv4-mapped IPv6). */
export function isPublicAddress(address: string): boolean {
  if (!ipaddr.isValid(address)) return false;
  let parsed = ipaddr.parse(address);
  if (parsed.kind() === 'ipv6') {
    const v6 = parsed as ipaddr.IPv6;
    if (v6.isIPv4MappedAddress()) parsed = v6.toIPv4Address();
    // Deprecated IPv4-compatible addresses (::a.b.c.d) embed an IPv4 address; never fetch them.
    else if (v6.parts.slice(0, 6).every((part) => part === 0)) return false;
  }
  return parsed.range() === 'unicast';
}

const stripBrackets = (host: string) => host.replace(/^\[|\]$/g, '');

/** Validates a URL before fetching. `allowPrivate` (dev/e2e only) skips the network checks. */
export function assertFetchableUrl(input: string, allowPrivate = false): URL {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new BlockedUrlError('Not a valid URL');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new BlockedUrlError('Only http and https URLs can be fetched');
  }
  if (url.username || url.password) throw new BlockedUrlError('URLs with credentials are not fetched');
  if (allowPrivate) return url;

  if (!ALLOWED_PORTS.has(url.port)) throw new BlockedUrlError('Only standard ports (80 and 443) can be fetched');
  const host = stripBrackets(url.hostname).toLowerCase();
  if (host === 'localhost' || INTERNAL_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix)) || !host.includes('.')) {
    if (!ipaddr.isValid(host)) throw new BlockedUrlError('Internal hostnames cannot be fetched');
  }
  if (ipaddr.isValid(host) && !isPublicAddress(host)) {
    throw new BlockedUrlError('Private and reserved network addresses cannot be fetched');
  }
  return url;
}

type LookupCallback = (err: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void;

/**
 * Drop-in replacement for `dns.lookup` used by the HTTP agent. Resolves all
 * addresses, discards non-public ones and fails if none are left.
 */
export function safeLookup(hostname: string, options: LookupOptions, callback: LookupCallback): void {
  dns.lookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return callback(err, '');
    const allowed = addresses.filter((entry) => isPublicAddress(entry.address));
    if (!allowed.length) {
      return callback(new BlockedUrlError(`${hostname} resolves to a private or reserved address`), '');
    }
    if (options.all) return callback(null, allowed);
    const first = allowed[0]!;
    return callback(null, first.address, first.family);
  });
}
