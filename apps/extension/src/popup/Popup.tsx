import {
  AlertCircle,
  BookmarkCheck,
  CheckCircle2,
  Coffee,
  ExternalLink,
  Loader2,
  Settings as SettingsIcon,
  Trash2,
  X,
} from 'lucide-react';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { parseTags, type Bookmark, type Collection } from '@linkvault/shared';
import { ApiError, createApi, type Api } from '../lib/api';
import { getSession, getSettings, handoffUrl, setSession, type Session, type Settings } from '../lib/storage';
import { capturePageHtml, getCurrentTab, type CurrentTab } from '../lib/tabs';

type View =
  | { kind: 'loading' }
  | { kind: 'signed-out' }
  | { kind: 'unsupported' }
  | { kind: 'ready' }
  | { kind: 'saving' }
  | { kind: 'saved'; bookmark: Bookmark; created: boolean }
  | { kind: 'removed' }
  | { kind: 'error'; message: string };

const POLL_MS = 1_500;
const POLL_LIMIT = 40;

const button =
  'inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60';
const primary = `${button} bg-indigo-600 text-white hover:bg-indigo-500`;
const secondary = `${button} border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200`;
const input =
  'block w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 dark:border-slate-700 dark:bg-slate-800';

function TagField({
  value,
  onChange,
  suggestions,
}: {
  value: string[];
  onChange: (tags: string[]) => void;
  suggestions: string[];
}) {
  const [draft, setDraft] = useState('');
  const commit = (text: string) => {
    onChange(parseTags([...value, ...parseTags(text)]));
    setDraft('');
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if ((event.key === 'Enter' || event.key === ',') && draft.trim()) {
      event.preventDefault();
      commit(draft);
    } else if (event.key === 'Backspace' && !draft && value.length) onChange(value.slice(0, -1));
  };
  return (
    <div className="flex min-h-9 flex-wrap items-center gap-1 rounded-lg border border-slate-300 bg-white px-1.5 py-1 focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-500/30 dark:border-slate-700 dark:bg-slate-800">
      {value.map((tag) => (
        <span
          key={tag}
          className="inline-flex items-center gap-0.5 rounded bg-indigo-50 px-1.5 py-0.5 text-xs font-medium text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-200"
        >
          #{tag}
          <button
            type="button"
            aria-label={`Remove tag ${tag}`}
            onClick={() => onChange(value.filter((t) => t !== tag))}
          >
            <X className="size-3" aria-hidden />
          </button>
        </span>
      ))}
      <input
        id="tags"
        value={draft}
        list="tag-suggestions"
        placeholder={value.length ? '' : 'Add tags, press Enter'}
        onChange={(event) =>
          event.target.value.includes(',') ? commit(event.target.value) : setDraft(event.target.value)
        }
        onKeyDown={onKeyDown}
        onBlur={() => draft.trim() && commit(draft)}
        className="min-w-20 flex-1 bg-transparent px-1 text-sm outline-none focus-visible:outline-none"
      />
      <datalist id="tag-suggestions">
        {suggestions
          .filter((tag) => !value.includes(tag))
          .slice(0, 20)
          .map((tag) => (
            <option key={tag} value={tag} />
          ))}
      </datalist>
    </div>
  );
}

function Header({ settings, session }: { settings: Settings | null; session: Session | null }) {
  return (
    <header className="flex items-center justify-between border-b border-slate-200 px-4 py-2.5 dark:border-slate-800">
      <span className="flex items-center gap-2 font-bold">
        <img src="/icons/icon-32.png" alt="" className="size-6" /> LinkVault
      </span>
      <span className="flex items-center gap-1">
        {settings && (
          <button
            type="button"
            onClick={() =>
              void chrome.tabs.create({
                url: session ? handoffUrl(settings.webUrl, session.token) : `${settings.webUrl}/login`,
              })
            }
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            Open library <ExternalLink className="size-3" aria-hidden />
          </button>
        )}
        <button
          type="button"
          aria-label="Extension settings"
          title="Settings"
          onClick={() => void chrome.runtime.openOptionsPage()}
          className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:hover:bg-slate-800 dark:hover:text-white"
        >
          <SettingsIcon className="size-4" aria-hidden />
        </button>
      </span>
    </header>
  );
}

