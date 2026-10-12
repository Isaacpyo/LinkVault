import { hashIndex } from '../lib/format';

const COLORS = [
  'bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-300',
  'bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300',
  'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300',
  'bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300',
  'bg-pink-100 text-pink-700 dark:bg-pink-500/20 dark:text-pink-300',
  'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200',
];

/** Letter avatar per domain — avoids leaking browsing history to a third-party favicon service. */
export function DomainAvatar({ domain }: { domain: string }) {
  const letter = (domain.replace(/^www\./, '')[0] ?? '?').toUpperCase();
  return (
    <span
      aria-hidden
      className={`flex size-10 shrink-0 items-center justify-center rounded-xl text-base font-bold ${COLORS[hashIndex(domain, COLORS.length)]}`}
    >
      {letter}
    </span>
  );
}
