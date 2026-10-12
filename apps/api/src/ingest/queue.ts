export interface IngestJob {
  bookmarkId: string;
  userId: string;
  /** Page HTML captured by the extension; when present the page is not fetched. */
  html?: string;
}

type Worker = (job: IngestJob) => Promise<void>;
type ErrorLogger = (error: unknown, job: IngestJob) => void;

/**
 * Small in-process work queue with bounded concurrency.
 * - Re-saving a page while it is queued replaces the queued job.
 * - Two jobs for the same bookmark never run at once: a job enqueued while one is
 *   running waits for it, so the latest request is applied last.
 * - Exposes per-user counts and queued HTML bytes so callers can apply back-pressure.
 */
export class IngestQueue {
  private readonly queued = new Map<string, IngestJob>();
  private readonly order: string[] = [];
  private readonly running = new Map<string, IngestJob>();
  private stopped = false;
  private idleWaiters: Array<() => void> = [];

  constructor(
    private readonly worker: Worker,
    private readonly concurrency: number,
    private readonly onError: ErrorLogger = () => {},
  ) {}

  /** Jobs waiting plus jobs running. */
  get size(): number {
    return this.order.length + this.running.size;
  }

  /** Bytes of captured HTML held by waiting jobs. */
  get queuedHtmlBytes(): number {
    let total = 0;
    for (const job of this.queued.values()) total += job.html?.length ?? 0;
    return total;
  }

  has(bookmarkId: string): boolean {
    return this.queued.has(bookmarkId) || this.running.has(bookmarkId);
  }

  countFor(userId: string): number {
    let count = 0;
    for (const job of this.queued.values()) if (job.userId === userId) count++;
    for (const job of this.running.values()) if (job.userId === userId) count++;
    return count;
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
    while (this.running.size < this.concurrency) {
      const index = this.order.findIndex((id) => !this.running.has(id));
      if (index === -1) break;
      const [id] = this.order.splice(index, 1) as [string];
      const job = this.queued.get(id);
      this.queued.delete(id);
      if (!job) continue;
      this.running.set(id, job);
      this.worker(job)
        .catch((error: unknown) => this.onError(error, job))
        .finally(() => {
          this.running.delete(id);
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