function PageSummary({ tab }: { tab: CurrentTab }) {
  return (
    <div className="flex items-start gap-2.5">
      {tab.favIconUrl && /^https?:/.test(tab.favIconUrl) ? (
        <img src={tab.favIconUrl} alt="" className="mt-0.5 size-5 rounded" referrerPolicy="no-referrer" />
      ) : (
        <span className="mt-0.5 size-5 rounded bg-slate-200 dark:bg-slate-700" aria-hidden />
      )}
      <div className="min-w-0">
        <p className="line-clamp-2 text-sm font-semibold leading-snug">{tab.title}</p>
        <p className="truncate text-xs text-slate-500 dark:text-slate-400">
          {new URL(tab.url).hostname.replace(/^www\./, '')}
        </p>
      </div>
    </div>
  );
}

function Notice({
  tone,
  icon,
  children,
}: {
  tone: 'amber' | 'red' | 'green' | 'indigo';
  icon: ReactNode;
  children: ReactNode;
}) {
  const tones = {
    amber: 'bg-amber-50 text-amber-900 dark:bg-amber-500/10 dark:text-amber-100',
    red: 'bg-red-50 text-red-800 dark:bg-red-500/10 dark:text-red-200',
    green: 'bg-emerald-50 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-200',
    indigo: 'bg-indigo-50 text-indigo-800 dark:bg-indigo-500/10 dark:text-indigo-200',
  };
  return (
    <div role="status" className={`flex items-start gap-2 rounded-lg px-3 py-2 text-xs ${tones[tone]}`}>
      <span className="mt-px shrink-0" aria-hidden>
        {icon}
      </span>
      <div>{children}</div>
    </div>
  );
}

export function Popup() {
  const [view, setView] = useState<View>({ kind: 'loading' });
  const [settings, setSettings] = useState<Settings | null>(null);
  const [session, setSessionState] = useState<Session | null>(null);
  const [tab, setTab] = useState<CurrentTab | null>(null);
  const [slow, setSlow] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  /** An expired or revoked token: forget it and ask the user to sign in again. */
  const expireSession = useCallback(async () => {
    await setSession(null);
    setSessionState(null);
    setNotice('Your session has expired. Sign in again to keep saving.');
    setView({ kind: 'signed-out' });
  }, []);

  const api = useMemo<Api | null>(
    () =>
      settings
        ? createApi({ baseUrl: settings.apiUrl, token: session?.token ?? null, onSlow: () => setSlow(true) })
        : null,
    [settings, session],
  );

  const save = useCallback(
    async (
      client: Api,
      current: CurrentTab,
      extras: { tags?: string[]; collectionId?: string | null; readLater?: boolean } = {},
    ) => {
      setView({ kind: 'saving' });
      try {
        const html = settings?.capturePage ? await capturePageHtml(current.id) : undefined;
        const { bookmark, created } = await client.save({
          url: current.url,
          title: current.title,
          ...extras,
          ...(html && { html }),
        });
        setView({ kind: 'saved', bookmark, created });
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) await expireSession();
        else setView({ kind: 'error', message: error instanceof Error ? error.message : 'Could not save this page' });
      } finally {
        setSlow(false);
      }
    },
    [expireSession, settings?.capturePage],
  );

  // Initial load: settings, session and the active tab.
  useEffect(() => {
    void (async () => {
      const [s, sess, current] = await Promise.all([getSettings(), getSession(), getCurrentTab()]);
      setSettings(s);
      setSessionState(sess);
      setTab(current);
      if (!sess) return setView({ kind: 'signed-out' });
      if (!current?.saveable) return setView({ kind: 'unsupported' });
      setView({ kind: s.autoSave ? 'saving' : 'ready' });
    })();
  }, []);

  // One-click save, or a lookup when auto-save is off.
  const started = useRef(false);
  useEffect(() => {
    if (!api || !tab?.saveable || !session || started.current) return;
    if (view.kind !== 'saving' && view.kind !== 'ready') return;
    started.current = true;
    if (view.kind === 'saving') void save(api, tab);
    else
      void api
        .lookup(tab.url)
        .then(({ bookmark }) => bookmark && setView({ kind: 'saved', bookmark, created: false }))
        .catch((error: unknown) => {
          if (error instanceof ApiError && error.status === 401) void expireSession();
        })
        .finally(() => setSlow(false));
  }, [api, expireSession, save, session, tab, view.kind]);

  const signIn = async (action: (client: Api) => Promise<{ token: string; user: { email: string } }>) => {
    if (!settings) return;
    const client = createApi({ baseUrl: settings.apiUrl, onSlow: () => setSlow(true) });
    const { token, user } = await action(client);
    const next = { token, email: user.email };
    await setSession(next);
    started.current = false;
    setSlow(false);
    setSessionState(next);
    setView(tab?.saveable ? { kind: settings.autoSave ? 'saving' : 'ready' } : { kind: 'unsupported' });
  };

  return (
    <div className="min-h-40">
      <Header settings={settings} session={session} />
      <main className="space-y-3 p-4">
        {slow && (
          <Notice tone="amber" icon={<Coffee className="size-3.5 animate-pulse" />}>
            <strong>Waking up the server…</strong> The free-tier API sleeps when idle; this can take up to a minute.
          </Notice>
        )}
        {view.kind === 'loading' && (
          <div className="flex justify-center py-6">
            <Loader2 className="size-5 animate-spin text-slate-400" aria-label="Loading" />
          </div>
        )}
        {view.kind === 'signed-out' && <SignIn onSignIn={signIn} webUrl={settings?.webUrl} notice={notice} />}
        {view.kind === 'unsupported' && (
          <Notice tone="indigo" icon={<AlertCircle className="size-3.5" />}>
            Browser pages like this one can't be saved. Open a website and click the icon again.
          </Notice>
        )}
        {tab?.saveable &&
          api &&
          session &&
          (view.kind === 'ready' || view.kind === 'saving' || view.kind === 'error') && (
            <>
              <PageSummary tab={tab} />
              {view.kind === 'error' && (
                <Notice tone="red" icon={<AlertCircle className="size-3.5" />}>
                  {view.message}
                </Notice>
              )}
              <button
                type="button"
                className={`${primary} w-full`}
                disabled={view.kind === 'saving'}
                onClick={() => void save(api, tab)}
              >
                {view.kind === 'saving' ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                ) : (
                  <BookmarkCheck className="size-4" aria-hidden />
                )}
                {view.kind === 'saving' ? 'Saving…' : view.kind === 'error' ? 'Try again' : 'Save this page'}
              </button>
            </>
          )}
        {view.kind === 'saved' && tab && api && (
          <SavedView
            api={api}
            tab={tab}
            initial={view.bookmark}
            created={view.created}
            onRemoved={() => setView({ kind: 'removed' })}
          />
        )}
        {view.kind === 'removed' && tab && api && (
          <div className="space-y-3">
            <Notice tone="indigo" icon={<Trash2 className="size-3.5" />}>
              Removed from your library.
            </Notice>
            <button type="button" className={`${secondary} w-full`} onClick={() => void save(api, tab)}>
              Save it again
            </button>
          </div>
        )}
      </main>
    </div>
  );
}

