import type {
  ApiErrorBody,
  AuthResponse,
  Bookmark,
  Collection,
  CreateBookmarkInput,
  CreateCollectionInput,
  HealthResponse,
  LibrarySummary,
  PublicUser,
  ReaderContent,
  SaveBookmarkResponse,
  SearchResponse,
  UpdateBookmarkInput,
  UpdateCollectionInput,
} from '@linkvault/shared';
import { WAKE_THRESHOLD_MS, wakeTracker, type WakeTracker } from './wake';

/** Production fallback if VITE_API_URL was not set at build time (the Render service URL). */
const PRODUCTION_API_URL = 'https://linkvault-api.onrender.com';

export const API_URL = (
  import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:4000' : PRODUCTION_API_URL)
).replace(/\/+$/, '');

/** How long idempotent requests keep retrying while the server boots. */
const WAKE_DEADLINE_MS = 90_000;

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /** Field-level validation messages, when the API returned them. */
  get fields(): Record<string, string> {
    const fields = (this.details as { fields?: Record<string, string> } | undefined)?.fields;
    return fields ?? {};
  }
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  signal?: AbortSignal;
  /** Retry through gateway errors/network failures while the server wakes (default: GET only). */
  retry?: boolean;
}

export interface ApiClientOptions {
  baseUrl?: string;
  getToken?: () => string | null;
  onUnauthorized?: () => void;
  fetchImpl?: typeof fetch;
  tracker?: WakeTracker;
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const backoff = (attempt: number) => Math.min(1_000 * 2 ** attempt, 8_000);

const isErrorEnvelope = (data: unknown): data is ApiErrorBody =>
  typeof data === 'object' &&
  data !== null &&
  'error' in data &&
  typeof (data as ApiErrorBody).error?.message === 'string';

export class ApiClient {
  readonly baseUrl: string;
  private readonly getToken: () => string | null;
  private readonly onUnauthorized: () => void;
  private readonly fetchImpl: typeof fetch;
  private readonly tracker: WakeTracker;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(options: ApiClientOptions = {}) {
    this.baseUrl = (options.baseUrl ?? API_URL).replace(/\/+$/, '');
    this.getToken = options.getToken ?? (() => null);
    this.onUnauthorized = options.onUnauthorized ?? (() => {});
    this.fetchImpl = options.fetchImpl ?? ((...args) => fetch(...args));
    this.tracker = options.tracker ?? wakeTracker;
    this.sleep = options.sleep ?? defaultSleep;
  }

  /** Same client configuration, authenticated with a different token (session hand-off). */
  withToken(token: string): ApiClient {
    return new ApiClient({
      baseUrl: this.baseUrl,
      getToken: () => token,
      fetchImpl: this.fetchImpl,
      tracker: this.tracker,
      sleep: this.sleep,
    });
  }

  /** URL of the reader-content endpoint; also the Cache Storage key for offline copies. */
  contentUrl(id: string) {
    return `${this.baseUrl}/bookmarks/${encodeURIComponent(id)}/content`;
  }

  async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const method = options.method ?? 'GET';
    const retry = options.retry ?? method === 'GET';
    const deadline = Date.now() + WAKE_DEADLINE_MS;
    let release: (() => void) | null = null;
    const slowTimer = setTimeout(() => {
      release ??= this.tracker.begin();
    }, WAKE_THRESHOLD_MS);

    const headers: Record<string, string> = {};
    const token = this.getToken();
    if (token) headers.authorization = `Bearer ${token}`;
    if (options.body !== undefined) headers['content-type'] = 'application/json';

    try {
      for (let attempt = 0; ; attempt++) {
        let response: Response;
        try {
          response = await this.fetchImpl(`${this.baseUrl}${path}`, {
            method,
            headers,
            body: options.body === undefined ? undefined : JSON.stringify(options.body),
            signal: options.signal,
          });
        } catch (error) {
          if ((error as Error).name === 'AbortError') throw error;
          if (typeof navigator !== 'undefined' && navigator.onLine === false) {
            throw new ApiError(0, 'OFFLINE', "You're offline. Reconnect to load fresh data.");
          }
          if (retry && Date.now() < deadline) {
            release ??= this.tracker.begin();
            await this.sleep(backoff(attempt));
            continue;
          }
          throw new ApiError(0, 'NETWORK', "Can't reach the LinkVault server. Check your connection and try again.");
        }

        const data: unknown = response.status === 204 ? null : await response.json().catch(() => null);

        // Gateway errors without our JSON envelope come from the hosting proxy while the instance boots.
        if ([502, 503, 504].includes(response.status) && !isErrorEnvelope(data) && retry && Date.now() < deadline) {
          release ??= this.tracker.begin();
          await this.sleep(backoff(attempt));
          continue;
        }

        if (!response.ok) {
          if (response.status === 401 && token) this.onUnauthorized();
          if (isErrorEnvelope(data)) {
            throw new ApiError(response.status, data.error.code, data.error.message, data.error.details);
          }
          throw new ApiError(response.status, 'HTTP_ERROR', `Request failed (HTTP ${response.status})`);
        }
        return data as T;
      }
    } finally {
      clearTimeout(slowTimer);
      (release as (() => void) | null)?.();
    }
  }

  // ------------------------------------------------------------- endpoints

  health = () => this.request<HealthResponse>('/health');

  register = (input: { email: string; password: string; name?: string }) =>
    this.request<AuthResponse>('/auth/register', { method: 'POST', body: input, retry: true });
  login = (input: { email: string; password: string }) =>
    this.request<AuthResponse>('/auth/login', { method: 'POST', body: input, retry: true });
  demo = () => this.request<AuthResponse>('/auth/demo', { method: 'POST', retry: true });
  me = () => this.request<{ user: PublicUser }>('/auth/me');

  summary = () => this.request<LibrarySummary>('/library/summary');

  search = (params: URLSearchParams, signal?: AbortSignal) =>
    this.request<SearchResponse>(`/bookmarks?${params.toString()}`, { signal });

  createBookmark = (input: Omit<CreateBookmarkInput, 'html'>) =>
    this.request<SaveBookmarkResponse>('/bookmarks', { method: 'POST', body: input });
  updateBookmark = (id: string, input: UpdateBookmarkInput) =>
    this.request<{ bookmark: Bookmark }>(`/bookmarks/${encodeURIComponent(id)}`, { method: 'PATCH', body: input });
  deleteBookmark = (id: string) => this.request<null>(`/bookmarks/${encodeURIComponent(id)}`, { method: 'DELETE' });
  refetchBookmark = (id: string) =>
    this.request<{ bookmark: Bookmark }>(`/bookmarks/${encodeURIComponent(id)}/refetch`, { method: 'POST' });
  content = (id: string) => this.request<ReaderContent>(`/bookmarks/${encodeURIComponent(id)}/content`);

  collections = () => this.request<{ collections: Collection[] }>('/collections');
  createCollection = (input: CreateCollectionInput) =>
    this.request<{ collection: Collection }>('/collections', { method: 'POST', body: input });
  updateCollection = (id: string, input: UpdateCollectionInput) =>
    this.request<{ collection: Collection }>(`/collections/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: input,
    });
  deleteCollection = (id: string) => this.request<null>(`/collections/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'Something went wrong. Please try again.';
