export function Logo({ className = 'size-8' }: { className?: string }) {
  return <img src="/favicon.svg" alt="" aria-hidden className={className} />;
}

export function Wordmark() {
  return (
    <span className="flex items-center gap-2 text-lg font-bold tracking-tight text-slate-900 dark:text-white">
      <Logo className="size-7" />
      LinkVault
    </span>
  );
}