function SignIn({
  onSignIn,
  webUrl,
  notice,
}: {
  onSignIn: (action: (client: Api) => Promise<{ token: string; user: { email: string } }>) => Promise<void>;
  webUrl: string | undefined;
  notice: string | null;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<'login' | 'demo' | null>(null);

  const run = async (
    kind: 'login' | 'demo',
    action: (client: Api) => Promise<{ token: string; user: { email: string } }>,
  ) => {
    setPending(kind);
    setError(null);
    try {
      await onSignIn(action);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign in failed');
      setPending(null);
    }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!email || !password) return setError('Enter your email and password');
    void run('login', (client) => client.login(email, password));
  };

  return (
    <div className="space-y-3">
      {notice ? (
        <Notice tone="amber" icon={<AlertCircle className="size-3.5" />}>
          {notice}
        </Notice>
      ) : (
        <p className="text-sm text-slate-600 dark:text-slate-300">Sign in to save pages to your LinkVault.</p>
      )}
      <form onSubmit={submit} className="space-y-2" noValidate>
        <label htmlFor="email" className="sr-only">
          Email
        </label>
        <input
          id="email"
          type="email"
          autoComplete="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={input}
        />
        <label htmlFor="password" className="sr-only">
          Password
        </label>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={input}
        />
        {error && (
          <p role="alert" className="text-xs text-red-600 dark:text-red-400">
            {error}
          </p>
        )}
        <button type="submit" className={`${primary} w-full`} disabled={pending !== null}>
          {pending === 'login' && <Loader2 className="size-4 animate-spin" aria-hidden />} Sign in
        </button>
      </form>
      <button
        type="button"
        className={`${secondary} w-full`}
        disabled={pending !== null}
        onClick={() => void run('demo', (client) => client.demo())}
      >
        {pending === 'demo' && <Loader2 className="size-4 animate-spin" aria-hidden />} Try the demo (no sign-up)
      </button>
      {webUrl && (
        <p className="text-center text-xs text-slate-500">
          New here?{' '}
          <a
            href={`${webUrl}/login`}
            target="_blank"
            rel="noreferrer"
            className="font-medium text-indigo-600 hover:underline dark:text-indigo-300"
          >
            Create an account
          </a>{' '}
          or connect from the web app's settings.
        </p>
      )}
    </div>
  );
}

