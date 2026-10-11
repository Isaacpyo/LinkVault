/**
 * Serves e2e/fixtures/*.html so the API (with ALLOW_PRIVATE_FETCH=true) can
 * fetch a real page during the Playwright run — no internet needed.
 */
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = fileURLToPath(new URL('.', import.meta.url));
const port = Number(process.env.FIXTURE_PORT ?? 4312);

createServer(async (req, res) => {
  const name = (req.url ?? '/').split('?')[0].replace(/^\/+/, '') || 'index.html';
  if (!/^[\w-]+\.html$/.test(name)) {
    res.writeHead(404).end();
    return;
  }
  try {
    const body = await readFile(join(dir, name));
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(body);
  } catch {
    res.writeHead(404).end();
  }
}).listen(port, '127.0.0.1', () => console.log(`fixtures on http://127.0.0.1:${port}`));
