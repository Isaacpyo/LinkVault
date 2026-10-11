import { useQuery, useQueryClient } from '@tanstack/react-query';
import DOMPurify from 'dompurify';
import { ArrowLeft, BookmarkCheck, BookmarkPlus, CloudOff, ExternalLink, WifiOff } from 'lucide-react';
import { useMemo } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import type { Bookmark, ReaderContent } from '@linkvault/shared';
import { OfflineBanner, WakeBanner } from '../components/Banners';
import { Wordmark } from '../components/Logo';
import { ErrorState } from '../components/States';
import { useToast } from '../components/Toast';
import { Button, Spinner } from '../components/ui';
import { ApiError, errorMessage } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useDocumentTitle } from '../lib/hooks';
import { getOffline, type OfflineArticle } from '../lib/offline';
import { keys, useUpdateBookmark } from '../lib/queries';

interface ReaderData {
  article: ReaderContent | OfflineArticle;
  fromCache: boolean;
  readLater: boolean;
}

function useReaderContent(id: string) {
  const { api } = useAuth();
  return useQuery({
    queryKey: keys.content(id),
    queryFn: async (): Promise<ReaderData> => {
      try {
        const [article, { bookmark }] = await Promise.all([
          api.content(id),
          api.request<{ bookmark: Bookmark }>(`/bookmarks/${encodeURIComponent(id)}`),
        ]);
        return { article, fromCache: false, readLater: bookmark.readLater };
      } catch (error) {
        // Offline (or the API is unreachable): fall back to the read-later copy.
        if (error instanceof ApiError && (error.code === 'OFFLINE' || error.code === 'NETWORK')) {
          const cached = await getOffline(api, id);
          if (cached) return { article: cached, fromCache: true, readLater: true };
        }
        throw error;
      }
    },
    retry: false,
  });
}

export function ReaderPage() {
  const { id = '' } = useParams();
  const { data, isPending, error, refetch } = useReaderContent(id);
  const update = useUpdateBookmark();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const toast = useToast();
  useDocumentTitle(data?.article.title ?? 'Reader');

  // Defence in depth: the API already sanitized this HTML.
  const html = useMemo(
    () =>
      data?.article.contentHtml
        ? DOMPurify.sanitize(data.article.contentHtml, {
            FORBID_TAGS: ['style', 'form', 'iframe'],
            FORBID_ATTR: ['style'],
          })
        : '',
    [data?.article.contentHtml],
  );

  const toggleReadLater = () => {
    if (!data) return;
    update.mutate(
      { id, input: { readLater: !data.readLater } },
      {
        onSuccess: (bookmark) => {
          queryClient.setQueryData<ReaderData>(keys.content(id), (old) =>
            old ? { ...old, readLater: bookmark.readLater } : old,
          );
          toast(bookmark.readLater ? 'Saved for offline reading' : 'Removed from your reading list');
        },
        onError: (err) => toast(err.message, 'error'),
      },
    );
  };

  return (
    <div className="min-h-dvh">
      <WakeBanner />
      <OfflineBanner />
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur dark:border-slate-800 dark:bg-slate-950/90">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between gap-2 px-4">
          <button
            type="button"
            onClick={() => void ((window.history.state as { idx?: number } | null)?.idx ? navigate(-1) : navigate('/'))}
            className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <ArrowLeft className="size-4" aria-hidden /> Back
          </button>
          <Link to="/" aria-label="LinkVault home" className="hidden sm:block">
            <Wordmark />
          </Link>
          {data && !data.fromCache ? (
            <Button
              variant={data.readLater ? 'secondary' : 'primary'}
              loading={update.isPending}
              onClick={toggleReadLater}
            >
              {data.readLater ? (
                <BookmarkCheck className="size-4" aria-hidden />
              ) : (
                <BookmarkPlus className="size-4" aria-hidden />
              )}
              {data.readLater ? 'Saved offline' : 'Read later'}
            </Button>
          ) : (
            <span />
          )}
        </div>
      </header>

      <main id="main" className="mx-auto max-w-3xl px-4 py-8 sm:py-12">
        {isPending ? (
          <div className="flex justify-center py-20">
            <Spinner label="Loading article" />
          </div>
        ) : error ? (
          <ErrorState
            title={
              error instanceof ApiError && error.code === 'OFFLINE'
                ? 'Not available offline'
                : "Couldn't open this article"
            }
            message={
              error instanceof ApiError && error.code === 'OFFLINE'
                ? 'Mark articles “Read later” while online to keep a copy for offline reading.'
                : errorMessage(error)
            }
            onRetry={() => void refetch()}
          />
        ) : data ? (
          <article>
            {data.fromCache && (
              <p className="mb-6 inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                <WifiOff className="size-3.5" aria-hidden /> Offline copy
              </p>
            )}
            <h1 className="text-3xl font-bold leading-tight tracking-tight sm:text-4xl">{data.article.title}</h1>
            <p className="mt-3 flex flex-wrap items-center gap-x-2 text-sm text-slate-500 dark:text-slate-400">
              {data.article.siteName && <span>{data.article.siteName}</span>}
              {data.article.byline && <span>· {data.article.byline}</span>}
              {data.article.readingMinutes && <span>· {data.article.readingMinutes} min read</span>}
              <a
                href={data.article.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 font-medium text-indigo-600 hover:underline dark:text-indigo-300"
              >
                · Original <ExternalLink className="size-3.5" aria-hidden />
              </a>
            </p>
            <hr className="my-8 border-slate-200 dark:border-slate-800" />
            {html ? (
              <div className="reader" dangerouslySetInnerHTML={{ __html: html }} />
            ) : (
              <div className="flex items-center gap-2 text-slate-500">
                <CloudOff className="size-5" aria-hidden />
                {data.article.status === 'pending'
                  ? 'The text is still being extracted — check back in a moment.'
                  : 'No readable text was saved for this page.'}
              </div>
            )}
          </article>
        ) : null}
      </main>
    </div>
  );
}
