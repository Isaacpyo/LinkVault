export interface IngestJob {
  bookmarkId: string;
  userId: string;
  /** Page HTML captured by the extension; when present the page is not fetched. */
  html?: string;
}

type Worker = (job: IngestJob) => Promise<void>;
type ErrorLogger = (error: unknown, job: IngestJob) => void;

/**
 * Small in-process work queue with bounded concurrency and per-bookmark
 * de-duplication (re-saving a page while it is queued replaces the queued job).
 */
export class IngestQueue {
  private readonly queued = new Map<string, IngestJob>();
  private readonly order: string[] = [];
  private active = 0;
  private stopped = false;
  private idleWaiters: Array<() => void> = [];

  constructor(
    private readonly worker: Worker,
    private readonly concurrency: number,
    private readonly onError: ErrorLogger = () => {},
  ) {}

  /** Jobs waiting plus jobs running. */
  get size(): number {
    return this.order.length + this.active;
  }

  enqueue(job: IngestJob): void {
    if (this.stopped) return;
    if (!this.queued.has(job.bookmarkId)) this.order.push(job.bookmarkId);
    this.queued.set(job.bookmarkId, job);
    this.pump();
  }

  /** Resolves once nothing is queued or running. */
  onIdle(): Promise<void> {
    if (this.size === 0) return Promise.resolve();
    return new Promise((resolve) => this.idleWaiters.push(resolve));
  }

  /** Stops accepting work, drops queued jobs and waits (bounded) for running ones. */
  async stop(timeoutMs = 5_000): Promise<void> {
    this.stopped = true;
    this.order.length = 0;
    this.queued.clear();
    let timer: NodeJS.Timeout | undefined;
    await Promise.race([
      this.onIdle(),
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, timeoutMs);
      }),
    ]);
    clearTimeout(timer);
  }

  private pump(): void {
    while (this.active < this.concurrency && this.order.length) {
      const id = this.order.shift()!;
      const job = this.queued.get(id);
      this.queued.delete(id);
      if (!job) continue;
      this.active++;
      this.worker(job)
        .catch((error: unknown) => this.onError(error, job))
        .finally(() => {
          this.active--;
          this.pump();
          if (this.size === 0) {
            const waiters = this.idleWaiters;
            this.idleWaiters = [];
            for (const resolve of waiters) resolve();
          }
        });
    }
  }
}
