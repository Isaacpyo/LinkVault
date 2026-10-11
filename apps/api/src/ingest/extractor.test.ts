import { afterEach, describe, expect, it } from 'vitest';
import { ExtractionError, WorkerExtractor } from './extractor.js';

const workerUrl = new URL('../../test/fixtures/fake-extract-worker.mjs', import.meta.url);
let pool: WorkerExtractor | undefined;

afterEach(async () => {
  await pool?.close();
});

describe('WorkerExtractor', () => {
  it('runs jobs on worker threads and passes Buffers through', async () => {
    pool = new WorkerExtractor({ size: 2, workerUrl });
    const results = await Promise.all(
      ['a', 'b', 'c', 'd'].map((name) => pool!.extract({ body: Buffer.from('hello'), url: `https://x.test/${name}` })),
    );
    expect(results.map((r) => r.content)).toEqual(['bytes:5', 'bytes:5', 'bytes:5', 'bytes:5']);
  });

  it('abandons a page that takes too long and keeps serving others', async () => {
    pool = new WorkerExtractor({ size: 1, workerUrl, timeoutMs: 300 });
    await expect(pool.extract({ body: 'x', url: 'https://x.test/hang' })).rejects.toThrow(
      new ExtractionError('The page took too long to process'),
    );
    await expect(pool.extract({ body: 'x', url: 'https://x.test/ok' })).resolves.toMatchObject({ content: 'bytes:1' });
  });

  it('survives a worker crash and reports extraction errors', async () => {
    pool = new WorkerExtractor({ size: 1, workerUrl });
    await expect(pool.extract({ body: 'x', url: 'https://x.test/crash' })).rejects.toBeInstanceOf(ExtractionError);
    await expect(pool.extract({ body: 'x', url: 'https://x.test/throw' })).rejects.toThrow(
      'Could not extract the page',
    );
    await expect(pool.extract({ body: 'xy', url: 'https://x.test/ok' })).resolves.toMatchObject({ content: 'bytes:2' });
  });
});
