import type { PublicUser } from '@linkvault/shared';
import { LogIn } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Navigate, useNavigate } from 'react-router';
import { Wordmark } from '../components/Logo';
import { ErrorState } from '../components/States';
import { Button, Spinner } from '../components/ui';
import { errorMessage } from '../lib/api';
import { useAuth } from '../lib/auth';

type State =
  | { kind: 'checking' }
  | { kind: 'confirm'; token: string; user: PublicUser }
  | { kind: 'done' }
  | { kind: 'error'; message: string };

/**
 * Receives a session from the extension popup ("Open library"). The token arrives
 * in the URL fragment (never sent to a server) and is removed from the address bar
 * immediately. Because anyone can craft such a link, switching to a different
 * account always needs an explicit confirmation — otherwise a link could silently
 * sign you into someone else's library.
 */
export function HandoffPage() {
  const { adopt, api, user: current } = useAuth();
  const navigate = useNavigate();
  const [state, setState] = useState<State>({ kind: 'checking' });
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const token = new URLSearchParams(window.location.hash.slice(1)).get('token');
    window.history.replaceState(null, '', '/auth/handoff');
    if (!token) {
      setState({ kind: 'error', message: 'No session was provided.' });
      return;
    }
    api
      .withToken(token)
      .me()
      .then(({ user }) => {
        if (current?.id === user.id) {
          adopt({ token, user });
          setState({ kind: 'done' });
        } else {
          setState({ kind: 'confirm', token, user });
        }
      })
      .catch((error: unknown) => setState({ kind: 'error', message: errorMessage(error) }));
  }, [adopt, api, current?.id]);

  if (state.kind === 'done') return <Navigate to="/" replace />;
  return (
    <main id="main" className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-8 px-4">
      <Wordmark />
      {state.kind === 'checking' && <Spinner label="Checking the session" />}
      {state.kind === 'error' && <ErrorState title="Couldn't sign you in from the extension" message={state.message} />}
      {state.kind === 'confirm' && (
        <section
          aria-labelledby="handoff-title"
          className="w-full rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900"
        >
          <LogIn className="mx-auto mb-3 size-8 text-indigo-600" aria-hidden />
          <h1 id="handoff-title" className="text-lg font-semibold">
            Continue as {state.user.email}?
          </h1>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
            {current
              ? `The extension is signed in to a different account. Continuing signs you out of ${current.email} here.`
              : 'Only continue if you just clicked “Open library” in the LinkVault extension.'}
          </p>
          <div className="mt-6 flex justify-center gap-2">
            <Button variant="secondary" onClick={() => void navigate(current ? '/' : '/login', { replace: true })}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                adopt({ token: state.token, user: state.user });
                setState({ kind: 'done' });
              }}
            >
              Continue
            </Button>
          </div>
        </section>
      )}
    </main>
  );
}
