import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiClient, ApiError } from './api';
import { WAKE_THRESHOLD_MS, WakeTracker } from './wake';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const html = (status: number) =>
  new Response('<html>Bad gateway</html>', { status, headers: { 'content-type': 'text/html' } });

function client(responses: Array<Response | Error>, options: { token?: string; onUnauthorized?: () => void } = {}) {
  const fetchImpl = vi.fn(async () => {
    const next = responses.shift();
    if (!next) throw new Error('no more responses');
    if (next instanceof Error) throw next;
    return next;
  });
  const tracker = new WakeTracker();
  const api = new ApiClient({
    baseUrl: 'http://api.test/',
    fetchImpl: fetchImpl as unknown as typeof fetch,
    tracker,
    sleep: async () => {},
    getToken: () => options.token ?? null,
    ...(options.onUnauthorized && { onUnauthorized: options.onUnauthorized }),
  });
  return { api, fetchImpl, tracker };
}

afterEach(() => vi.useRealTimers());

describe('ApiClient', () => {
  it('sends JSON with the bearer token and parses the response', async () => {
    const { api, fetchImpl } = client([json(200, { ok: true })], { token: 'abc' });
    await expect(api.request('/x', { method: 'POST', body: { a: 1 } })).resolves.toEqual({ ok: true });
    expect(fetchImpl).toHaveBeenCalledWith(
      'http://api.test/x',
      expect.objectContaining({
        method: 'POST',
        body: '{"a":1}',
        headers: { authorization: 'Bearer abc', 'content-type': 'application/json' },
      }),
    );
  });

  it('turns the error envelope into an ApiError with field details', async () => {
    const { api } = client([
      json(400, { error: { code: 'VALIDATION_ERROR', message: 'email: bad', details: { fields: { email: 'bad' } } } }),
    ]);
    const error = await api.request('/auth/register', { method: 'POST', body: {} }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 400, code: 'VALIDATION_ERROR', message: 'email: bad' });
    expect((error as ApiError).fields).toEqual({ email: 'bad' });
  });

  it('retries GETs through gateway errors and network failures while the server wakes', async () => {
    const { api, fetchImpl, tracker } = client([
      html(502),
      new TypeError('Failed to fetch'),
      html(503),
      json(200, { status: 'ok' }),
    ]);
    const states: boolean[] = [];
    tracker.subscribe(() => states.push(tracker.getSnapshot().waking));
    await expect(api.request('/health')).resolves.toEqual({ status: 'ok' });
    expect(fetchImpl).toHaveBeenCalledTimes(4);
    expect(states).toEqual([true, false]);
  });

  it('does not retry non-idempotent requests by default', async () => {
    const { api, fetchImpl } = client([html(502), json(201, {})]);
    await expect(api.request('/bookmarks', { method: 'POST', body: {} })).rejects.toMatchObject({ status: 502 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('does not retry a 503 that comes from the API itself', async () => {
    const { api, fetchImpl } = client([
      json(503, { error: { code: 'SERVICE_UNAVAILABLE', message: 'Search is down' } }),
    ]);
    await expect(api.request('/bookmarks')).rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('reports a slow request as waking after the threshold', async () => {
    vi.useFakeTimers();
    let resolve!: (r: Response) => void;
    const tracker = new WakeTracker();
    const api = new ApiClient({
      baseUrl: 'http://api.test',
      tracker,
      fetchImpl: (() => new Promise<Response>((r) => (resolve = r))) as typeof fetch,
    });
    const pending = api.request('/health');
    await vi.advanceTimersByTimeAsync(WAKE_THRESHOLD_MS - 100);
    expect(tracker.getSnapshot().waking).toBe(false);
    await vi.advanceTimersByTimeAsync(200);
    expect(tracker.getSnapshot().waking).toBe(true);
    resolve(json(200, {}));
    await pending;
    expect(tracker.getSnapshot().waking).toBe(false);
  });

  it('signals an expired session on 401 when a token was sent', async () => {
    const onUnauthorized = vi.fn();
    const { api } = client([json(401, { error: { code: 'UNAUTHORIZED', message: 'expired' } })], {
      token: 't',
      onUnauthorized,
    });
    await expect(api.me()).rejects.toMatchObject({ status: 401 });
    expect(onUnauthorized).toHaveBeenCalledOnce();
  });

  it('builds the content URL used as the offline cache key', () => {
    const { api } = client([]);
    expect(api.contentUrl('a b')).toBe('http://api.test/bookmarks/a%20b/content');
  });
});
