import { AlertCircle, BookmarkCheck, BookmarkPlus, BookOpen, Loader2, Pencil, RotateCw, Trash2 } from 'lucide-react';
import { Link } from 'react-router';
import type { Bookmark, Collection, SearchHit } from '@linkvault/shared';
import { relativeTime } from '../lib/format';
import { useRefetchBookmark, useUpdateBookmark } from '../lib/queries';
import { COLLECTION_DOT } from './collectionColors';
import { DomainAvatar } from './DomainAvatar';
import { HighlightedText } from './HighlightedText';
import { useToast } from './Toast';
import { IconButton } from './ui';

interface BookmarkCardProps {
  hit: SearchHit;
  collection: Collection | undefined;
  activeTags: string[];
  onTagClick: (tag: string) => void;
  onEdit: (bookmark: Bookmark) => void;
  onDelete: (bookmark: Bookmark) => void;
}

export function BookmarkCard({ hit, collection, activeTags, onTagClick, onEdit, onDelete }: BookmarkCardProps) {
  const { bookmark, titleSegments, snippets } = hit;
  const update = useUpdateBookmark();
  const refetch = useRefetchBookmark();
  const toast = useToast();

  const toggleReadLater = () =>
    update.mutate(
      { id: bookmark.id, input: { readLater: !bookmark.readLater } },
      {
        onSuccess: (updated) =>
          toast(
            updated.readLater ? 'Added to your reading list and saved for offline' : 'Removed from your reading list',
          ),
        onError: (error) => toast(error.message, 'error'),
      },
    );

  return (
    <article
      aria-labelledby={`title-${bookmark.id}`}
      className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-slate-300 hover:shadow-md dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700"
    >
      <div className="flex gap-3 sm:gap-4">
        <DomainAvatar domain={bookmark.domain} />
        <div className="min-w-0 flex-1">
          <h3 id={`title-${bookmark.id}`} className="text-[15px] font-semibold leading-snug">
            <a
              href={bookmark.url}
              target="_blank"
              rel="noopener noreferrer"
              className="break-words text-slate-900 hover:text-indigo-600 dark:text-slate-100 dark:hover:text-indigo-300"
            >
              {titleSegments ? <HighlightedText segments={titleSegments} /> : bookmark.title}
            </a>
          </h3>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500 dark:text-slate-400">
            <span className="truncate">{bookmark.domain}</span>
            {bookmark.readingMinutes && <span>· {bookmark.readingMinutes} min read</span>}
            <span>· saved {relativeTime(bookmark.createdAt)}</span>
            {collection && (
              <span className="inline-flex items-center gap-1">
                · <span className={`size-2 rounded-full ${COLLECTION_DOT[collection.color]}`} aria-hidden />
                {collection.name}
              </span>
            )}
          </p>

          {bookmark.status === 'pending' && (
            <p
              className="mt-2 inline-flex items-center gap-1.5 text-sm text-indigo-600 dark:text-indigo-300"
              role="status"
            >
              <Loader2 className="size-3.5 animate-spin" aria-hidden /> Fetching the page and extracting text…
            </p>
          )}
          {bookmark.status === 'failed' && (
            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-amber-700 dark:text-amber-300">
              <AlertCircle className="size-4 shrink-0" aria-hidden />
              <span>{bookmark.error ?? 'Could not extract this page'} — still searchable by title, URL and tags.</span>
              <button
                type="button"
                onClick={() => refetch.mutate(bookmark.id)}
                disabled={refetch.isPending}
                className="inline-flex items-center gap-1 font-semibold underline-offset-2 hover:underline"
              >
                <RotateCw className={`size-3.5 ${refetch.isPending ? 'animate-spin' : ''}`} aria-hidden /> Retry
              </button>
            </div>
          )}

          {snippets.length > 0 ? (
            <div className="mt-2 space-y-1">
              {snippets.map((snippet, index) => (
                <p key={index} className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                  …<HighlightedText segments={snippet} />…
                </p>
              ))}
            </div>
          ) : (
            bookmark.excerpt && (
              <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                {bookmark.excerpt}
              </p>
            )
          )}

          {bookmark.tags.length > 0 && (
            <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Tags">
              {bookmark.tags.map((tag) => {
                const active = activeTags.includes(tag);
                return (
                  <li key={tag}>
                    <button
                      type="button"
                      onClick={() => onTagClick(tag)}
                      aria-pressed={active}
                      className={`rounded-md px-2 py-0.5 text-xs font-medium transition ${
                        active
                          ? 'bg-indigo-600 text-white'
                          : 'bg-slate-100 text-slate-600 hover:bg-indigo-50 hover:text-indigo-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-indigo-500/15 dark:hover:text-indigo-200'
                      }`}
                    >
                      #{tag}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="-mr-1 flex shrink-0 flex-col items-center gap-0.5 sm:flex-row sm:items-start">
          {bookmark.status === 'ready' ? (
            <Link
              to={`/read/${bookmark.id}`}
              aria-label={`Read “${bookmark.title}”`}
              title="Open reader view"
              className="inline-flex size-9 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
            >
              <BookOpen className="size-4" aria-hidden />
            </Link>
          ) : null}
          <IconButton
            label={bookmark.readLater ? 'Remove from reading list' : 'Read later (saves for offline)'}
            aria-pressed={bookmark.readLater}
            onClick={toggleReadLater}
            disabled={update.isPending}
            className={bookmark.readLater ? 'text-indigo-600 dark:text-indigo-300' : ''}
          >
            {bookmark.readLater ? (
              <BookmarkCheck className="size-4" aria-hidden />
            ) : (
              <BookmarkPlus className="size-4" aria-hidden />
            )}
          </IconButton>
          <IconButton label={`Edit “${bookmark.title}”`} onClick={() => onEdit(bookmark)}>
            <Pencil className="size-4" aria-hidden />
          </IconButton>
          <IconButton
            label={`Delete “${bookmark.title}”`}
            onClick={() => onDelete(bookmark)}
            className="hover:text-red-600"
          >
            <Trash2 className="size-4" aria-hidden />
          </IconButton>
        </div>
      </div>
    </article>
  );
}
