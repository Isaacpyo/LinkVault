import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BookmarkCheck, BookOpen, CheckCircle2, RefreshCw, WifiOff } from 'lucide-react';
import { useEffect } from 'react';
import { Link } from 'react-router';
import { DomainAvatar } from '../components/DomainAvatar';
import { BookmarkSkeleton, EmptyState, ErrorState } from '../components/States';
import { Button } from '../components/ui';
import { errorMessage } from '../lib/api';
import { useAuth } from '../lib/auth';
import { pluralize, relativeTime } from '../lib/format';
import { useDocumentTitle, useOnline } from '../lib/hooks';
import { listOffline, syncReadLater } from '../lib/offline';
import { useSearch } from '../lib/queries';

const READ_LATER = { q: '', tags: [], collectionId: null, readLater: true } as const;

export function ReadingListPage() {
  useDocumentTitle('Reading list');
  const { api } = useAuth();
  const online = useOnline();
  const queryClient = useQueryClient();
  const offline = useQuery({ queryKey: ['offline-articles'], queryFn: listOffline, networkMode: 'always' });
  const search = useSearch({ ...READ_LATER, tags: [] });

  const sync = useMutation({
    mutationFn: () => syncReadLater(api),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['offline-articles'] }),
  });

  // Keep offline copies in step whenever the list is viewed online.
  const { mutate: runSync } = sync;
  useEffect(() => {
    if (online) runSync();
  }, [online, runSync]);

  const cachedIds = new Set((offline.data ?? []).map((a) => a.id));
  const items = search.data?.pages.flatMap((p) => p.items) ?? [];
  const showCached = !online || (search.isError && !items.length);

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Reading list</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Articles marked “Read later” are saved on this device and open without a connection.
            {offline.data && <> {pluralize(offline.data.length, 'article')} available offline.</>}
          </p>
        </div>
        <Button variant="secondary" onClick={() => sync.mutate()} loading={sync.isPending} disabled={!online}>
          <RefreshCw className="size-4" aria-hidden /> Sync offline copies
        </Button>
      </div>

      {showCached ? (
        offline.data?.length ? (
          <>
            <p className="mb-3 inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
              <WifiOff className="size-4" aria-hidden /> Showing the copies saved on this device.
            </p>
            <ul className="space-y-3">
              {offline.data.map((article) => (
                <li key={article.id}>
                  <Link
                    to={`/read/${article.id}`}
                    className="flex gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm hover:border-indigo-300 dark:border-slate-800 dark:bg-slate-900"
                  >
                    <DomainAvatar domain={new URL(article.url).hostname} />
                    <div className="min-w-0">
                      <p className="font-semibold">{article.title}</p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {article.siteName ?? new URL(article.url).hostname} · saved offline{' '}
                        {relativeTime(article.cachedAt)}
                      </p>
                      {article.excerpt && (
                        <p className="mt-1.5 line-clamp-2 text-sm text-slate-600 dark:text-slate-300">
                          {article.excerpt}
                        </p>
                      )}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <EmptyState icon={<WifiOff className="size-6" aria-hidden />} title="Nothing saved for offline yet">
            Mark articles “Read later” while you're online and they'll be available here without a connection.
          </EmptyState>
        )
      ) : search.isPending ? (
        <BookmarkSkeleton count={3} />
      ) : search.isError ? (
        <ErrorState message={errorMessage(search.error)} onRetry={() => void search.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState icon={<BookmarkCheck className="size-6" aria-hidden />} title="Your reading list is empty">
          Use the bookmark icon on any saved page, or tick “Read later” when saving from the extension.
        </EmptyState>
      ) : (
        <ul className="space-y-3">
          {items.map(({ bookmark }) => (
            <li
              key={bookmark.id}
              className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900"
            >
              <DomainAvatar domain={bookmark.domain} />
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{bookmark.title}</p>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-slate-500 dark:text-slate-400">
                  <span>{bookmark.domain}</span>
                  {bookmark.readingMinutes && <span>· {bookmark.readingMinutes} min read</span>}
                  {cachedIds.has(bookmark.id) ? (
                    <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                      · <CheckCircle2 className="size-3.5" aria-hidden /> Available offline
                    </span>
                  ) : bookmark.status === 'ready' ? (
                    <span>· Not downloaded yet</span>
                  ) : (
                    <span>· Waiting for text extraction</span>
                  )}
                </p>
              </div>
              {bookmark.status === 'ready' && (
                <Link
                  to={`/read/${bookmark.id}`}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-indigo-50 px-3 py-1.5 text-sm font-semibold text-indigo-700 hover:bg-indigo-100 dark:bg-indigo-500/15 dark:text-indigo-200"
                >
                  <BookOpen className="size-4" aria-hidden /> Read
                </Link>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
