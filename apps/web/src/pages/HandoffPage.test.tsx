import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route } from 'react-router';
import { beforeEach, describe, expect, it } from 'vitest';
import { fakeFetch, renderWithProviders } from '../test/utils';
import { HandoffPage } from './HandoffPage';

const attacker = {
  id: 'u2',
  email: 'someone-else@example.com',
  name: null,
  isDemo: false,
  demoExpiresAt: null,
  createdAt: '',
};

beforeEach(() => {
  localStorage.clear();
  window.location.hash = '#token=handed-over-token';
});

describe('HandoffPage', () => {
  it('asks before adopting a session from a link and removes the token from the URL', async () => {
    const { impl } = fakeFetch({ 'GET /auth/me': () => ({ body: { user: attacker } }) });
    renderWithProviders(<HandoffPage />, {
      fetchImpl: impl,
      route: '/auth/handoff',
      path: '/auth/handoff',
      extraRoutes: <Route path="/" element={<p>Library home</p>} />,
    });
    expect(await screen.findByRole('heading', { name: 'Continue as someone-else@example.com?' })).toBeInTheDocument();
    expect(window.location.hash).toBe('');
    expect(localStorage.getItem('linkvault.session')).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByText('Library home')).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem('linkvault.session') ?? '{}')).toMatchObject({ token: 'handed-over-token' });
  });

  it('does nothing when the user cancels', async () => {
    const { impl } = fakeFetch({ 'GET /auth/me': () => ({ body: { user: attacker } }) });
    renderWithProviders(<HandoffPage />, {
      fetchImpl: impl,
      route: '/auth/handoff',
      path: '/auth/handoff',
      extraRoutes: <Route path="/login" element={<p>Login page</p>} />,
    });
    await userEvent.click(await screen.findByRole('button', { name: 'Cancel' }));
    expect(await screen.findByText('Login page')).toBeInTheDocument();
    expect(localStorage.getItem('linkvault.session')).toBeNull();
  });
});
