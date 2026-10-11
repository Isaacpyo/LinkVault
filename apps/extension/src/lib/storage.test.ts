import { beforeEach, describe, expect, it } from 'vitest';
import { installChromeMock } from '../../test/chrome';
import {
  DEFAULT_SETTINGS,
  getSession,
  getSettings,
  handoffUrl,
  mergeSettings,
  saveSettings,
  setSession,
} from './storage';

describe('mergeSettings', () => {
  it('falls back to defaults for missing or malformed values', () => {
    expect(mergeSettings(undefined)).toEqual(DEFAULT_SETTINGS);
    expect(mergeSettings({ apiUrl: 'javascript:alert(1)', autoSave: 'yes' as unknown as boolean })).toEqual(
      DEFAULT_SETTINGS,
    );
  });

  it('keeps valid overrides and trims trailing slashes', () => {
    expect(mergeSettings({ apiUrl: 'http://localhost:4000/', capturePage: true })).toMatchObject({
      apiUrl: 'http://localhost:4000',
      capturePage: true,
    });
  });
});

describe('storage', () => {
  beforeEach(() => {
    installChromeMock();
  });

  it('round-trips settings and sessions through chrome.storage', async () => {
    await saveSettings({ webUrl: 'http://localhost:5173' });
    expect((await getSettings()).webUrl).toBe('http://localhost:5173');
    expect(await getSession()).toBeNull();
    await setSession({ token: 't'.repeat(20), email: 'a@example.com' });
    expect(await getSession()).toEqual({ token: 't'.repeat(20), email: 'a@example.com' });
    await setSession(null);
    expect(await getSession()).toBeNull();
  });
});

describe('handoffUrl', () => {
  it('puts the token in the fragment so it never reaches a server', () => {
    expect(handoffUrl('https://app.example.com/', 'a.b+c')).toBe('https://app.example.com/auth/handoff#token=a.b%2Bc');
  });
});
