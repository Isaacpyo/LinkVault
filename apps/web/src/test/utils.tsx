import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { ToastProvider } from '../components/Toast';
import { ApiClient } from '../lib/api';
import { AuthProvider } from '../lib/auth';
import { WakeTracker } from '../lib/wake';

export type Handler = (
  url: URL,
  init: RequestInit,
) => { status?: number; body?: unknown } | Promise<{ status?: number; body?: unknown }>;

/** fetch stub routing by "METHOD /path". */
export function fakeFetch(routes: Record<string, Handler>) {
  const calls: Array<{ method: string; path: string; body: unknown }> = [];
  const impl: typeof fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    const method = init.method ?? 'GET';
    calls.push({ method, path: url.pathname, body: init.body ? JSON.parse(String(init.body)) : undefined });
    const handler = routes[`${method} ${url.pathname}`];
    if (!handler)
      return new Response(JSON.stringify({ error: { code: 'NOT_FOUND', message: 'not stubbed' } }), { status: 404 });
    const { status = 200, body = null } = await handler(url, init);
    return new Response(status === 204 ? null : JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  };
  return { impl, calls };
}

export function renderWithProviders(
  ui: ReactElement,
  options: { fetchImpl: typeof fetch; route?: string; path?: string; extraRoutes?: ReactElement },
) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const api = new ApiClient({
    baseUrl: 'http://api.test',
    fetchImpl: options.fetchImpl,
    tracker: new WakeTracker(),
    sleep: async () => {},
    getToken: () => 'test-token',
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[options.route ?? '/']}>
        <AuthProvider api={api}>
          <ToastProvider>
            <Routes>
              <Route path={options.path ?? '/'} element={ui} />
              {options.extraRoutes}
            </Routes>
          </ToastProvider>
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
