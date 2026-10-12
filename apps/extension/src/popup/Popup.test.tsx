import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { installChromeMock } from '../../test/chrome';
import { Popup } from './Popup';

const bookmark = (overrides = {}) => ({
  id: 'b1',
  url: 'https://example.com/article',
  domain: 'example.com',
  title: 'An article',
  tags: [],
  collectionId: null,
  readLater: false,
  status: 'ready',
  wordCount: 1234,
  error: null,
  ...overrides,
});

function stubFetch(handler: (method: string, path: string, body: unknown) => Response) {
  const calls: Array<{ method: string; path: string; body: unknown }> = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string, init: RequestInit = {}) => {
      const url = new URL(input);
      const call = {
        method: init.method ?? 'GET',
        path: url.pathname,
        body: init.body ? JSON.parse(String(init.body)) : undefined,
      };
      calls.push(call);
      return handler(call.method, call.path, call.body);
    }),
  );
  return calls;
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe('Popup', () => {
  it('saves the current tab as soon as it opens, then applies tags', async () => {
    const { store } = installChromeMock();
    store.session = { token: 'token-123456789', email: 'ada@example.com' };
    const calls = stubFetch((method, path) => {
      if (method === 'POST' && path === '/bookmarks') return json({ bookmark: bookmark(), created: true }, 201);
      if (method === 'PATCH' && path === '/bookmarks/b1') return json({ bookmark: bookmark({ tags: ['later'] }) });
      if (path === '/collections') return json({ collections: [] });
      if (path === '/library/summary') return json({ tags: [] });
      return json({}, 404);
    });

    render(<Popup />);
    expect(await screen.findByText('Saved to LinkVault.')).toBeInTheDocument();
    expect(screen.getByText(/1,234 words indexed/)).toBeInTheDocument();
    expect(calls[0]).toEqual({
      method: 'POST',
      path: '/bookmarks',
      body: { url: 'https://example.com/article', title: 'An article' },
    });

    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Tags'), 'later{Enter}');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() =>
      expect(calls).toContainEqual({
        method: 'PATCH',
        path: '/bookmarks/b1',
        body: { tags: ['later'], collectionId: null, readLater: false },
      }),
    );
    expect(await screen.findByText('Changes saved')).toBeInTheDocument();
  });

  it('asks signed-out users to sign in, then saves', async () => {
    installChromeMock();
    stubFetch((method, path) => {
      if (path === '/auth/login') return json({ token: 'fresh-token-123', user: { email: 'ada@example.com' } });
      if (method === 'POST' && path === '/bookmarks')
        return json({ bookmark: bookmark({ status: 'pending' }), created: false });
      if (path === '/bookmarks/b1') return json({ bookmark: bookmark() });
      return json({ collections: [], tags: [] });
    });
    render(<Popup />);
    const user = userEvent.setup();
    await user.type(await screen.findByPlaceholderText('Email'), 'ada@example.com');
    await user.type(screen.getByPlaceholderText('Password'), 'correct horse');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText('Already in your library.')).toBeInTheDocument();
  });

  it('signs out and asks to sign in again when the session has expired', async () => {
    const { store } = installChromeMock();
    store.session = { token: 'expired-token-123', email: 'ada@example.com' };
    stubFetch(() =>
      json({ error: { code: 'UNAUTHORIZED', message: 'Your session has expired. Sign in again.' } }, 401),
    );
    render(<Popup />);
    expect(await screen.findByText(/session has expired/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument();
    expect(store.session).toBeUndefined();
  });

  it('explains that browser pages cannot be saved', async () => {
    const { store } = installChromeMock({ tab: { url: 'chrome://extensions', title: 'Extensions' } });
    store.session = { token: 'token-123456789', email: 'ada@example.com' };
    stubFetch(() => json({}));
    render(<Popup />);
    expect(await screen.findByText(/can't be saved/)).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });
});
