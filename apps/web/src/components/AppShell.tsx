import { Menu, Plus, Search, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, Outlet, useLocation, useNavigate, useSearchParams } from 'react-router';
import type { Collection } from '@linkvault/shared';
import { useAuth } from '../lib/auth';
import { useDebounced } from '../lib/hooks';
import { useDeleteCollection } from '../lib/queries';
import { DemoBanner, EphemeralStoreBanner, OfflineBanner, WakeBanner } from './Banners';
import { AddBookmarkDialog, ConfirmDialog } from './BookmarkDialogs';
import { CollectionDialog } from './CollectionDialog';
import { Wordmark } from './Logo';
import { ShellContext } from './ShellContext';
import { Sidebar } from './Sidebar';
import { useToast } from './Toast';
import { Button, IconButton, Kbd } from './ui';

function SearchBar() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const urlQuery = pathname === '/' ? (params.get('q') ?? '') : '';
  const [value, setValue] = useState(urlQuery);
  const debounced = useDebounced(value, 300);
  const inputRef = useRef<HTMLInputElement>(null);
  const lastPushed = useRef(urlQuery);

  // Follow external URL changes (back button, tag links) without clobbering typing.
  useEffect(() => {
    if (urlQuery !== lastPushed.current) {
      lastPushed.current = urlQuery;
      setValue(urlQuery);
    }
  }, [urlQuery]);

  useEffect(() => {
    if (debounced === lastPushed.current) return;
    lastPushed.current = debounced;
    const next = new URLSearchParams(pathname === '/' ? params : undefined);
    if (debounced.trim()) next.set('q', debounced);
    else next.delete('q');
    void navigate({ pathname: '/', search: next.toString() }, { replace: pathname === '/' });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only react to the debounced text
  }, [debounced]);

  // "/" focuses search from anywhere.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (event.key === '/' && !/^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) && !target.isContentEditable) {
        event.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <form role="search" className="relative w-full max-w-xl" onSubmit={(event) => event.preventDefault()}>
      <label htmlFor="global-search" className="sr-only">
        Search your library
      </label>
      <Search
        className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400"
        aria-hidden
      />
      <input
        ref={inputRef}
        id="global-search"
        type="search"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder="Search titles, tags and full text…"
        autoComplete="off"
        className="block w-full rounded-xl border border-slate-200 bg-slate-100/70 py-2 pl-9 pr-16 text-sm placeholder:text-slate-400 focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/30 dark:border-slate-700 dark:bg-slate-800/70 dark:focus:bg-slate-900 [&::-webkit-search-cancel-button]:hidden"
      />
      <span className="absolute right-2.5 top-1/2 flex -translate-y-1/2 items-center gap-1">
        {value ? (
          <button
            type="button"
            onClick={() => {
              setValue('');
              inputRef.current?.focus();
            }}
            aria-label="Clear search"
            className="rounded p-0.5 text-slate-400 hover:text-slate-700 dark:hover:text-white"
          >
            <X className="size-4" aria-hidden />
          </button>
        ) : (
          <span className="hidden sm:inline" aria-hidden>
            <Kbd>/</Kbd>
          </span>
        )}
      </span>
    </form>
  );
}

function MobileNav({ open, onClose, children }: { open: boolean; onClose: () => void; children: React.ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      aria-label="Navigation"
      onClose={onClose}
      onClick={(event) => event.target === ref.current && onClose()}
      className="m-0 h-full max-h-none w-72 max-w-[85vw] bg-white p-0 text-slate-900 shadow-xl dark:bg-slate-900 dark:text-slate-100"
    >
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-800">
        <Wordmark />
        <IconButton label="Close navigation" onClick={onClose}>
          <X className="size-5" aria-hidden />
        </IconButton>
      </div>
      <div className="p-3">{open && children}</div>
    </dialog>
  );
}

