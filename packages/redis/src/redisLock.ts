import { randomBytes } from "crypto";
import { RedisClientLike } from "./client";

export interface LockHandle {
  key: string;
  token: string;
  release(): Promise<boolean>;
}

// Only releases the lock if this holder's token still matches (avoids
// releasing a lock that was already re-acquired by someone else after expiry).
const RELEASE_SCRIPT = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
else
  return 0
end
`;

/**
 * Simple distributed mutex using Redis SET NX PX (single-instance
 * Redlock-lite). Good enough for most "only one worker should do X"
 * use cases; for high-stakes multi-node Redis Redlock semantics,
 * layer this across N independent Redis instances yourself.
 */
export class RedisLock {
  constructor(private client: RedisClientLike, private keyPrefix = "lock:") {}

  /** Attempt to acquire a lock; returns null immediately if already held */
  async acquire(name: string, ttlMs = 10_000): Promise<LockHandle | null> {
    const key = `${this.keyPrefix}${name}`;
    const token = randomBytes(16).toString("hex");

    const result = await this.client.set(key, token, "PX", ttlMs, "NX");
    if (!result) return null;

    return {
      key,
      token,
      release: async () => {
        const res = await this.client.eval(RELEASE_SCRIPT, 1, key, token);
        return res === 1;
      },
    };
  }

  /** Acquire with retries, polling until the lock frees up or timeout elapses */
  async acquireWithRetry(
    name: string,
    ttlMs = 10_000,
    { retryDelayMs = 100, timeoutMs = 5000 }: { retryDelayMs?: number; timeoutMs?: number } = {}
  ): Promise<LockHandle | null> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const handle = await this.acquire(name, ttlMs);
      if (handle) return handle;
      await new Promise((r) => setTimeout(r, retryDelayMs));
    }
    return null;
  }

  /** Run a function while holding the lock, releasing it afterward */
  async withLock<T>(name: string, fn: () => Promise<T>, ttlMs = 10_000): Promise<T> {
    const handle = await this.acquireWithRetry(name, ttlMs);
    if (!handle) throw new Error(`Could not acquire lock "${name}"`);
    try {
      return await fn();
    } finally {
      await handle.release();
    }
  }
}
