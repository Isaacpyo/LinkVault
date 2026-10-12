import { parentPort } from 'node:worker_threads';
import { extractArticle, type ExtractInput } from './extract.js';

/**
 * Worker-thread entry: parsing a large page with jsdom + Readability is CPU-bound
 * and synchronous, so it runs here instead of blocking the API's event loop.
 */
parentPort?.on('message', (input: ExtractInput) => {
  try {
    // Buffers arrive as plain Uint8Arrays after structured cloning.
    const body = typeof input.body === 'string' ? input.body : Buffer.from(input.body);
    parentPort?.postMessage({ ok: true, article: extractArticle({ ...input, body }) });
  } catch (error) {
    parentPort?.postMessage({ ok: false, error: error instanceof Error ? error.message : String(error) });
  }
});
