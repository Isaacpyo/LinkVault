// Stand-in for dist/extract-worker.js: behaviour is chosen by the URL so the pool's
// timeout and crash handling can be tested without compiling TypeScript.
import { parentPort } from 'node:worker_threads';

parentPort.on('message', (input) => {
  if (input.url.includes('hang')) return; // never replies
  if (input.url.includes('crash')) process.exit(1);
  if (input.url.includes('throw')) return parentPort.postMessage({ ok: false, error: 'boom' });
  const size = typeof input.body === 'string' ? input.body.length : input.body.byteLength;
  parentPort.postMessage({ ok: true, article: { title: input.url, content: `bytes:${size}` } });
});
