import { describe, expect, it } from 'vitest';
import { IngestQueue, type IngestJob } from './queue.js';

const job = (id: string, html?: string): IngestJob => ({ bookmarkId: id, userId: 'u', ...(html && { html }) });

describe('IngestQueue', () => {
  it('limits concurrency and drains', async () => {
    let running = 0;
    let peak = 0;
    const queue = new IngestQueue(async () => {
      running++;
      peak = Math.max(peak, running);
      await new Promise((resolve) => setTimeout(resolve, 5));
      running--;
    }, 2);
    for (let i = 0; i < 6; i++) queue.enqueue(job(`b${i}`));
    await queue.onIdle();
    expect(peak).toBe(2);
    expect(queue.size).toBe(0);
  });

  it('replaces a queued job for the same bookmark', async () => {
    const seen: IngestJob[] = [];
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const queue = new IngestQueue(async (j) => {
      if (j.bookmarkId === 'blocker') await gate;
      seen.push(j);
    }, 1);
    queue.enqueue(job('blocker'));
    queue.enqueue(job('a'));
    queue.enqueue(job('a', '<html>captured</html>'));
    release();
    await queue.onIdle();
    expect(seen.map((j) => j.bookmarkId)).toEqual(['blocker', 'a']);
    expect(seen[1]?.html).toBe('<html>captured</html>');
  });

  it('never runs two jobs for the same bookmark at once', async () => {
    const events: string[] = [];
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const queue = new IngestQueue(async (j) => {
      events.push(`start:${j.html ?? 'fetch'}`);
      if (!j.html) await gate;
      events.push(`end:${j.html ?? 'fetch'}`);
    }, 2);
    queue.enqueue(job('a'));
    await Promise.resolve();
    expect(queue.has('a')).toBe(true);
    queue.enqueue(job('a', 'captured'));
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(events).toEqual(['start:fetch']); // the second job waits despite a free slot
    release();
    await queue.onIdle();
    expect(events).toEqual(['start:fetch', 'end:fetch', 'start:captured', 'end:captured']);
  });

  it('counts jobs per user and queued HTML bytes', () => {
    const queue = new IngestQueue(() => new Promise(() => {}), 1);
    queue.enqueue({ bookmarkId: 'a', userId: 'u1' });
    queue.enqueue({ bookmarkId: 'b', userId: 'u1', html: 'x'.repeat(100) });
    queue.enqueue({ bookmarkId: 'c', userId: 'u2' });
    expect(queue.countFor('u1')).toBe(2);
    expect(queue.countFor('u2')).toBe(1);
    expect(queue.queuedHtmlBytes).toBe(100);
    expect(queue.size).toBe(3);
  });

  it('reports worker errors and keeps going', async () => {
    const errors: unknown[] = [];
    const done: string[] = [];
    const queue = new IngestQueue(
      async (j) => {
        if (j.bookmarkId === 'bad') throw new Error('boom');
        done.push(j.bookmarkId);
      },
      1,
      (error) => errors.push(error),
    );
    queue.enqueue(job('bad'));
    queue.enqueue(job('good'));
    await queue.onIdle();
    expect(errors).toHaveLength(1);
    expect(done).toEqual(['good']);
  });

  it('ignores work after stop', async () => {
    const done: string[] = [];
    const queue = new IngestQueue(async (j) => void done.push(j.bookmarkId), 1);
    await queue.stop();
    queue.enqueue(job('late'));
    await queue.onIdle();
    expect(done).toEqual([]);
  });
});
