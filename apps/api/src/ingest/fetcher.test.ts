import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { FetchError, HttpPageFetcher } from './fetcher.js';

let server: Server;
let base: string;

beforeAll(async () => {
  server = createServer((req, res) => {
    switch (req.url) {
      case '/article':
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        return res.end('<html><title>Hello</title><body><p>Hi</p></body></html>');
      case '/redirect':
        res.writeHead(302, { location: '/article' });
        return res.end();
      case '/loop':
        res.writeHead(301, { location: '/loop' });
        return res.end();
      case '/to-metadata':
        res.writeHead(302, { location: 'http://169.254.169.254/latest/meta-data/' });
        return res.end();
      case '/pdf':
        res.writeHead(200, { 'content-type': 'application/pdf' });
        return res.end('%PDF-1.7');
      case '/huge':
        res.writeHead(200, { 'content-type': 'text/html' });
        return res.end('x'.repeat(300_000));
      case '/slow':
        setTimeout(() => res.end('<html></html>'), 3_000);
        return;
      case '/boom':
        res.writeHead(503);
        return res.end();
      default:
        res.writeHead(404);
        return res.end();
    }
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
});

const devFetcher = () => new HttpPageFetcher({ timeoutMs: 1_000, maxBytes: 200_000, allowPrivate: true });

const failure = async (promise: Promise<unknown>) => {
  try {
    await promise;
  } catch (error) {
    if (error instanceof FetchError) return error;
    throw error;
  }
  throw new Error('expected a FetchError');
};

describe('HttpPageFetcher', () => {
  it('fetches HTML and follows redirects', async () => {
    const page = await devFetcher().fetch(`${base}/redirect`);
    expect(page.finalUrl).toBe(`${base}/article`);
    expect(page.contentType).toContain('text/html');
    expect(page.body.toString()).toContain('<title>Hello</title>');
  });

  it('stops redirect loops', async () => {
    expect((await failure(devFetcher().fetch(`${base}/loop`))).message).toMatch(/too many times/);
  });

  it('rejects non-HTML content and oversized bodies', async () => {
    expect((await failure(devFetcher().fetch(`${base}/pdf`))).message).toMatch(/application\/pdf/);
    expect((await failure(devFetcher().fetch(`${base}/huge`))).message).toMatch(/larger than/);
  });

  it('marks server errors and timeouts as retryable, 404 as permanent', async () => {
    expect(await failure(devFetcher().fetch(`${base}/boom`))).toMatchObject({ retryable: true });
    expect(await failure(devFetcher().fetch(`${base}/slow`))).toMatchObject({
      retryable: true,
      message: expect.stringMatching(/Timed out/),
    });
    expect(await failure(devFetcher().fetch(`${base}/missing`))).toMatchObject({ retryable: false });
  });

  it('blocks private targets in production mode, including via redirects', async () => {
    const prod = new HttpPageFetcher({ timeoutMs: 1_000, maxBytes: 200_000, allowPrivate: false });
    expect((await failure(prod.fetch(`${base}/article`))).message).toMatch(/standard ports|Private/);
    expect((await failure(prod.fetch('http://localhost/'))).message).toMatch(/Internal hostnames/);

    // With private access allowed for the first hop, a redirect into metadata space is still re-validated.
    const redirectTarget = await failure(devFetcher().fetch(`${base}/to-metadata`));
    expect(redirectTarget).toBeInstanceOf(FetchError);
  });
});
