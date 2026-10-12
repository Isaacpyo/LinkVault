import { PRODUCTION_API_URL, PRODUCTION_WEB_URL } from '../defaults';

export interface Settings {
  apiUrl: string;
  webUrl: string;
  /** Save immediately when the toolbar icon is clicked (one-click save). */
  autoSave: boolean;
  /** Send the page HTML as rendered in this browser (logged-in / JS-heavy pages). */
  capturePage: boolean;
}

export interface Session {
  token: string;
  email: string;
}

export const DEFAULT_SETTINGS: Settings = {
  apiUrl: (import.meta.env.VITE_API_URL as string | undefined) || PRODUCTION_API_URL,
  webUrl: (import.meta.env.VITE_WEB_URL as string | undefined) || PRODUCTION_WEB_URL,
  autoSave: true,
  capturePage: false,
};

const trimSlash = (url: string) => url.trim().replace(/\/+$/, '');

/** Merges stored values over defaults, ignoring anything malformed. */
export function mergeSettings(stored: Partial<Settings> | undefined): Settings {
  const s = stored ?? {};
  const url = (value: unknown, fallback: string) => {
    if (typeof value !== 'string') return fallback;
    try {
      const parsed = new URL(value);
      return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? trimSlash(value) : fallback;
    } catch {
      return fallback;
    }
  };
  return {
    apiUrl: url(s.apiUrl, DEFAULT_SETTINGS.apiUrl),
    webUrl: url(s.webUrl, DEFAULT_SETTINGS.webUrl),
    autoSave: typeof s.autoSave === 'boolean' ? s.autoSave : DEFAULT_SETTINGS.autoSave,
    capturePage: typeof s.capturePage === 'boolean' ? s.capturePage : DEFAULT_SETTINGS.capturePage,
  };
}

export async function getSettings(): Promise<Settings> {
  const { settings } = await chrome.storage.local.get('settings');
  return mergeSettings(settings as Partial<Settings> | undefined);
}

export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  const next = mergeSettings({ ...(await getSettings()), ...patch });
  await chrome.storage.local.set({ settings: next });
  return next;
}

export async function getSession(): Promise<Session | null> {
  const { session } = await chrome.storage.local.get('session');
  const s = session as Partial<Session> | undefined;
  return s && typeof s.token === 'string' && typeof s.email === 'string' ? { token: s.token, email: s.email } : null;
}

export async function setSession(session: Session | null): Promise<void> {
  if (session) await chrome.storage.local.set({ session });
  else await chrome.storage.local.remove('session');
}

/** URL that signs the web app into the extension's session (token in the fragment, never sent to a server). */
export function handoffUrl(webUrl: string, token: string): string {
  return `${trimSlash(webUrl)}/auth/handoff#token=${encodeURIComponent(token)}`;
}
