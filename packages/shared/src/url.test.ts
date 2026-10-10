import { describe, expect, it } from 'vitest';
import { domainOf, InvalidUrlError, isSaveableUrl, normalizeUrl } from './url.js';

describe('normalizeUrl', () => {
  it('lower-cases the host and drops the fragment and default port', () => {
    expect(normalizeUrl('HTTPS://Example.COM:443/Path#section')).toBe('https://example.com/Path');
  });

  it('removes tracking parameters and sorts the rest', () => {
    expect(normalizeUrl('https://example.com/a?utm_source=x&b=2&fbclid=abc&a=1&UTM_Medium=y')).toBe(
      'https://example.com/a?a=1&b=2',
    );
  });

  it('removes trailing slashes except on the root path', () => {
    expect(normalizeUrl('https://example.com/docs/')).toBe('https://example.com/docs');
    expect(normalizeUrl('https://example.com/')).toBe('https://example.com/');
    expect(normalizeUrl('https://example.com')).toBe('https://example.com/');
  });

  it('strips credentials and a trailing dot on the host', () => {
    expect(normalizeUrl('https://user:pass@example.com./x')).toBe('https://example.com/x');
  });

  it('keeps meaningful query parameters', () => {
    expect(normalizeUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe(
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    );
  });

  it('treats equivalent URLs as the same bookmark', () => {
    const a = normalizeUrl('https://Blog.example.com/post/?utm_campaign=news#top');
    const b = normalizeUrl('https://blog.example.com/post');
    expect(a).toBe(b);
  });

  it.each(['ftp://example.com/file', 'chrome://extensions', 'javascript:alert(1)', 'not a url', ''])(
    'rejects %s',
    (input) => {
      expect(() => normalizeUrl(input)).toThrow(InvalidUrlError);
    },
  );
});

describe('isSaveableUrl', () => {
  it('accepts http and https', () => {
    expect(isSaveableUrl('http://example.com')).toBe(true);
    expect(isSaveableUrl('https://example.com/a?b=c')).toBe(true);
  });

  it('rejects browser-internal and malformed URLs', () => {
    expect(isSaveableUrl('chrome://newtab')).toBe(false);
    expect(isSaveableUrl('about:blank')).toBe(false);
    expect(isSaveableUrl('file:///etc/passwd')).toBe(false);
    expect(isSaveableUrl('example.com')).toBe(false);
  });
});

describe('domainOf', () => {
  it('strips www and returns the host', () => {
    expect(domainOf('https://www.example.co.uk/x')).toBe('example.co.uk');
    expect(domainOf('https://docs.opensearch.org/latest')).toBe('docs.opensearch.org');
  });

  it('returns an empty string for invalid input', () => {
    expect(domainOf('nope')).toBe('');
  });
});
