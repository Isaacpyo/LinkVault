import type { FastifyBaseLogger } from 'fastify';
import { isSearchUnavailableError } from '../store/opensearch.js';
import type { Store } from '../store/types.js';
import type { ExtractedArticle } from './extract.js';
import { ExtractionError, inProcessExtractor, type Extractor } from './extractor.js';
import { FetchError, type PageFetcher } from './fetcher.js';
import { IngestQueue, type IngestJob } from './queue.js';

export interface IngestServiceOptions {
  concurrency: number;
  extractor?: Extractor;
  maxAttempts?: number;
  retryDelayMs?: number;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Transient failures worth another attempt: flaky sites and an unreachable search cluster. */
const isRetryable = (error: unknown) =>
  error instanceof FetchError
    ? error.retryable
    : !(error instanceof ExtractionError) && isSearchUnavailableError(error);

const userMessage = (error: unknown) =>
  error instanceof FetchError || error instanceof ExtractionError ? error.message : 'Could not extract the page';

/**
 * Turns a pending bookmark into a searchable one: fetch (or use captured HTML)
 * → Readability in a worker thread → update the document to "ready" or "failed".
 */
export class IngestService {
  readonly queue: IngestQueue;
  private readonly extractor: Extractor;
  private readonly maxAttempts: number;
  private readonly retryDelayMs: number;

  constructor(
    private readonly store: Store,
    private readonly fetcher: PageFetcher,
    private readonly log: FastifyBaseLogger,
    options: IngestServiceOptions,
  ) {
    this.extractor = options.extractor ?? inProcessExtractor;
    this.maxAttempts = options.maxAttempts ?? 2;
    this.retryDelayMs = options.retryDelayMs ?? 2_000;
    this.queue = new IngestQueue(
      (job) => this.process(job),
      options.concurrency,
      (error, job) => this.log.error({ err: error, bookmarkId: job.bookmarkId }, 'ingest job crashed'),
    );
  }

  enqueue(job: IngestJob): void {
    this.queue.enqueue(job);
  }

  /** Re-queues bookmarks left pending by a previous process (crash, deploy, free-tier sleep). */
  async resumePending(limit = 200): Promise<number> {
    const pending = await this.store.listPendingBookmarks(limit);
    for (const bookmark of pending) this.enqueue({ bookmarkId: bookmark.id, userId: bookmark.userId });
    return pending.length;
  }

  async close(): Promise<void> {
    await this.queue.stop();
    await this.extractor.close();
  }

  async process(job: IngestJob): Promise<void> {
    for (let attempt = 1; ; attempt++) {
      try {
        const record = await this.store.getBookmark(job.userId, job.bookmarkId);
        if (!record) return; // deleted while queued
        const article = await this.extractFor(record.url, job.html);
        await this.applyResult(job, article, attempt);
        return;
      } catch (error) {
        if (isRetryable(error) && attempt < this.maxAttempts) {
          await sleep(this.retryDelayMs * attempt);
          continue;
        }
        if (!(error instanceof FetchError))
          this.log.warn({ err: error, bookmarkId: job.bookmarkId }, 'extraction failed');
        await this.store
          .patchBookmark(job.userId, job.bookmarkId, {
            status: 'failed',
            error: userMessage(error),
            updatedAt: new Date().toISOString(),
          })
          .catch((err: unknown) => this.log.error({ err, bookmarkId: job.bookmarkId }, 'could not record failure'));
        return;
      }
    }
  }

  private async extractFor(url: string, html: string | undefined): Promise<ExtractedArticle> {
    if (html) return this.extractor.extract({ body: html, url, contentType: 'text/html; charset=utf-8' });
    const page = await this.fetcher.fetch(url);
    return this.extractor.extract({ body: page.body, url: page.finalUrl, contentType: page.contentType });
  }

  /** Re-reads the bookmark so edits made while the page was being fetched are not overwritten. */
  private async applyResult(job: IngestJob, article: ExtractedArticle, attempt: number) {
    const current = await this.store.getBookmark(job.userId, job.bookmarkId);
    if (!current) return;
    const now = new Date().toISOString();
    const hasText = article.content.length > 0;
    await this.store.patchBookmark(job.userId, job.bookmarkId, {
      title: current.customTitle ? current.title : (article.title ?? current.title),
      excerpt: article.excerpt,
      content: article.content,
      contentHtml: article.contentHtml,
      siteName: article.siteName,
      byline: article.byline,
      lang: article.lang,
      wordCount: article.wordCount,
      readingMinutes: hasText ? article.readingMinutes : null,
      status: hasText ? 'ready' : 'failed',
      error: hasText ? null : 'No readable text was found on the page',
      attempts: current.attempts + attempt,
      fetchedAt: now,
      updatedAt: now,
    });
    this.log.info({ bookmarkId: job.bookmarkId, words: article.wordCount }, 'bookmark extracted');
  }
}
