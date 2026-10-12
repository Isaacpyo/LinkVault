import { CheckCircle2, LogOut } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import {
  DEFAULT_SETTINGS,
  getSession,
  getSettings,
  saveSettings,
  setSession,
  type Session,
  type Settings,
} from '../lib/storage';

const input =
  'block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 dark:border-slate-700 dark:bg-slate-900';

export function Options() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [session, setSessionState] = useState<Session | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    void Promise.all([getSettings(), getSession()]).then(([s, sess]) => {
      setSettings(s);
      setSessionState(sess);
    });
  }, []);

  if (!settings) return null;

  const update = (patch: Partial<Settings>) => {
    setSaved(false);
    setSettings({ ...settings, ...patch });
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const previous = await getSettings();
    const next = await saveSettings(settings);
    // A session belongs to one API; switching servers signs out.
    if (previous.apiUrl !== next.apiUrl) {
      await setSession(null);
      setSessionState(null);
    }
    setSettings(next);
    setSaved(true);
  };

  return (
    <main className="mx-auto max-w-xl space-y-6 px-4 py-10">
      <h1 className="flex items-center gap-3 text-2xl font-bold">
        <img src="/icons/icon-48.png" alt="" className="size-9" /> LinkVault settings
      </h1>

      <section
        className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900"
        aria-labelledby="account"
      >
        <h2 id="account" className="mb-3 text-lg font-semibold">
          Account
        </h2>
        {session ? (
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
            <span>
              Signed in as <strong className="break-all">{session.email}</strong>
            </span>
            <button
              type="button"
              onClick={() => void setSession(null).then(() => setSessionState(null))}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 font-medium hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
            >
              <LogOut className="size-4" aria-hidden /> Sign out
            </button>
          </div>
        ) : (
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Not signed in. Click the toolbar icon to sign in, or press “Connect extension” in the web app's settings.
          </p>
        )}
      </section>

      <form
        onSubmit={(event) => void submit(event)}
        className="space-y-5 rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900"
      >
        <h2 className="text-lg font-semibold">Saving</h2>
        <label className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            checked={settings.autoSave}
            onChange={(e) => update({ autoSave: e.target.checked })}
            className="mt-0.5 size-4 accent-indigo-600"
          />
          <span>
            <span className="font-medium">Save as soon as I click the toolbar icon</span>
            <span className="block text-slate-500">
              One-click saving. Tags and collection can be added right after.
            </span>
          </span>
        </label>
        <label className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            checked={settings.capturePage}
            onChange={(e) => update({ capturePage: e.target.checked })}
            className="mt-0.5 size-4 accent-indigo-600"
          />
          <span>
            <span className="font-medium">Send the page as I see it</span>
            <span className="block text-slate-500">
              Uploads the rendered HTML of the tab so pages behind a login or built with JavaScript are indexed. Off by
              default for privacy.
            </span>
          </span>
        </label>

        <h2 className="pt-2 text-lg font-semibold">Servers</h2>
        <div className="space-y-1.5">
          <label htmlFor="api-url" className="text-sm font-medium">
            API URL
          </label>
          <input
            id="api-url"
            type="url"
            required
            value={settings.apiUrl}
            onChange={(e) => update({ apiUrl: e.target.value })}
            className={input}
          />
          <p className="text-xs text-slate-500">Default: {DEFAULT_SETTINGS.apiUrl}</p>
        </div>
        <div className="space-y-1.5">
          <label htmlFor="web-url" className="text-sm font-medium">
            Web app URL
          </label>
          <input
            id="web-url"
            type="url"
            required
            value={settings.webUrl}
            onChange={(e) => update({ webUrl: e.target.value })}
            className={input}
          />
          <p className="text-xs text-slate-500">Default: {DEFAULT_SETTINGS.webUrl}</p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
          >
            Save settings
          </button>
          {saved && (
            <span role="status" className="inline-flex items-center gap-1 text-sm text-emerald-600">
              <CheckCircle2 className="size-4" aria-hidden /> Saved
            </span>
          )}
        </div>
      </form>

      <p className="text-sm text-slate-500">
        Shortcut: <kbd className="rounded border px-1 font-mono text-xs">Alt+Shift+S</kbd> saves the current tab. Change
        it at <code className="text-xs">chrome://extensions/shortcuts</code>. Right-click any link to save it.
      </p>
    </main>
  );
}
