import { ArrowRight, BookmarkPlus, Search, WifiOff } from 'lucide-react';
import { useState, type FormEvent, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { WakeBanner } from '../components/Banners';
import { Wordmark } from '../components/Logo';
import { Button, Field, inputClass } from '../components/ui';
import { ApiError, errorMessage } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useDocumentTitle } from '../lib/hooks';

type Mode = 'login' | 'register';

function Feature({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <li className="flex gap-3">
      <span
        className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-white/15 text-white"
        aria-hidden
      >
        {icon}
      </span>
      <span>
        <span className="block font-semibold text-white">{title}</span>
        <span className="text-sm text-indigo-100">{children}</span>
      </span>
    </li>
  );
}

export function LoginPage() {
  useDocumentTitle('Sign in');
  const { login, register, startDemo, notice } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? '/';
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState<'form' | 'demo' | null>(null);

  const run = async (kind: 'form' | 'demo', action: () => Promise<void>) => {
    setPending(kind);
    setErrors({});
    try {
      await action();
      void navigate(from, { replace: true });
    } catch (error) {
      setErrors(
        error instanceof ApiError && Object.keys(error.fields).length ? error.fields : { _: errorMessage(error) },
      );
    } finally {
      setPending(null);
    }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const next: Record<string, string> = {};
    if (!email.trim()) next.email = 'Email is required';
    if (mode === 'register' && password.length < 8) next.password = 'Use at least 8 characters';
    if (!password) next.password = 'Password is required';
    if (Object.keys(next).length) return setErrors(next);
    void run('form', () => (mode === 'login' ? login(email, password) : register(email, password)));
  };

  return (
    <div className="flex min-h-dvh flex-col">
      <WakeBanner />
      <div className="grid flex-1 lg:grid-cols-2">
        <section className="relative hidden overflow-hidden bg-gradient-to-br from-indigo-600 via-indigo-700 to-violet-800 p-12 lg:flex lg:flex-col lg:justify-between">
          <div className="text-white [&_span]:text-white">
            <Wordmark />
          </div>
          <div className="max-w-md">
            <h1 className="text-4xl font-bold leading-tight tracking-tight text-white">
              Save it once. Find it by what it said.
            </h1>
            <p className="mt-4 text-lg text-indigo-100">
              LinkVault keeps the full text of every page you save, so search finds the article you half-remember — not
              just its title.
            </p>
            <ul className="mt-10 space-y-5">
              <Feature icon={<BookmarkPlus className="size-4" />} title="One-click saving">
                The Chrome extension saves the current tab with tags and a collection.
              </Feature>
              <Feature icon={<Search className="size-4" />} title="Full-text search">
                Readability extracts the article; OpenSearch indexes it with highlighted snippets.
              </Feature>
              <Feature icon={<WifiOff className="size-4" />} title="Read later, offline">
                Reading-list articles are cached by a service worker for offline reading.
              </Feature>
            </ul>
          </div>
          <p className="text-sm text-indigo-200">Open source · React · Node.js · OpenSearch</p>
        </section>

        <main id="main" className="flex items-center justify-center px-4 py-10 sm:px-8">
          <div className="w-full max-w-sm">
            <div className="mb-8 lg:hidden">
              <Wordmark />
              <p className="mt-3 text-slate-600 dark:text-slate-300">
                Bookmarks with full-text search and offline reading.
              </p>
            </div>

            {notice && (
              <p
                role="status"
                className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-500/10 dark:text-amber-100"
              >
                {notice}
              </p>
            )}

            <Button
              className="w-full py-3 text-base"
              loading={pending === 'demo'}
              disabled={pending === 'form'}
              onClick={() => void run('demo', startDemo)}
            >
              Try the demo <ArrowRight className="size-4" aria-hidden />
            </Button>
            <p className="mt-2 text-center text-xs text-slate-500 dark:text-slate-400">
              No sign-up. You get a private sandbox with sample bookmarks for 24 hours.
            </p>

            <div className="my-6 flex items-center gap-3 text-xs uppercase tracking-wider text-slate-400">
              <span className="h-px flex-1 bg-slate-200 dark:bg-slate-800" /> or use an account{' '}
              <span className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
            </div>

            <div
              role="tablist"
              aria-label="Account"
              className="mb-5 grid grid-cols-2 rounded-lg bg-slate-100 p-1 dark:bg-slate-800"
            >
              {(['login', 'register'] as const).map((value) => (
                <button
                  key={value}
                  role="tab"
                  type="button"
                  id={`tab-${value}`}
                  aria-selected={mode === value}
                  aria-controls="auth-panel"
                  onClick={() => {
                    setMode(value);
                    setErrors({});
                  }}
                  className={`rounded-md py-1.5 text-sm font-medium transition ${
                    mode === value
                      ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-white'
                      : 'text-slate-500 hover:text-slate-800 dark:hover:text-white'
                  }`}
                >
                  {value === 'login' ? 'Sign in' : 'Create account'}
                </button>
              ))}
            </div>

            <form
              id="auth-panel"
              role="tabpanel"
              aria-labelledby={`tab-${mode}`}
              onSubmit={submit}
              className="space-y-4"
              noValidate
            >
              <Field label="Email" htmlFor="email" error={errors.email}>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  aria-invalid={Boolean(errors.email)}
                  aria-describedby={errors.email ? 'email-error' : undefined}
                  className={inputClass}
                />
              </Field>
              <Field
                label="Password"
                htmlFor="password"
                error={errors.password}
                {...(mode === 'register' && { hint: 'At least 8 characters.' })}
              >
                <input
                  id="password"
                  type="password"
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  aria-invalid={Boolean(errors.password)}
                  aria-describedby={errors.password ? 'password-error' : undefined}
                  className={inputClass}
                />
              </Field>
              {errors._ && (
                <p
                  role="alert"
                  className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-300"
                >
                  {errors._}
                </p>
              )}
              <Button
                type="submit"
                variant="secondary"
                className="w-full"
                loading={pending === 'form'}
                disabled={pending === 'demo'}
              >
                {mode === 'login' ? 'Sign in' : 'Create account'}
              </Button>
            </form>
          </div>
        </main>
      </div>
    </div>
  );
}
