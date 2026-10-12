import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Download, LogOut, Puzzle, Server, Trash2, User } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { useToast } from '../components/Toast';
import { Button } from '../components/ui';
import { API_URL } from '../lib/api';
import { useAuth } from '../lib/auth';
import { connectExtension, isExtensionInstalled } from '../lib/extension';
import { pluralize, relativeTime } from '../lib/format';
import { useDocumentTitle } from '../lib/hooks';
import { clearOffline, listOffline } from '../lib/offline';
import { useHealth } from '../lib/queries';

const EXTENSION_DOWNLOAD_URL =
  import.meta.env.VITE_EXTENSION_DOWNLOAD_URL || 'https://github.com/Isaacpyo/LinkVault/releases/latest';

function Card({ id, icon, title, children }: { id?: string; icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <section
      id={id}
      aria-labelledby={`${id ?? title}-heading`}
      className="scroll-mt-24 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-6"
    >
      <h2 id={`${id ?? title}-heading`} className="mb-4 flex items-center gap-2 text-base font-semibold">
        <span className="text-indigo-600 dark:text-indigo-300" aria-hidden>
          {icon}
        </span>
        {title}
      </h2>
      {children}
    </section>
  );
}

export function SettingsPage() {
  useDocumentTitle('Settings');
  const { user, token, logout } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const health = useHealth();
  const offline = useQuery({ queryKey: ['offline-articles'], queryFn: listOffline, networkMode: 'always' });
  const [extensionInstalled, setExtensionInstalled] = useState(isExtensionInstalled);
  const [connecting, setConnecting] = useState(false);

  // The content script may mark the page shortly after load.
  useEffect(() => {
    const timer = setTimeout(() => setExtensionInstalled(isExtensionInstalled()), 500);
    return () => clearTimeout(timer);
  }, []);

  const connect = async () => {
    if (!token || !user) return;
    setConnecting(true);
    const result = await connectExtension({ token, apiUrl: API_URL, email: user.email });
    setConnecting(false);
    if (result.ok) toast('Extension connected — save any tab with one click');
    else if (result.reason === 'api-mismatch')
      toast(
        `The extension is set up for a different server. Set its API URL to ${API_URL} in the extension options.`,
        'error',
      );
    else toast('The extension did not respond. Reload this page and try again.', 'error');
  };

  return (
    <div className="max-w-2xl space-y-5">
      <h1 className="text-2xl font-bold tracking-tight">Settings</h1>

      <Card icon={<User className="size-5" />} title="Account">
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
          <dt className="text-slate-500">Email</dt>
          <dd className="break-all font-medium">{user?.email}</dd>
          {user?.demoExpiresAt && (
            <>
              <dt className="text-slate-500">Demo sandbox</dt>
              <dd>Deleted automatically {relativeTime(user.demoExpiresAt)}</dd>
            </>
          )}
        </dl>
        <Button variant="secondary" className="mt-5" onClick={() => void logout()}>
          <LogOut className="size-4" aria-hidden /> Sign out
        </Button>
      </Card>

      <Card id="extension" icon={<Puzzle className="size-5" />} title="Chrome extension">
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Save the current tab with one click (or <kbd className="font-mono text-xs">Alt+Shift+S</kbd>), add tags and a
          collection, and right-click any link to save it.
        </p>
        {extensionInstalled ? (
          <div className="mt-4 space-y-3">
            <p className="inline-flex items-center gap-2 text-sm font-medium text-emerald-700 dark:text-emerald-400">
              <CheckCircle2 className="size-4" aria-hidden /> Extension detected in this browser
            </p>
            <div>
              <Button onClick={() => void connect()} loading={connecting}>
                Connect extension to this account
              </Button>
            </div>
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            <a
              href={EXTENSION_DOWNLOAD_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500"
            >
              <Download className="size-4" aria-hidden /> Download from GitHub Releases
            </a>
            <ol className="list-decimal space-y-1 pl-5 text-sm text-slate-600 dark:text-slate-300">
              <li>
                Download and unzip <code className="text-xs">linkvault-extension-*.zip</code>.
              </li>
              <li>
                Open <code className="text-xs">chrome://extensions</code> and turn on <strong>Developer mode</strong>.
              </li>
              <li>
                Click <strong>Load unpacked</strong> and select the unzipped folder.
              </li>
              <li>Reload this page and press “Connect extension”.</li>
            </ol>
          </div>
        )}
      </Card>

      <Card icon={<Download className="size-5" />} title="Offline reading">
        <p className="text-sm text-slate-600 dark:text-slate-300">
          {offline.data ? pluralize(offline.data.length, 'article') : 'No articles'} saved on this device for offline
          reading.
        </p>
        <Button
          variant="secondary"
          className="mt-4"
          disabled={!offline.data?.length}
          onClick={async () => {
            await clearOffline();
            await queryClient.invalidateQueries({ queryKey: ['offline-articles'] });
            toast('Offline copies removed from this device');
          }}
        >
          <Trash2 className="size-4" aria-hidden /> Clear offline copies
        </Button>
      </Card>

      <Card icon={<Server className="size-5" />} title="Server">
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
          <dt className="text-slate-500">API</dt>
          <dd className="break-all font-mono text-xs">{API_URL}</dd>
          <dt className="text-slate-500">Status</dt>
          <dd>
            {health.isPending
              ? 'Checking…'
              : health.isError
                ? 'Unreachable'
                : health.data.status === 'ok'
                  ? 'Operational'
                  : 'Degraded (search unavailable)'}
          </dd>
          {health.data && (
            <>
              <dt className="text-slate-500">Search backend</dt>
              <dd>{health.data.backend === 'opensearch' ? 'OpenSearch' : 'In-memory (not persistent)'}</dd>
              <dt className="text-slate-500">Version</dt>
              <dd>{health.data.version}</dd>
            </>
          )}
        </dl>
      </Card>
    </div>
  );
}
