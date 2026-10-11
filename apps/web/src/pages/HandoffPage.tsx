import { useEffect, useRef, useState } from 'react';
import { Navigate } from 'react-router';
import { ErrorState } from '../components/States';
import { Spinner } from '../components/ui';
import { ApiClient, errorMessage } from '../lib/api';
import { useAuth } from '../lib/auth';

/**
 * Receives a session from the extension popup ("Open library"): the token
 * arrives in the URL fragment (never sent to a server) and is removed from the
 * address bar and history immediately.
 */
export function HandoffPage() {
  const { adopt, api } = useAuth();
  const [state, setState] = useState<'working' | 'done' | 'error'>('working');
  const [message, setMessage] = useState('');
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const token = new URLSearchParams(window.location.hash.slice(1)).get('token');
    window.history.replaceState(null, '', '/auth/handoff');
    if (!token) {
      setMessage('No session was provided.');
      setState('error');
      return;
    }
    const client = new ApiClient({ baseUrl: api.baseUrl, getToken: () => token });
    client
      .me()
      .then(({ user }) => {
        adopt({ token, user });
        setState('done');
      })
      .catch((error: unknown) => {
        setMessage(errorMessage(error));
        setState('error');
      });
  }, [adopt, api.baseUrl]);

  if (state === 'done') return <Navigate to="/" replace />;
  return (
    <main id="main" className="mx-auto flex min-h-dvh max-w-md items-center justify-center px-4">
      {state === 'error' ? (
        <ErrorState title="Couldn't sign you in from the extension" message={message} />
      ) : (
        <Spinner label="Signing you in" />
      )}
    </main>
  );
}
