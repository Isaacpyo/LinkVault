import { useEffect, useState, useSyncExternalStore } from 'react';
import { wakeTracker } from './wake';

export function useOnline(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      window.addEventListener('online', onChange);
      window.addEventListener('offline', onChange);
      return () => {
        window.removeEventListener('online', onChange);
        window.removeEventListener('offline', onChange);
      };
    },
    () => navigator.onLine,
    () => true,
  );
}

export function useWakeState() {
  return useSyncExternalStore(wakeTracker.subscribe, wakeTracker.getSnapshot, wakeTracker.getSnapshot);
}

export function useDebounced<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

/** Seconds elapsed since `since`, ticking every second while `since` is set. */
export function useElapsedSeconds(since: number | null): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (since === null) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [since]);
  return since === null ? 0 : Math.max(0, Math.round((now - since) / 1000));
}

export function useDocumentTitle(title: string) {
  useEffect(() => {
    document.title = title ? `${title} · LinkVault` : 'LinkVault';
  }, [title]);
}
