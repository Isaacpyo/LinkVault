import { useInfiniteQuery, useMutation, useQuery, useQueryClient, type InfiniteData } from '@tanstack/react-query';
import type {
  Bookmark,
  CreateBookmarkInput,
  CreateCollectionInput,
  SearchResponse,
  UpdateBookmarkInput,
  UpdateCollectionInput,
} from '@linkvault/shared';
import { useAuth } from './auth';
import { removeOffline, saveOffline } from './offline';

export interface LibraryFilters {
  q: string;
  tags: string[];
  collectionId: string | null;
  readLater?: boolean;
  sort?: 'relevance' | 'newest' | 'oldest';
}

export const keys = {
  summary: ['summary'] as const,
  collections: ['collections'] as const,
  bookmarks: ['bookmarks'] as const,
  search: (filters: LibraryFilters) => ['bookmarks', 'search', filters] as const,
  content: (id: string) => ['bookmarks', 'content', id] as const,
  health: ['health'] as const,
};

const PAGE_SIZE = 20;

export function toSearchParams(filters: LibraryFilters, page: number): URLSearchParams {
  const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
  if (filters.q.trim()) params.set('q', filters.q.trim());
  for (const tag of filters.tags) params.append('tags', tag);
  if (filters.collectionId) params.set('collectionId', filters.collectionId);
  if (filters.readLater !== undefined) params.set('readLater', String(filters.readLater));
  if (filters.sort) params.set('sort', filters.sort);
  return params;
}

const hasPending = (data: InfiniteData<SearchResponse> | undefined) =>
  data?.pages.some((page) => page.items.some((item) => item.bookmark.status === 'pending')) ?? false;

export function useSearch(filters: LibraryFilters) {
  const { api } = useAuth();
  return useInfiniteQuery({
    queryKey: keys.search(filters),
    queryFn: ({ pageParam, signal }) => api.search(toSearchParams(filters, pageParam), signal),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page * last.pageSize < last.total ? last.page + 1 : undefined),
    placeholderData: (previous) => previous,
    // Poll while any visible bookmark is still being extracted.
    refetchInterval: (query) => (hasPending(query.state.data) ? 2_000 : false),
  });
}

export function useSummary() {
  const { api } = useAuth();
  return useQuery({ queryKey: keys.summary, queryFn: api.summary });
}

export function useCollections() {
  const { api } = useAuth();
  return useQuery({ queryKey: keys.collections, queryFn: async () => (await api.collections()).collections });
}

export function useHealth() {
  const { api } = useAuth();
  return useQuery({ queryKey: keys.health, queryFn: api.health, staleTime: 60_000, retry: false });
}

function useInvalidateLibrary() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: keys.bookmarks }),
      queryClient.invalidateQueries({ queryKey: keys.summary }),
      queryClient.invalidateQueries({ queryKey: keys.collections }),
    ]);
}

export function useCreateBookmark() {
  const { api } = useAuth();
  const invalidate = useInvalidateLibrary();
  return useMutation({
    mutationFn: (input: Omit<CreateBookmarkInput, 'html'>) => api.createBookmark(input),
    onSuccess: invalidate,
  });
}

export function useUpdateBookmark() {
  const { api } = useAuth();
  const invalidate = useInvalidateLibrary();
  return useMutation({
    mutationFn: async ({ id, input }: { id: string; input: UpdateBookmarkInput }) => {
      const { bookmark } = await api.updateBookmark(id, input);
      // Keep the offline copy in step with the read-later flag.
      if (input.readLater === true && bookmark.status === 'ready') await saveOffline(api, id).catch(() => null);
      if (input.readLater === false) await removeOffline(api, id).catch(() => {});
      return bookmark;
    },
    onSuccess: invalidate,
  });
}

export function useDeleteBookmark() {
  const { api } = useAuth();
  const invalidate = useInvalidateLibrary();
  return useMutation({
    mutationFn: async (bookmark: Bookmark) => {
      await api.deleteBookmark(bookmark.id);
      await removeOffline(api, bookmark.id).catch(() => {});
    },
    onSuccess: invalidate,
  });
}

export function useRefetchBookmark() {
  const { api } = useAuth();
  const invalidate = useInvalidateLibrary();
  return useMutation({ mutationFn: (id: string) => api.refetchBookmark(id), onSuccess: invalidate });
}

export function useCreateCollection() {
  const { api } = useAuth();
  const invalidate = useInvalidateLibrary();
  return useMutation({
    mutationFn: async (input: CreateCollectionInput) => (await api.createCollection(input)).collection,
    onSuccess: invalidate,
  });
}

export function useUpdateCollection() {
  const { api } = useAuth();
  const invalidate = useInvalidateLibrary();
  return useMutation({
    mutationFn: async ({ id, input }: { id: string; input: UpdateCollectionInput }) =>
      (await api.updateCollection(id, input)).collection,
    onSuccess: invalidate,
  });
}

export function useDeleteCollection() {
  const { api } = useAuth();
  const invalidate = useInvalidateLibrary();
  return useMutation({ mutationFn: (id: string) => api.deleteCollection(id), onSuccess: invalidate });
}
