import { describe, expect, it, vi } from 'vitest';
import { ApiError, createApi } from './api';

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });

describe('extension API client', () => {
  it('sends the token and surfaces API error messages', async () => {
    const fetchImpl = vi.fn(async () =>
      json(401, { error: { code: 'UNAUTHORIZED', message: 'Incorrect email or password' } }),
    );
    const api = createApi({
      baseUrl: 'http://api.test',
      token: 'tok',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await expect(api.lookup('https://example.com')).rejects.toEqual(new ApiError(401, 'Incorrect email or password'));
    expect(fetchImpl).toHaveBeenCalledWith(
      'http://api.test/bookmarks/lookup?url=https%3A%2F%2Fexample.com',
      expect.objectContaining({ headers: { authorization: 'Bearer tok' } }),
    );
  });

  it('retries saves through a cold start (saves are idempotent)', async () => {
    vi.useFakeTimers();
    const responses = [
      new Response('bad gateway', { status: 502 }),
      json(201, { bookmark: { id: 'b' }, created: true }),
    ];
    const fetchImpl = vi.fn(async () => responses.shift()!);
    const onSlow = vi.fn();
    const api = createApi({
      baseUrl: 'http://api.test',
      token: 't',
      onSlow,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const pending = api.save({ url: 'https://example.com' });
    await vi.advanceTimersByTimeAsync(5_000);
    await expect(pending).resolves.toMatchObject({ created: true });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(onSlow).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });
});
