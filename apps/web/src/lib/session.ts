import type { PublicUser } from '@linkvault/shared';

/**
 * The session (JWT + user) lives in localStorage because the API is on another
 * site, where cookies would be third-party and blocked. The trade-off — tokens
 * readable by injected script — is mitigated by a strict CSP and by sanitizing
 * every piece of third-party HTML before it is rendered.
 */
export interface Session {
  token: string;
  user: PublicUser;
}

const KEY = 'linkvault.session';

export function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const session = JSON.parse(raw) as Session;
    if (typeof session.token !== 'string' || typeof session.user?.id !== 'string') return null;
    if (session.user.demoExpiresAt && new Date(session.user.demoExpiresAt).getTime() < Date.now()) return null;
    return session;
  } catch {
    return null;
  }
}

export function saveSession(session: Session | null): void {
  try {
    if (session) localStorage.setItem(KEY, JSON.stringify(session));
    else localStorage.removeItem(KEY);
  } catch {
    // Storage can be unavailable (private mode); the session then lasts for this tab only.
  }
}
