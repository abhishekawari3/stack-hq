export interface BulkheadConfig {
  maxConcurrent: number; // max simultaneous executions
  maxQueue?: number; // max calls allowed to wait in queue (0 = no queueing)
}

export class BulkheadRejectedError extends Error {
  constructor(name: string) {
    super(`Bulkhead "${name}" rejected the call — at capacity with a full queue`);
    this.name = "BulkheadRejectedError";
  }
}

interface QueuedTask<T> {
  fn: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (err: any) => void;
}

/**
 * Bulkhead pattern: isolates resource usage per dependency so one
 * slow/failing downstream service can't exhaust the whole app's
 * threads/connections. Limits concurrent executions and optionally
 * queues excess calls up to a bound, rejecting fast beyond that.
 */
export class Bulkhead {
  private active = 0;
  private queue: QueuedTask<any>[] = [];
  private maxConcurrent: number;
  private maxQueue: number;

  constructor(private name: string, config: BulkheadConfig) {
    this.maxConcurrent = config.maxConcurrent;
    this.maxQueue = config.maxQueue ?? 0;
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.active < this.maxConcurrent) {
      return this.run(fn);
    }

    if (this.queue.length >= this.maxQueue) {
      throw new BulkheadRejectedError(this.name);
    }

    return new Promise<T>((resolve, reject) => {
      this.queue.push({ fn, resolve, reject });
    });
  }

  private async run<T>(fn: () => Promise<T>): Promise<T> {
    this.active++;
    try {
      return await fn();
    } finally {
      this.active--;
      this.drainQueue();
    }
  }

  private drainQueue(): void {
    if (this.queue.length === 0 || this.active >= this.maxConcurrent) return;
    const next = this.queue.shift()!;
    this.run(next.fn).then(next.resolve, next.reject);
  }

  getStats() {
    return {
      name: this.name,
      active: this.active,
      queued: this.queue.length,
      maxConcurrent: this.maxConcurrent,
      maxQueue: this.maxQueue,
    };
  }
}
