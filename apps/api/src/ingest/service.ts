import type { FastifyBaseLogger } from 'fastify';
import type { Store } from '../store/types.js';
import { extractArticle } from './extract.js';
import { FetchError, type PageFetcher } from './fetcher.js';
import { IngestQueue, type IngestJob } from './queue.js';

export interface IngestServiceOptions {
  concurrency: number;
  maxAttempts?: number;
  retryDelayMs?: number;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Turns a pending bookmark into a searchable one: fetch (or use captured HTML)
 * → Readability → sanitize → update the document to "ready" or "failed".
 */
export class IngestService {
  readonly queue: IngestQueue;
  private readonly maxAttempts: number;
  private readonly retryDelayMs: number;

  constructor(
    private readonly store: Store,
    private readonly fetcher: PageFetcher,
    private readonly log: FastifyBaseLogger,
    options: IngestServiceOptions,
  ) {
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

  async process(job: IngestJob): Promise<void> {
    const record = await this.store.getBookmark(job.userId, job.bookmarkId);
    if (!record) return; // deleted while queued

    for (let attempt = 1; ; attempt++) {
      try {
        const article = job.html
          ? extractArticle({ body: job.html, url: record.url, contentType: 'text/html; charset=utf-8' })
          : await this.fetcher
              .fetch(record.url)
              .then((page) => extractArticle({ body: page.body, url: page.finalUrl, contentType: page.contentType }));
        const now = new Date().toISOString();
        const hasText = article.content.length > 0;
        await this.store.patchBookmark(job.userId, job.bookmarkId, {
          title: record.customTitle ? record.title : (article.title ?? record.title),
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
          attempts: record.attempts + attempt,
          fetchedAt: now,
          updatedAt: now,
        });
        this.log.info({ bookmarkId: job.bookmarkId, words: article.wordCount }, 'bookmark extracted');
        return;
      } catch (error) {
        const retryable = error instanceof FetchError && error.retryable;
        if (retryable && attempt < this.maxAttempts) {
          await sleep(this.retryDelayMs);
          continue;
        }
        const message = error instanceof FetchError ? error.message : 'Could not extract the page';
        if (!(error instanceof FetchError))
          this.log.error({ err: error, bookmarkId: job.bookmarkId }, 'extraction failed');
        await this.store.patchBookmark(job.userId, job.bookmarkId, {
          status: 'failed',
          error: message,
          attempts: record.attempts + attempt,
          updatedAt: new Date().toISOString(),
        });
        return;
      }
    }
  }
}
