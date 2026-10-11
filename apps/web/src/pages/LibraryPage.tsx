import { FolderOpen, Plus, SearchX, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import type { Bookmark } from '@linkvault/shared';
import { BookmarkCard } from '../components/BookmarkCard';
import { ConfirmDialog, EditBookmarkDialog } from '../components/BookmarkDialogs';
import { COLLECTION_DOT } from '../components/collectionColors';
import { useShell } from '../components/ShellContext';
import { BookmarkSkeleton, EmptyState, ErrorState } from '../components/States';
import { useToast } from '../components/Toast';
import { Button, Spinner } from '../components/ui';
import { errorMessage } from '../lib/api';
import { pluralize } from '../lib/format';
import { useDocumentTitle } from '../lib/hooks';
import { useCollections, useDeleteBookmark, useSearch, useSummary, type LibraryFilters } from '../lib/queries';

type Sort = NonNullable<LibraryFilters['sort']>;

export function LibraryPage() {
  const [params, setParams] = useSearchParams();
  const { openAddBookmark } = useShell();
  const toast = useToast();
  const [editing, setEditing] = useState<Bookmark | null>(null);
  const [deleting, setDeleting] = useState<Bookmark | null>(null);

  const q = params.get('q') ?? '';
  const tags = params.getAll('tag');
  const collectionParam = params.get('collection');
  const sortParam = params.get('sort') as Sort | null;
  const filters = useMemo<LibraryFilters>(
    () => ({ q, tags, collectionId: collectionParam, ...(sortParam && { sort: sortParam }) }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- tags is derived from params each render
    [q, tags.join(','), collectionParam, sortParam],
  );

  const search = useSearch(filters);
  const { data: collections = [] } = useCollections();
  const { data: summary } = useSummary();
  const deleteBookmark = useDeleteBookmark();

  const collectionById = useMemo(() => new Map(collections.map((c) => [c.id, c])), [collections]);
  const activeCollection =
    collectionParam && collectionParam !== 'none' ? collectionById.get(collectionParam) : undefined;

  const heading = q
    ? `Results for “${q}”`
    : collectionParam === 'none'
      ? 'Unsorted'
      : (activeCollection?.name ?? (collectionParam ? 'Collection' : 'All bookmarks'));
  useDocumentTitle(heading);

  const update = (mutate: (next: URLSearchParams) => void) => {
    const next = new URLSearchParams(params);
    mutate(next);
    setParams(next, { replace: true });
  };
  const toggleTag = (tag: string) =>
    update((next) => {
      next.delete('tag');
      for (const t of tags.includes(tag) ? tags.filter((x) => x !== tag) : [...tags, tag]) next.append('tag', t);
    });
  const clearFilters = () => setParams(new URLSearchParams(), { replace: true });

  const pages = search.data?.pages ?? [];
  const items = pages.flatMap((page) => page.items);
  const total = pages[0]?.total ?? 0;
  const facets = (pages[0]?.facets.tags ?? []).filter((facet) => !tags.includes(facet.tag)).slice(0, 8);
  const hasFilters = Boolean(q || tags.length || collectionParam);
  const libraryEmpty = summary?.total === 0 && !hasFilters;

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 break-words text-2xl font-bold tracking-tight">
            {activeCollection && (
              <span className={`size-3 shrink-0 rounded-full ${COLLECTION_DOT[activeCollection.color]}`} aria-hidden />
            )}
            {heading}
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400" aria-live="polite">
            {search.isPending ? (
              'Loading…'
            ) : search.isError ? null : (
              <>
                {pluralize(total, 'bookmark')}
                {q && pages[0] && <span> · {pages[0].tookMs} ms</span>}
                {search.isFetching && !search.isFetchingNextPage && (
                  <span className="ml-2 inline-block align-middle">
                    <Spinner label="Refreshing" />
                  </span>
                )}
              </>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="sort" className="text-sm text-slate-500 dark:text-slate-400">
            Sort
          </label>
          <select
            id="sort"
            value={sortParam ?? (q ? 'relevance' : 'newest')}
            onChange={(event) => update((next) => next.set('sort', event.target.value))}
            className="rounded-lg border border-slate-300 bg-white py-1.5 pl-2 pr-8 text-sm dark:border-slate-700 dark:bg-slate-900"
          >
            {q && <option value="relevance">Relevance</option>}
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
          </select>
        </div>
      </div>

      {(tags.length > 0 || facets.length > 0) && (
        <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
          {tags.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => toggleTag(tag)}
              aria-label={`Remove tag filter ${tag}`}
              className="inline-flex items-center gap-1 rounded-full bg-indigo-600 px-3 py-1 text-xs font-medium text-white hover:bg-indigo-500"
            >
              #{tag} <X className="size-3" aria-hidden />
            </button>
          ))}
          {facets.length > 0 && (
            <>
              <span className="text-xs text-slate-500 dark:text-slate-400">{tags.length ? 'Narrow:' : 'Filter:'}</span>
              {facets.map((facet) => (
                <button
                  key={facet.tag}
                  type="button"
                  onClick={() => toggleTag(facet.tag)}
                  aria-label={`Narrow to tag ${facet.tag} (${facet.count})`}
                  className="rounded-full border border-slate-200 px-2.5 py-0.5 text-xs text-slate-600 hover:border-indigo-300 hover:text-indigo-700 dark:border-slate-700 dark:text-slate-300 dark:hover:text-indigo-200"
                >
                  #{facet.tag} <span className="text-slate-400">{facet.count}</span>
                </button>
              ))}
            </>
          )}
          {hasFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className="ml-auto text-xs font-medium text-slate-500 underline-offset-2 hover:underline"
            >
              Clear all filters
            </button>
          )}
        </div>
      )}

      {search.isPending ? (
        <BookmarkSkeleton />
      ) : search.isError && !items.length ? (
        <ErrorState
          title="Couldn't load your bookmarks"
          message={errorMessage(search.error)}
          onRetry={() => void search.refetch()}
        />
      ) : libraryEmpty ? (
        <EmptyState icon={<FolderOpen className="size-6" aria-hidden />} title="Your vault is empty">
          <p>Save your first page here, or install the Chrome extension to save any tab with one click.</p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <Button onClick={openAddBookmark}>
              <Plus className="size-4" aria-hidden /> Save a link
            </Button>
            <Link
              to="/settings#extension"
              className="inline-flex items-center rounded-lg border border-slate-300 px-3.5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              Get the extension
            </Link>
          </div>
        </EmptyState>
      ) : items.length === 0 ? (
        <EmptyState icon={<SearchX className="size-6" aria-hidden />} title="No matching bookmarks">
          <p>
            {q ? 'Try fewer words, a prefix like “reac*”, or remove a filter.' : 'Nothing here yet with these filters.'}{' '}
            Search covers titles, tags and the full text of every saved page.
          </p>
          {hasFilters && (
            <Button variant="secondary" className="mt-4" onClick={clearFilters}>
              Clear filters
            </Button>
          )}
        </EmptyState>
      ) : (
        <>
          <ul className="space-y-3">
            {items.map((hit) => (
              <li key={hit.bookmark.id}>
                <BookmarkCard
                  hit={hit}
                  collection={hit.bookmark.collectionId ? collectionById.get(hit.bookmark.collectionId) : undefined}
                  activeTags={tags}
                  onTagClick={toggleTag}
                  onEdit={setEditing}
                  onDelete={setDeleting}
                />
              </li>
            ))}
          </ul>
          {search.hasNextPage && (
            <div className="mt-6 flex justify-center">
              <Button
                variant="secondary"
                loading={search.isFetchingNextPage}
                onClick={() => void search.fetchNextPage()}
              >
                Load more
              </Button>
            </div>
          )}
        </>
      )}

      <EditBookmarkDialog bookmark={editing} onClose={() => setEditing(null)} />
      <ConfirmDialog
        open={deleting !== null}
        title="Delete bookmark?"
        message={`“${deleting?.title ?? ''}” and its saved text will be permanently removed.`}
        confirmLabel="Delete"
        loading={deleteBookmark.isPending}
        onClose={() => setDeleting(null)}
        onConfirm={() =>
          deleting &&
          deleteBookmark.mutate(deleting, {
            onSuccess: () => {
              toast('Bookmark deleted');
              setDeleting(null);
            },
            onError: (error) => toast(error.message, 'error'),
          })
        }
      />
    </div>
  );
}