export function AppShell() {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [addOpen, setAddOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [collectionDialog, setCollectionDialog] = useState<{ open: boolean; collection: Collection | null }>({
    open: false,
    collection: null,
  });
  const [confirmDelete, setConfirmDelete] = useState<Collection | null>(null);
  const deleteCollection = useDeleteCollection();
  const toast = useToast();

  const activeCollection = pathname === '/' ? params.get('collection') : null;
  const sidebar = (onNavigate?: () => void) => (
    <Sidebar
      onNavigate={onNavigate}
      onNewCollection={() => {
        onNavigate?.();
        setCollectionDialog({ open: true, collection: null });
      }}
      onEditCollection={(collection) => {
        onNavigate?.();
        setCollectionDialog({ open: true, collection });
      }}
    />
  );

  return (
    <ShellContext.Provider
      value={{
        openAddBookmark: () => setAddOpen(true),
        openNewCollection: () => setCollectionDialog({ open: true, collection: null }),
      }}
    >
      <div className="flex min-h-dvh flex-col">
        <a
          href="#main"
          className="sr-only z-50 rounded-lg bg-white px-4 py-2 font-semibold text-indigo-700 shadow focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
        >
          Skip to content
        </a>
        <WakeBanner />
        <OfflineBanner />
        <DemoBanner />
        <EphemeralStoreBanner />
        <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/85 backdrop-blur dark:border-slate-800 dark:bg-slate-950/85">
          <div className="mx-auto flex h-16 max-w-7xl items-center gap-2 px-4 sm:gap-4">
            <IconButton label="Open navigation" className="lg:hidden" onClick={() => setNavOpen(true)}>
              <Menu className="size-5" aria-hidden />
            </IconButton>
            <Link to="/" className="hidden shrink-0 rounded-lg sm:block lg:w-60" aria-label="LinkVault home">
              <Wordmark />
            </Link>
            <div className="flex flex-1 justify-center">
              <SearchBar />
            </div>
            <Button onClick={() => setAddOpen(true)} className="shrink-0" aria-label="Save a link">
              <Plus className="size-4" aria-hidden />
              <span className="hidden sm:inline">Save link</span>
            </Button>
            <button
              type="button"
              onClick={() => void navigate('/settings')}
              aria-label={`Account settings for ${user?.email ?? 'you'}`}
              title={user?.email}
              className="flex size-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 text-sm font-bold text-white"
            >
              {(user?.name ?? user?.email ?? '?')[0]?.toUpperCase()}
            </button>
          </div>
        </header>

        <div className="mx-auto flex w-full max-w-7xl flex-1 gap-8 px-4">
          <aside className="sticky top-16 hidden h-[calc(100dvh-4rem)] w-60 shrink-0 overflow-y-auto py-6 lg:block">
            {sidebar()}
          </aside>
          <main id="main" tabIndex={-1} className="min-w-0 flex-1 py-6 outline-none">
            <Outlet />
          </main>
        </div>
      </div>

      <MobileNav open={navOpen} onClose={() => setNavOpen(false)}>
        {sidebar(() => setNavOpen(false))}
      </MobileNav>
      <AddBookmarkDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        defaultCollectionId={activeCollection && activeCollection !== 'none' ? activeCollection : null}
      />
      <CollectionDialog
        open={collectionDialog.open}
        collection={collectionDialog.collection}
        onClose={() => setCollectionDialog({ open: false, collection: null })}
        onDelete={(collection) => {
          setCollectionDialog({ open: false, collection: null });
          setConfirmDelete(collection);
        }}
      />
      <ConfirmDialog
        open={confirmDelete !== null}
        title="Delete collection?"
        message={`“${confirmDelete?.name ?? ''}” will be deleted. Its bookmarks are kept and moved to Unsorted.`}
        confirmLabel="Delete collection"
        loading={deleteCollection.isPending}
        onClose={() => setConfirmDelete(null)}
        onConfirm={() =>
          confirmDelete &&
          deleteCollection.mutate(confirmDelete.id, {
            onSuccess: () => {
              toast('Collection deleted — bookmarks moved to Unsorted');
              if (activeCollection === confirmDelete.id) void navigate('/');
              setConfirmDelete(null);
            },
            onError: (error) => toast(error.message, 'error'),
          })
        }
      />
    </ShellContext.Provider>
  );
}
