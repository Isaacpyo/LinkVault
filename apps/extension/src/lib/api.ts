import type {
  AuthResponse,
  Bookmark,
  Collection,
  SaveBookmarkResponse,
  TagCount,
  UpdateBookmarkInput,
} from '@linkvault/shared';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export const SLOW_REQUEST_MS = 2_500;

export interface SaveInput {
  url: string;
  title?: string;
  tags?: string[];
  collectionId?: string | null;
  readLater?: boolean;
  html?: string;
}
const WAKE_DEADLINE_MS = 75_000;

export interface ApiOptions {
  baseUrl: string;
  token?: string | null;
  /** Called once when a request becomes slow (free-tier server waking up). */
  onSlow?: () => void;
  fetchImpl?: typeof fetch;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Minimal API client for the popup and background worker, with cold-start retries. */
export function createApi({ baseUrl, token, onSlow, fetchImpl = (...args) => fetch(...args) }: ApiOptions) {
  async function request<T>(path: string, init: { method?: string; body?: unknown; retry?: boolean } = {}): Promise<T> {
    const method = init.method ?? 'GET';
    const retry = init.retry ?? method === 'GET';
    const deadline = Date.now() + WAKE_DEADLINE_MS;
    let reportedSlow = false;
    const markSlow = () => {
      if (!reportedSlow) onSlow?.();
      reportedSlow = true;
    };
    // A slow response or a retry through a gateway error both mean the server is waking.
    const slowTimer = setTimeout(markSlow, SLOW_REQUEST_MS);
    const headers: Record<string, string> = {};
    if (token) headers.authorization = `Bearer ${token}`;
    if (init.body !== undefined) headers['content-type'] = 'application/json';
    try {
      for (let attempt = 0; ; attempt++) {
        let response: Response;
        try {
          response = await fetchImpl(`${baseUrl}${path}`, {
            method,
            headers,
            body: init.body === undefined ? undefined : JSON.stringify(init.body),
          });
        } catch {
          if (retry && Date.now() < deadline) {
            markSlow();
            await sleep(Math.min(1000 * 2 ** attempt, 8000));
            continue;
          }
          throw new ApiError(0, "Can't reach LinkVault. Check the API URL in the extension settings.");
        }
        const data = (response.status === 204 ? null : await response.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        if ([502, 503, 504].includes(response.status) && !data?.error && retry && Date.now() < deadline) {
          markSlow();
          await sleep(Math.min(1000 * 2 ** attempt, 8000));
          continue;
        }
        if (!response.ok)
          throw new ApiError(response.status, data?.error?.message ?? `Request failed (HTTP ${response.status})`);
        return data as T;
      }
    } finally {
      clearTimeout(slowTimer);
    }
  }

  return {
    login: (email: string, password: string) =>
      request<AuthResponse>('/auth/login', { method: 'POST', body: { email, password }, retry: true }),
    demo: () => request<AuthResponse>('/auth/demo', { method: 'POST', retry: true }),
    lookup: (url: string) => request<{ bookmark: Bookmark | null }>(`/bookmarks/lookup?url=${encodeURIComponent(url)}`),
    get: (id: string) => request<{ bookmark: Bookmark }>(`/bookmarks/${encodeURIComponent(id)}`),
    save: async (input: SaveInput): Promise<SaveBookmarkResponse> => {
      // Saving is idempotent server-side (same URL → same bookmark), so it is safe to retry while the server wakes.
      try {
        return await request<SaveBookmarkResponse>('/bookmarks', { method: 'POST', body: input, retry: true });
      } catch (error) {
        // A captured page the API rejects (too large) must not lose the save: let the server fetch it.
        if (input.html && error instanceof ApiError && (error.status === 413 || error.status === 400)) {
          const { html: _html, ...withoutHtml } = input;
          return request<SaveBookmarkResponse>('/bookmarks', { method: 'POST', body: withoutHtml, retry: true });
        }
        throw error;
      }
    },
    update: (id: string, input: UpdateBookmarkInput) =>
      request<{ bookmark: Bookmark }>(`/bookmarks/${encodeURIComponent(id)}`, { method: 'PATCH', body: input }),
    remove: (id: string) => request<null>(`/bookmarks/${encodeURIComponent(id)}`, { method: 'DELETE' }),
    collections: () => request<{ collections: Collection[] }>('/collections'),
    tags: async (): Promise<TagCount[]> => (await request<{ tags: TagCount[] }>('/library/summary')).tags,
  };
}

export type Api = ReturnType<typeof createApi>;
