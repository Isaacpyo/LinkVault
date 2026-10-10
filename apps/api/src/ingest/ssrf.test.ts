import { describe, expect, it } from 'vitest';
import { assertFetchableUrl, BlockedUrlError, isPublicAddress, safeLookup } from './ssrf.js';

describe('isPublicAddress', () => {
  it.each(['8.8.8.8', '1.1.1.1', '93.184.216.34', '2606:4700:4700::1111'])('allows public %s', (ip) => {
    expect(isPublicAddress(ip)).toBe(true);
  });

  it.each([
    '127.0.0.1',
    '10.0.0.5',
    '172.16.3.4',
    '192.168.1.1',
    '169.254.169.254', // cloud metadata
    '100.64.0.1', // carrier-grade NAT
    '0.0.0.0',
    '255.255.255.255',
    '224.0.0.1',
    '::1',
    '::',
    'fe80::1',
    'fc00::1',
    '::ffff:127.0.0.1', // IPv4-mapped loopback
    '::ffff:169.254.169.254',
    'not-an-ip',
  ])('blocks %s', (ip) => {
    expect(isPublicAddress(ip)).toBe(false);
  });
});

describe('assertFetchableUrl', () => {
  it('accepts ordinary public URLs', () => {
    expect(assertFetchableUrl('https://example.com/post?id=1').hostname).toBe('example.com');
    expect(assertFetchableUrl('http://93.184.216.34/').hostname).toBe('93.184.216.34');
  });

  it.each([
    ['ftp://example.com/file', /http and https/],
    ['https://user:pw@example.com/', /credentials/],
    ['https://example.com:8080/', /standard ports/],
    ['http://localhost/admin', /Internal hostnames/],
    ['http://printer.local/', /Internal hostnames/],
    ['http://intranet/', /Internal hostnames/],
    ['http://127.0.0.1/', /Private/],
    ['http://2130706433/', /Private/], // decimal-encoded 127.0.0.1
    ['http://0x7f.1/', /Private/],
    ['http://[::1]/', /Private/],
    ['http://169.254.169.254/latest/meta-data/', /Private/],
  ])('rejects %s', (url, message) => {
    expect(() => assertFetchableUrl(url)).toThrow(message);
  });

  it('allows private targets only when explicitly enabled (dev/e2e)', () => {
    expect(() => assertFetchableUrl('http://localhost:4599/page', true)).not.toThrow();
    expect(() => assertFetchableUrl('file:///etc/passwd', true)).toThrow(BlockedUrlError);
  });
});

describe('safeLookup', () => {
  const lookup = (host: string, all: boolean) =>
    new Promise<{ err: Error | null; address: unknown }>((resolve) =>
      safeLookup(host, { all }, (err, address) => resolve({ err, address })),
    );

  it('refuses hostnames that resolve to private addresses', async () => {
    const { err } = await lookup('localhost', true);
    expect(err).toBeInstanceOf(BlockedUrlError);
  });

  it('passes through DNS errors', async () => {
    const { err } = await lookup('does-not-exist.invalid', false);
    expect(err).toBeTruthy();
  });
});
