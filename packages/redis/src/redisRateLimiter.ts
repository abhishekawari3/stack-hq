import { RedisClientLike } from "./client";

export interface RedisRateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds?: number;
}

/**
 * Fixed-window rate limiter backed by Redis INCR + EXPIRE, so limits are
 * enforced consistently across every instance of a horizontally-scaled
 * app (unlike an in-memory limiter, which is per-process).
 */
export class RedisRateLimiter {
  constructor(
    private client: RedisClientLike,
    private limit: number,
    private windowSeconds: number,
    private keyPrefix = "ratelimit:"
  ) {}

  async check(identifier: string): Promise<RedisRateLimitResult> {
    const key = `${this.keyPrefix}${identifier}`;
    const count = await this.client.incr(key);

    if (count === 1) {
      // First hit in this window — set expiry
      await this.client.expire(key, this.windowSeconds);
    }

    if (count <= this.limit) {
      return { allowed: true, remaining: this.limit - count };
    }

    const ttl = await this.client.ttl(key);
    return { allowed: false, remaining: 0, retryAfterSeconds: ttl > 0 ? ttl : this.windowSeconds };
  }

  /** Express-style middleware */
  middleware(keyFn: (req: any) => string = (req) => req.ip) {
    return async (req: any, res: any, next: any) => {
      const result = await this.check(keyFn(req));
      res.setHeader?.("X-RateLimit-Remaining", result.remaining);
      if (!result.allowed) {
        res.setHeader?.("Retry-After", result.retryAfterSeconds);
        return res.status(429).json({ error: "Too many requests", retryAfterSeconds: result.retryAfterSeconds });
      }
      next();
    };
  }
}
