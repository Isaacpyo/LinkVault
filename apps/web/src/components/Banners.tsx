import { CloudOff, Coffee, FlaskConical, HardDrive } from 'lucide-react';
import type { ReactNode } from 'react';
import { useAuth } from '../lib/auth';
import { relativeTime } from '../lib/format';
import { useElapsedSeconds, useOnline, useWakeState } from '../lib/hooks';
import { useHealth } from '../lib/queries';

function Banner({
  tone,
  icon,
  children,
}: {
  tone: 'amber' | 'slate' | 'indigo';
  icon: ReactNode;
  children: ReactNode;
}) {
  const tones = {
    amber:
      'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100',
    slate: 'border-slate-200 bg-slate-100 text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100',
    indigo:
      'border-indigo-200 bg-indigo-50 text-indigo-900 dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-indigo-100',
  };
  return (
    <div className={`flex items-start gap-2 border-b px-4 py-2 text-sm ${tones[tone]}`}>
      <span className="mt-0.5 shrink-0" aria-hidden>
        {icon}
      </span>
      <div>{children}</div>
    </div>
  );
}

/** Shown while a request is slow — usually Render's free instance waking from sleep. */
export function WakeBanner() {
  const { waking, since } = useWakeState();
  const elapsed = useElapsedSeconds(since);
  if (!waking) return null;
  return (
    <div role="status" aria-live="polite">
      <Banner tone="amber" icon={<Coffee className="size-4 animate-pulse" />}>
        <strong className="font-semibold">Waking up the server…</strong> The free-tier API sleeps when idle and takes up
        to a minute to start. {elapsed > 0 && <span className="tabular-nums">({elapsed}s)</span>}
      </Banner>
    </div>
  );
}

export function OfflineBanner() {
  const online = useOnline();
  if (online) return null;
  return (
    <div role="status" aria-live="polite">
      <Banner tone="slate" icon={<CloudOff className="size-4" />}>
        <strong className="font-semibold">You're offline.</strong> Articles saved to your reading list are still
        available.
      </Banner>
    </div>
  );
}

export function DemoBanner() {
  const { user } = useAuth();
  if (!user?.isDemo || !user.demoExpiresAt) return null;
  return (
    <Banner tone="indigo" icon={<FlaskConical className="size-4" />}>
      You're in a private demo sandbox. Add, tag and delete freely — it resets {relativeTime(user.demoExpiresAt)}.
    </Banner>
  );
}

/** Warns when the API runs on the in-memory store (no OpenSearch configured). */
export function EphemeralStoreBanner() {
  const { data } = useHealth();
  if (!data || data.persistent) return null;
  return (
    <Banner tone="slate" icon={<HardDrive className="size-4" />}>
      This server runs without OpenSearch, so data is kept in memory and resets when it restarts.
    </Banner>
  );
}
