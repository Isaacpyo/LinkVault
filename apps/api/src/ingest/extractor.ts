import { Worker } from 'node:worker_threads';
import { extractArticle, type ExtractedArticle, type ExtractInput } from './extract.js';

/** Extraction failure with a message safe to show the user. Not retried. */
export class ExtractionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ExtractionError';
  }
}

export interface Extractor {
  extract(input: ExtractInput): Promise<ExtractedArticle>;
  close(): Promise<void>;
}

/** Runs extraction on the calling thread. Used by tests and by `tsx` in development. */
export const inProcessExtractor: Extractor = {
  extract: async (input) => extractArticle(input),
  close: async () => {},
};

export interface WorkerExtractorOptions {
  size: number;
  /** A page that takes longer than this is abandoned and its worker replaced. */
  timeoutMs?: number;
  /** Heap limit per worker; a page that exceeds it fails without affecting the API. */
  maxHeapMb?: number;
  workerUrl?: URL;
}

type Reply = { ok: true; article: ExtractedArticle } | { ok: false; error: string };

/**
 * Small worker-thread pool. Each worker handles one page at a time; a timeout,
 * crash or out-of-memory error rejects that page and replaces the worker.
 */
export class WorkerExtractor implements Extractor {
  private readonly idle: Worker[] = [];
  private readonly workers = new Set<Worker>();
  private readonly waiting: Array<(worker: Worker) => void> = [];
  private closed = false;
  private readonly timeoutMs: number;
  private readonly maxHeapMb: number;
  private readonly workerUrl: URL;

  constructor(private readonly options: WorkerExtractorOptions) {
    this.timeoutMs = options.timeoutMs ?? 20_000;
    this.maxHeapMb = options.maxHeapMb ?? 192;
    this.workerUrl = options.workerUrl ?? new URL('./extract-worker.js', import.meta.url);
  }

  async extract(input: ExtractInput): Promise<ExtractedArticle> {
    if (this.closed) throw new ExtractionError('Extraction is shutting down');
    const worker = await this.acquire();
    return new Promise<ExtractedArticle>((resolve, reject) => {
      const finish = (healthy: boolean) => {
        clearTimeout(timer);
        worker.off('message', onMessage);
        worker.off('error', onError);
        worker.off('exit', onExit);
        if (healthy) this.release(worker);
        else this.discard(worker);
      };
      const onMessage = (reply: Reply) => {
        finish(true);
        if (reply.ok) resolve(reply.article);
        else reject(new ExtractionError('Could not extract the page'));
      };
      const onError = (error: Error) => {
        finish(false);
        const oom = (error as { code?: string }).code === 'ERR_WORKER_OUT_OF_MEMORY';
        reject(new ExtractionError(oom ? 'The page is too large to process' : 'Could not extract the page'));
      };
      const onExit = () => {
        finish(false);
        reject(new ExtractionError('Could not extract the page'));
      };
      const timer = setTimeout(() => {
        finish(false);
        reject(new ExtractionError('The page took too long to process'));
      }, this.timeoutMs);
      worker.on('message', onMessage);
      worker.once('error', onError);
      worker.once('exit', onExit);
      worker.postMessage(input);
    });
  }

  async close(): Promise<void> {
    this.closed = true;
    await Promise.all([...this.workers].map((worker) => worker.terminate()));
    this.workers.clear();
    this.idle.length = 0;
  }

  private acquire(): Promise<Worker> {
    const worker = this.idle.pop();
    if (worker) return Promise.resolve(worker);
    if (this.workers.size < this.options.size) return Promise.resolve(this.spawn());
    return new Promise((resolve) => this.waiting.push(resolve));
  }

  private spawn(): Worker {
    const worker = new Worker(this.workerUrl, { resourceLimits: { maxOldGenerationSizeMb: this.maxHeapMb } });
    worker.unref();
    // Forget workers that die while idle so they are never handed a job.
    worker.once('exit', () => {
      this.workers.delete(worker);
      const index = this.idle.indexOf(worker);
      if (index !== -1) this.idle.splice(index, 1);
    });
    this.workers.add(worker);
    return worker;
  }

  private release(worker: Worker) {
    const next = this.waiting.shift();
    if (next) next(worker);
    else this.idle.push(worker);
  }

  private discard(worker: Worker) {
    this.workers.delete(worker);
    void worker.terminate();
    const next = this.waiting.shift();
    if (next && !this.closed) next(this.spawn());
  }
}

/**
 * Worker threads when running the compiled build (dist/extract-worker.js exists next
 * to this code); in-process when running TypeScript sources (tests, `tsx watch`).
 */
export function createExtractor(size: number): Extractor {
  return import.meta.url.endsWith('.ts') ? inProcessExtractor : new WorkerExtractor({ size });
}
