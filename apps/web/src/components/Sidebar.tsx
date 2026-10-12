import { Inbox, Library, Pencil, Plus, Settings, BookmarkCheck, Puzzle } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router';
import type { Collection } from '@linkvault/shared';
import { useCollections, useSummary } from '../lib/queries';
import { COLLECTION_DOT } from './collectionColors';

function NavItem({
  to,
  active,
  icon,
  label,
  count,
  onNavigate,
}: {
  to: string;
  active: boolean;
  icon: ReactNode;
  label: string;
  count?: number | undefined;
  onNavigate?: (() => void) | undefined;
}) {
  return (
    <Link
      to={to}
      onClick={onNavigate}
      aria-current={active ? 'page' : undefined}
      className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${
        active
          ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-200'
          : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white'
      }`}
    >
      <span className="shrink-0" aria-hidden>
        {icon}
      </span>
      <span className="flex-1 truncate">{label}</span>
      {count !== undefined && <span className="text-xs tabular-nums text-slate-400">{count}</span>}
    </Link>
  );
}

interface SidebarProps {
  onNavigate?: () => void;
  onNewCollection: () => void;
  onEditCollection: (collection: Collection) => void;
}

export function Sidebar({ onNavigate, onNewCollection, onEditCollection }: SidebarProps) {
  const { pathname } = useLocation();
  const [params] = useSearchParams();
  const { data: summary } = useSummary();
  const { data: collections, isLoading, isError } = useCollections();
  const onLibrary = pathname === '/';
  const activeCollection = onLibrary ? params.get('collection') : null;
  const activeTags = onLibrary ? params.getAll('tag') : [];

  const tagHref = (tag: string) => {
    const next = new URLSearchParams(onLibrary ? params : undefined);
    const tags = next.getAll('tag');
    next.delete('tag');
    for (const t of tags.includes(tag) ? tags.filter((x) => x !== tag) : [...tags, tag]) next.append('tag', t);
    return `/?${next.toString()}`;
  };

  return (
    <nav aria-label="Library" className="space-y-6">
      <div className="space-y-0.5">
        <NavItem
          to="/"
          active={onLibrary && !activeCollection && activeTags.length === 0}
          icon={<Library className="size-4" />}
          label="All bookmarks"
          count={summary?.total}
          onNavigate={onNavigate}
        />
        <NavItem
          to="/reading-list"
          active={pathname === '/reading-list'}
          icon={<BookmarkCheck className="size-4" />}
          label="Reading list"
          count={summary?.readLater}
          onNavigate={onNavigate}
        />
        <NavItem
          to="/?collection=none"
          active={activeCollection === 'none'}
          icon={<Inbox className="size-4" />}
          label="Unsorted"
          count={summary?.unsorted}
          onNavigate={onNavigate}
        />
      </div>

      <div>
        <div className="mb-1 flex items-center justify-between px-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400">Collections</h2>
          <button
            type="button"
            onClick={onNewCollection}
            aria-label="New collection"
            title="New collection"
            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-white"
          >
            <Plus className="size-4" aria-hidden />
          </button>
        </div>
        {isLoading ? (
          <div className="space-y-2 px-3 py-1" aria-hidden>
            <div className="h-4 w-3/4 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
            <div className="h-4 w-1/2 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
          </div>
        ) : isError && !collections ? (
          <p className="px-3 text-sm text-slate-500">Collections are unavailable right now.</p>
        ) : collections?.length ? (
          <ul className="space-y-0.5">
            {collections.map((collection) => (
              <li key={collection.id} className="group relative">
                <NavItem
                  to={`/?collection=${collection.id}`}
                  active={activeCollection === collection.id}
                  icon={<span className={`block size-2.5 rounded-full ${COLLECTION_DOT[collection.color]}`} />}
                  label={collection.name}
                  count={collection.bookmarkCount}
                  onNavigate={onNavigate}
                />
                <button
                  type="button"
                  onClick={() => onEditCollection(collection)}
                  aria-label={`Edit collection ${collection.name}`}
                  className="absolute right-8 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 opacity-0 transition hover:text-slate-700 focus:opacity-100 group-hover:opacity-100 dark:hover:text-white"
                >
                  <Pencil className="size-3.5" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-3 text-sm text-slate-500">
            No collections yet.{' '}
            <button
              type="button"
              onClick={onNewCollection}
              className="font-medium text-indigo-600 hover:underline dark:text-indigo-300"
            >
              Create one
            </button>
          </p>
        )}
      </div>

      {summary && summary.tags.length > 0 && (
        <div>
          <h2 className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Tags</h2>
          <ul className="flex flex-wrap gap-1.5 px-3">
            {summary.tags.slice(0, 18).map(({ tag, count }) => {
              const active = activeTags.includes(tag);
              return (
                <li key={tag}>
                  <Link
                    to={tagHref(tag)}
                    onClick={onNavigate}
                    aria-pressed={active}
                    aria-label={`${active ? 'Remove' : 'Filter by'} tag ${tag} (${count})`}
                    className={`inline-block rounded-md px-2 py-0.5 text-xs font-medium transition ${
                      active
                        ? 'bg-indigo-600 text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-indigo-50 hover:text-indigo-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-indigo-500/15'
                    }`}
                  >
                    #{tag} <span className="opacity-60">{count}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div className="space-y-0.5 border-t border-slate-200 pt-4 dark:border-slate-800">
        <NavItem
          to="/settings#extension"
          active={false}
          icon={<Puzzle className="size-4" />}
          label="Get the extension"
          onNavigate={onNavigate}
        />
        <NavItem
          to="/settings"
          active={pathname === '/settings'}
          icon={<Settings className="size-4" />}
          label="Settings"
          onNavigate={onNavigate}
        />
      </div>
    </nav>
  );
}
