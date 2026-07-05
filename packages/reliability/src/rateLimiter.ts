export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterMs?: number;
}

interface Bucket {
  tokens: number;
  lastRefill: number;
}

interface WindowCounter {
  count: number;
  windowStart: number;
}

interface SlidingLog {
  timestamps: number[];
}

interface SlidingWindowCounter {
  currentCount: number;
  previousCount: number;
  currentWindowStart: number;
}

/**
 * Rate limiter supporting 4 algorithms:
 *  - token-bucket
 *  - fixed-window
 *  - sliding-window-log
 *  - sliding-window-counter
 *
 * Keyed per-identity (e.g. per user/IP) via a Map, so one instance can
 * serve an entire app.
 */
export class RateLimiter {
  private buckets = new Map<string, Bucket>();
  private fixedWindows = new Map<string, WindowCounter>();
  private slidingLogs = new Map<string, SlidingLog>();
  private slidingCounters = new Map<string, SlidingWindowCounter>();

  constructor(
    private algorithm: "token-bucket" | "fixed-window" | "sliding-window-log" | "sliding-window-counter",
    private limit: number,
    private windowMs: number
  ) {}

  check(key: string): RateLimitResult {
    switch (this.algorithm) {
      case "token-bucket":
        return this.tokenBucket(key);
      case "fixed-window":
        return this.fixedWindow(key);
      case "sliding-window-log":
        return this.slidingWindowLog(key);
      case "sliding-window-counter":
        return this.slidingWindowCounter(key);
    }
  }

  private tokenBucket(key: string): RateLimitResult {
    const now = Date.now();
    const refillRatePerMs = this.limit / this.windowMs;
    let bucket = this.buckets.get(key);
    if (!bucket) {
      bucket = { tokens: this.limit, lastRefill: now };
      this.buckets.set(key, bucket);
    }

    const elapsed = now - bucket.lastRefill;
    bucket.tokens = Math.min(this.limit, bucket.tokens + elapsed * refillRatePerMs);
    bucket.lastRefill = now;

    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      return { allowed: true, remaining: Math.floor(bucket.tokens) };
    }
    const msUntilNextToken = (1 - bucket.tokens) / refillRatePerMs;
    return { allowed: false, remaining: 0, retryAfterMs: Math.ceil(msUntilNextToken) };
  }

  private fixedWindow(key: string): RateLimitResult {
    const now = Date.now();
    let counter = this.fixedWindows.get(key);
    if (!counter || now - counter.windowStart >= this.windowMs) {
      counter = { count: 0, windowStart: now };
      this.fixedWindows.set(key, counter);
    }

    if (counter.count < this.limit) {
      counter.count++;
      return { allowed: true, remaining: this.limit - counter.count };
    }
    return {
      allowed: false,
      remaining: 0,
      retryAfterMs: this.windowMs - (now - counter.windowStart),
    };
  }

  private slidingWindowLog(key: string): RateLimitResult {
    const now = Date.now();
    let log = this.slidingLogs.get(key);
    if (!log) {
      log = { timestamps: [] };
      this.slidingLogs.set(key, log);
    }
    // Drop timestamps outside the window
    log.timestamps = log.timestamps.filter((t) => now - t < this.windowMs);

    if (log.timestamps.length < this.limit) {
      log.timestamps.push(now);
      return { allowed: true, remaining: this.limit - log.timestamps.length };
    }
    const oldest = log.timestamps[0];
    return { allowed: false, remaining: 0, retryAfterMs: this.windowMs - (now - oldest) };
  }

  private slidingWindowCounter(key: string): RateLimitResult {
    const now = Date.now();
    let counter = this.slidingCounters.get(key);
    if (!counter) {
      counter = { currentCount: 0, previousCount: 0, currentWindowStart: now };
      this.slidingCounters.set(key, counter);
    }

    const elapsedSinceWindowStart = now - counter.currentWindowStart;
    if (elapsedSinceWindowStart >= this.windowMs) {
      const windowsPassed = Math.floor(elapsedSinceWindowStart / this.windowMs);
      if (windowsPassed === 1) {
        counter.previousCount = counter.currentCount;
      } else {
        counter.previousCount = 0;
      }
      counter.currentCount = 0;
      counter.currentWindowStart += windowsPassed * this.windowMs;
    }

    const weightOfPrevious = 1 - (now - counter.currentWindowStart) / this.windowMs;
    const estimatedCount = counter.previousCount * weightOfPrevious + counter.currentCount;

    if (estimatedCount < this.limit) {
      counter.currentCount++;
      return { allowed: true, remaining: Math.max(0, Math.floor(this.limit - estimatedCount - 1)) };
    }
    return {
      allowed: false,
      remaining: 0,
      retryAfterMs: this.windowMs - (now - counter.currentWindowStart),
    };
  }

  /** Express-style middleware, keyed by req.ip by default */
  middleware(keyFn: (req: any) => string = (req) => req.ip) {
    return (req: any, res: any, next: any) => {
      const result = this.check(keyFn(req));
      res.setHeader?.("X-RateLimit-Remaining", result.remaining);
      if (!result.allowed) {
        res.setHeader?.("Retry-After", Math.ceil((result.retryAfterMs ?? 0) / 1000));
        return res.status(429).json({ error: "Too many requests", retryAfterMs: result.retryAfterMs });
      }
      next();
    };
  }
}
