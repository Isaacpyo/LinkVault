import { useQueryClient } from '@tanstack/react-query';
import { useEffect, type ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router';
import { AppShell } from './components/AppShell';
import { useAuth } from './lib/auth';
import { useOnline } from './lib/hooks';
import { syncReadLater } from './lib/offline';
import { keys } from './lib/queries';
import { HandoffPage } from './pages/HandoffPage';
import { LibraryPage } from './pages/LibraryPage';
import { LoginPage } from './pages/LoginPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { ReaderPage } from './pages/ReaderPage';
import { ReadingListPage } from './pages/ReadingListPage';
import { SettingsPage } from './pages/SettingsPage';

function RequireAuth({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const location = useLocation();
  if (!user) return <Navigate to="/login" replace state={{ from: `${location.pathname}${location.search}` }} />;
  return children;
}

function PublicOnly({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  return user ? <Navigate to="/" replace /> : children;
}

/** Wakes the API as soon as the app loads and keeps offline copies in sync when online. */
function BackgroundTasks() {
  const { api, user } = useAuth();
  const online = useOnline();
  const queryClient = useQueryClient();

  useEffect(() => {
    void queryClient.prefetchQuery({ queryKey: keys.health, queryFn: api.health });
  }, [api, queryClient]);

  useEffect(() => {
    if (!user || !online) return;
    syncReadLater(api)
      .then(() => queryClient.invalidateQueries({ queryKey: ['offline-articles'] }))
      .catch(() => {});
  }, [api, online, queryClient, user]);

  return null;
}

export function App() {
  return (
    <>
      <BackgroundTasks />
      <Routes>
        <Route
          path="/login"
          element={
            <PublicOnly>
              <LoginPage />
            </PublicOnly>
          }
        />
        <Route path="/auth/handoff" element={<HandoffPage />} />
        <Route
          path="/read/:id"
          element={
            <RequireAuth>
              <ReaderPage />
            </RequireAuth>
          }
        />
        <Route
          element={
            <RequireAuth>
              <AppShell />
            </RequireAuth>
          }
        >
          <Route index element={<LibraryPage />} />
          <Route path="reading-list" element={<ReadingListPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </>
  );
}
