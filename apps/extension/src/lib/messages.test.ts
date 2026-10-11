import { describe, expect, it } from 'vitest';
import { acceptsApiUrl, allowedWebOrigins, isConnectMessage, isTrustedSender } from './messages';

const manifest = {
  manifest_version: 3,
  name: 'x',
  version: '1',
  content_scripts: [{ matches: ['https://linkvault.example.com/*', 'http://localhost:5173/*'], js: ['content.js'] }],
} as chrome.runtime.Manifest;

describe('connect messages', () => {
  it('validates the message shape', () => {
    expect(
      isConnectMessage({ type: 'CONNECT', token: 'x'.repeat(20), email: 'a@b.c', apiUrl: 'https://api.example.com' }),
    ).toBe(true);
    expect(
      isConnectMessage({ type: 'CONNECT', token: 'short', email: 'a@b.c', apiUrl: 'https://api.example.com' }),
    ).toBe(false);
    expect(
      isConnectMessage({ type: 'CONNECT', token: 'x'.repeat(20), email: 'a@b.c', apiUrl: 'javascript:alert(1)' }),
    ).toBe(false);
    expect(isConnectMessage(null)).toBe(false);
  });

  it('derives allowed origins from the content script matches', () => {
    expect(allowedWebOrigins(manifest)).toEqual(['https://linkvault.example.com', 'http://localhost:5173']);
  });

  it('trusts only this extension’s content script on the web app origin', () => {
    const origins = allowedWebOrigins(manifest);
    expect(isTrustedSender({ id: 'ext', origin: 'https://linkvault.example.com' }, 'ext', origins)).toBe(true);
    expect(isTrustedSender({ id: 'ext', url: 'http://localhost:5173/settings' }, 'ext', origins)).toBe(true);
    expect(isTrustedSender({ id: 'ext', origin: 'https://evil.example.com' }, 'ext', origins)).toBe(false);
    expect(isTrustedSender({ id: 'other', origin: 'https://linkvault.example.com' }, 'ext', origins)).toBe(false);
  });
});

describe('acceptsApiUrl', () => {
  const allowed = { defaultApiUrl: 'https://api.example.com', currentApiUrl: 'http://localhost:4000' };
  it('accepts only the build default or the configured API', () => {
    expect(acceptsApiUrl('https://api.example.com/', allowed)).toBe(true);
    expect(acceptsApiUrl('http://localhost:4000', allowed)).toBe(true);
    expect(acceptsApiUrl('https://attacker.example.com', allowed)).toBe(false);
  });
});
