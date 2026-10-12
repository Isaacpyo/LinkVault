import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route } from 'react-router';
import { beforeEach, describe, expect, it } from 'vitest';
import { fakeFetch, renderWithProviders } from '../test/utils';
import { LoginPage } from './LoginPage';

const user = {
  id: 'u1',
  email: 'demo-1@demo.linkvault',
  name: 'Demo visitor',
  isDemo: true,
  demoExpiresAt: new Date(Date.now() + 86_400_000).toISOString(),
  createdAt: new Date().toISOString(),
};

beforeEach(() => localStorage.clear());

describe('LoginPage', () => {
  it('signs into a demo sandbox with one click', async () => {
    const { impl, calls } = fakeFetch({
      'POST /auth/demo': () => ({ status: 201, body: { token: 'demo-token', user } }),
    });
    renderWithProviders(<LoginPage />, {
      fetchImpl: impl,
      route: '/login',
      path: '/login',
      extraRoutes: <Route path="/" element={<p>Library home</p>} />,
    });
    await userEvent.click(screen.getByRole('button', { name: /try the demo/i }));
    expect(await screen.findByText('Library home')).toBeInTheDocument();
    expect(calls.map((c) => `${c.method} ${c.path}`)).toContain('POST /auth/demo');
    expect(JSON.parse(localStorage.getItem('linkvault.session') ?? '{}')).toMatchObject({ token: 'demo-token' });
  });

  it('shows API validation errors next to fields', async () => {
    const { impl } = fakeFetch({
      'POST /auth/register': () => ({
        status: 409,
        body: { error: { code: 'CONFLICT', message: 'An account with this email already exists' } },
      }),
    });
    renderWithProviders(<LoginPage />, { fetchImpl: impl, route: '/login', path: '/login' });
    const u = userEvent.setup();
    await u.click(screen.getByRole('tab', { name: 'Create account' }));
    await u.type(screen.getByLabelText('Email'), 'ada@example.com');
    await u.type(screen.getByLabelText('Password'), 'short');
    await u.click(screen.getByRole('button', { name: 'Create account' }));
    expect(screen.getByText('Use at least 8 characters')).toBeInTheDocument();
    await u.type(screen.getByLabelText('Password'), '-but-longer');
    await u.click(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('already exists');
  });
});
