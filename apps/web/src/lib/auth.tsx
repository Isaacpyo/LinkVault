import { useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { AuthResponse, PublicUser } from '@linkvault/shared';
import { ApiClient } from './api';
import { clearOffline } from './offline';
import { loadSession, saveSession, type Session } from './session';

interface AuthContextValue {
  user: PublicUser | null;
  token: string | null;
  api: ApiClient;
  /** Set when the session ended on its own (expired token); shown on the login page. */
  notice: string | null;
  login(email: string, password: string): Promise<void>;
  register(email: string, password: string, name?: string): Promise<void>;
  startDemo(): Promise<void>;
  /** Adopt a session handed over by the extension. */
  adopt(session: AuthResponse): void;
  logout(notice?: string): Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children, api: injected }: { children: ReactNode; api?: ApiClient }) {
  const queryClient = useQueryClient();
  const [session, setSession] = useState<Session | null>(() => loadSession());
  const [notice, setNotice] = useState<string | null>(null);
  const sessionRef = useRef(session);
  sessionRef.current = session;

  const update = useCallback((next: Session | null) => {
    saveSession(next);
    setSession(next);
  }, []);

  const logoutRef = useRef<(notice?: string) => Promise<void>>(async () => {});

  const api = useMemo(
    () =>
      injected ??
      new ApiClient({
        getToken: () => sessionRef.current?.token ?? null,
        onUnauthorized: () => void logoutRef.current('Your session has ended. Please sign in again.'),
      }),
    [injected],
  );

  const logout = useCallback(
    async (message?: string) => {
      update(null);
      setNotice(message ?? null);
      queryClient.clear();
      // Offline copies belong to the signed-out user.
      await clearOffline().catch(() => {});
    },
    [queryClient, update],
  );
  logoutRef.current = logout;

  const begin = useCallback(
    (response: AuthResponse) => {
      queryClient.clear();
      setNotice(null);
      update({ token: response.token, user: response.user });
    },
    [queryClient, update],
  );

  // Refresh the user in the background (picks up deleted/expired accounts).
  const initialToken = useRef(session?.token);
  useEffect(() => {
    if (!initialToken.current) return;
    api
      .me()
      .then(({ user }) => {
        const current = sessionRef.current;
        if (current) update({ ...current, user });
      })
      .catch(() => {
        // 401s are handled by onUnauthorized; network errors keep the cached session (offline use).
      });
  }, [api, update]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user: session?.user ?? null,
      token: session?.token ?? null,
      api,
      notice,
      login: async (email, password) => begin(await api.login({ email, password })),
      register: async (email, password, name) => begin(await api.register({ email, password, ...(name && { name }) })),
      startDemo: async () => begin(await api.demo()),
      adopt: begin,
      logout,
    }),
    [api, begin, logout, notice, session],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>');
  return context;
}