function SavedView({
  api,
  tab,
  initial,
  created,
  onRemoved,
}: {
  api: Api;
  tab: CurrentTab;
  initial: Bookmark;
  created: boolean;
  onRemoved: () => void;
}) {
  const [bookmark, setBookmark] = useState(initial);
  const [tags, setTags] = useState(initial.tags);
  const [collectionId, setCollectionId] = useState(initial.collectionId ?? '');
  const [readLater, setReadLater] = useState(initial.readLater);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    api
      .collections()
      .then(({ collections: list }) => setCollections(list))
      .catch(() => {});
    api
      .tags()
      .then((list) => setSuggestions(list.map((t) => t.tag)))
      .catch(() => {});
  }, [api]);

  // Poll until extraction finishes so the popup can confirm the page is searchable.
  useEffect(() => {
    if (bookmark.status !== 'pending') return;
    let polls = 0;
    const timer = setInterval(() => {
      polls++;
      api
        .get(bookmark.id)
        .then(({ bookmark: next }) => {
          if (next.status !== 'pending' || polls >= POLL_LIMIT) {
            clearInterval(timer);
            setBookmark(next);
          }
        })
        .catch(() => clearInterval(timer));
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [api, bookmark.id, bookmark.status]);

  const dirty =
    tags.join(',') !== bookmark.tags.join(',') ||
    (collectionId || null) !== bookmark.collectionId ||
    readLater !== bookmark.readLater;

  const apply = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const { bookmark: updated } = await api.update(bookmark.id, {
        tags,
        collectionId: collectionId || null,
        readLater,
      });
      setBookmark(updated);
      setMessage('Changes saved');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not save changes');
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    setSaving(true);
    try {
      await api.remove(bookmark.id);
      onRemoved();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not remove');
      setSaving(false);
    }
  };

  return (
    <form onSubmit={(event) => void apply(event)} className="space-y-3">
      <PageSummary tab={tab} />
      <Notice tone="green" icon={<CheckCircle2 className="size-3.5" />}>
        <strong>{created ? 'Saved to LinkVault.' : 'Already in your library.'}</strong>{' '}
        {bookmark.status === 'pending' && (
          <span className="inline-flex items-center gap-1">
            <Loader2 className="size-3 animate-spin" aria-hidden /> Extracting text…
          </span>
        )}
        {bookmark.status === 'ready' && (
          <span>Searchable{bookmark.wordCount ? ` · ${bookmark.wordCount.toLocaleString()} words indexed` : ''}.</span>
        )}
        {bookmark.status === 'failed' && (
          <span>Saved, but {bookmark.error?.toLowerCase() ?? 'text extraction failed'}.</span>
        )}
      </Notice>

      <div className="space-y-1">
        <label htmlFor="tags" className="text-xs font-medium text-slate-600 dark:text-slate-300">
          Tags
        </label>
        <TagField value={tags} onChange={setTags} suggestions={suggestions} />
      </div>
      <div className="space-y-1">
        <label htmlFor="collection" className="text-xs font-medium text-slate-600 dark:text-slate-300">
          Collection
        </label>
        <select
          id="collection"
          value={collectionId}
          onChange={(e) => setCollectionId(e.target.value)}
          className={input}
        >
          <option value="">Unsorted</option>
          {collections.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={readLater}
          onChange={(e) => setReadLater(e.target.checked)}
          className="size-4 accent-indigo-600"
        />
        Read later <span className="text-xs text-slate-500">(available offline in the web app)</span>
      </label>
      {message && (
        <p role="status" className="text-xs text-slate-600 dark:text-slate-300">
          {message}
        </p>
      )}
      <div className="flex gap-2">
        <button type="submit" className={`${primary} flex-1`} disabled={!dirty || saving}>
          {saving && <Loader2 className="size-4 animate-spin" aria-hidden />} Save changes
        </button>
        <button
          type="button"
          className={secondary}
          disabled={saving}
          onClick={() => void remove()}
          aria-label="Remove from LinkVault"
          title="Remove"
        >
          <Trash2 className="size-4" aria-hidden />
        </button>
      </div>
    </form>
  );
}
