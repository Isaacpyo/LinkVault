import { Agent, errors as undiciErrors, request } from 'undici';
import { VERSION } from '../version.js';
import { assertFetchableUrl, BlockedUrlError, safeLookup } from './ssrf.js';

export interface FetchedPage {
  body: Buffer;
  contentType: string | null;
  /** URL after redirects; used as the base for relative links. */
  finalUrl: string;
}

export interface PageFetcher {
  fetch(url: string): Promise<FetchedPage>;
}

/** A fetch failure with a message safe to show the user. `retryable` marks transient failures. */
export class FetchError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = 'FetchError';
  }
}

const MAX_REDIRECTS = 5;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const EXTRACTABLE_TYPES = ['text/html', 'application/xhtml+xml', 'text/plain'];

export interface HttpPageFetcherOptions {
  timeoutMs: number;
  maxBytes: number;
  /** Development/e2e only: allow fetching localhost and private networks. */
  allowPrivate: boolean;
}

const header = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) ?? null;

/**
 * Fetches pages with SSRF protection, manual redirect handling (each hop is
 * re-validated), an overall timeout and a body size cap.
 */
export class HttpPageFetcher implements PageFetcher {
  private readonly agent: Agent;

  constructor(private readonly options: HttpPageFetcherOptions) {
    this.agent = new Agent({
      connect: options.allowPrivate ? {} : { lookup: safeLookup },
      headersTimeout: options.timeoutMs,
      bodyTimeout: options.timeoutMs,
      connections: 16,
    });
  }

  async fetch(url: string): Promise<FetchedPage> {
    const signal = AbortSignal.timeout(this.options.timeoutMs);
    let current = url;

    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      try {
        assertFetchableUrl(current, this.options.allowPrivate);
      } catch (error) {
        throw new FetchError(error instanceof Error ? error.message : 'URL is not allowed', false);
      }

      let response: Awaited<ReturnType<typeof request>>;
      try {
        response = await request(current, {
          dispatcher: this.agent,
          method: 'GET',
          signal,
          headers: {
            'user-agent': `Mozilla/5.0 (compatible; LinkVaultBot/${VERSION}; +https://linkvault.temitopeagbola.com)`,
            accept: 'text/html,application/xhtml+xml;q=0.9,text/plain;q=0.8,*/*;q=0.5',
            'accept-language': 'en;q=0.9,*;q=0.5',
          },
        });
      } catch (error) {
        throw toFetchError(error);
      }

      const { statusCode, headers, body } = response;
      if (REDIRECT_STATUSES.has(statusCode)) {
        await body.dump();
        const location = header(headers.location);
        if (!location) throw new FetchError(`The site redirected (HTTP ${statusCode}) without a location`, false);
        current = new URL(location, current).toString();
        continue;
      }
      if (statusCode >= 400) {
        await body.dump();
        throw new FetchError(`The site responded with HTTP ${statusCode}`, statusCode >= 500 || statusCode === 429);
      }

      const contentType = header(headers['content-type']);
      const mime = contentType?.split(';')[0]?.trim().toLowerCase();
      if (mime && !EXTRACTABLE_TYPES.includes(mime)) {
        await body.dump();
        throw new FetchError(`Only web pages can be extracted (this is ${mime})`, false);
      }

      const chunks: Buffer[] = [];
      let size = 0;
      try {
        for await (const chunk of body) {
          size += (chunk as Buffer).length;
          if (size > this.options.maxBytes) {
            body.destroy();
            throw new FetchError(`The page is larger than ${Math.round(this.options.maxBytes / 1_000_000)} MB`, false);
          }
          chunks.push(chunk as Buffer);
        }
      } catch (error) {
        throw toFetchError(error);
      }
      return { body: Buffer.concat(chunks), contentType, finalUrl: current };
    }
    throw new FetchError('The page redirected too many times', false);
  }

  async close(): Promise<void> {
    await this.agent.close();
  }
}

function toFetchError(error: unknown): FetchError {
  if (error instanceof FetchError) return error;
  if (error instanceof BlockedUrlError) return new FetchError(error.message, false);
  const cause = (error as { cause?: unknown }).cause;
  if (cause instanceof BlockedUrlError) return new FetchError(cause.message, false);
  const name = (error as { name?: string }).name;
  if (
    name === 'TimeoutError' ||
    name === 'AbortError' ||
    error instanceof undiciErrors.HeadersTimeoutError ||
    error instanceof undiciErrors.BodyTimeoutError
  ) {
    return new FetchError('Timed out while fetching the page', true);
  }
  const code = (error as { code?: string }).code ?? (cause as { code?: string } | undefined)?.code;
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN')
    return new FetchError('The site could not be found (DNS lookup failed)', code === 'EAI_AGAIN');
  if (code === 'ECONNREFUSED') return new FetchError('The site refused the connection', true);
  if (code === 'ECONNRESET' || code === 'UND_ERR_SOCKET') return new FetchError('The connection was reset', true);
  if (code?.startsWith('ERR_TLS') || code?.includes('CERT'))
    return new FetchError('The site has an invalid TLS certificate', false);
  return new FetchError('Could not fetch the page', true);
}
