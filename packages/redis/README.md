# @stackhq/redis

Redis-backed distributed cache, rate limiter, distributed lock, and session
store. Bring your own client — anything shaped like `ioredis` or
`node-redis` v4+ satisfies the required interface, so there's no hard
dependency to install unless you want type-checking against the real client.

```bash
npm install @stackhq/redis ioredis
```

## Table of contents

- [RedisClientLike](#redisclientlike)
- [RedisCache](#rediscache)
- [RedisRateLimiter](#redisratelimiter)
- [RedisLock](#redislock)
- [RedisSessionStore](#redissessionstore)

---

## RedisClientLike

The interface every adapter in this package depends on. Both `ioredis` and
`node-redis` (v4+) clients already satisfy this shape:

```ts
interface RedisClientLike {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ...args: any[]): Promise<any>;
  del(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<number>;
  incr(key: string): Promise<number>;
  ttl(key: string): Promise<number>;
  eval(script: string, ...args: any[]): Promise<any>;
  publish(channel: string, message: string): Promise<number>;
  subscribe?(
    channel: string,
    callback: (message: string) => void,
  ): Promise<void> | void;
}
```

---

## RedisCache

Distributed cache with the same ergonomics as `@stackhq/cache`'s in-memory
cache, but shared across every process/instance connected to the same Redis.

```ts
new RedisCache(client: RedisClientLike, config?: RedisCacheConfig)
```

```ts
interface RedisCacheConfig {
  keyPrefix?: string; // default: "cache:"
  defaultTtlSeconds?: number;
}
```

| Method                                   | Description                                              |
| ---------------------------------------- | -------------------------------------------------------- |
| `get<T>(key)`                            | Returns the parsed value, or `undefined` if missing      |
| `set(key, value, ttlSeconds?)`           | Stores a value (JSON-serialized unless already a string) |
| `delete(key)`                            | Removes an entry                                         |
| `getOrSet<T>(key, factory, ttlSeconds?)` | Cache-aside helper                                       |

### Example

```ts
import Redis from "ioredis";
import { RedisCache } from "@stackhq/redis";

const client = new Redis(process.env.REDIS_URL);
const cache = new RedisCache(client, { defaultTtlSeconds: 300 });

const user = await cache.getOrSet(`user:${id}`, () => db.users.findById(id));
```

---

## RedisRateLimiter

Fixed-window rate limiting backed by Redis `INCR` + `EXPIRE`, enforced
consistently across every instance of a horizontally scaled app.

```ts
new RedisRateLimiter(client: RedisClientLike, limit: number, windowSeconds: number, keyPrefix?: string)
```

| Method               | Description                                          |
| -------------------- | ---------------------------------------------------- |
| `check(identifier)`  | Returns `{ allowed, remaining, retryAfterSeconds? }` |
| `middleware(keyFn?)` | Express middleware; defaults to keying on `req.ip`   |

### Example

```ts
import { RedisRateLimiter } from "@stackhq/redis";

const limiter = new RedisRateLimiter(client, 100, 60); // 100 req / 60s per key
app.use(limiter.middleware());
app.use(
  "/api/heavy",
  limiter.middleware((req) => `heavy:${req.user.id}`),
); // custom key
```

---

## RedisLock

Distributed mutex using Redis `SET NX PX` (single-instance Redlock-lite).
Good for "only one worker should run this job at a time" use cases.

```ts
new RedisLock(client: RedisClientLike, keyPrefix?: string)
```

| Method                                     | Description                                                |
| ------------------------------------------ | ---------------------------------------------------------- |
| `acquire(name, ttlMs?)`                    | Try once; returns a `LockHandle` or `null` if already held |
| `acquireWithRetry(name, ttlMs?, options?)` | Poll until acquired or `timeoutMs` elapses                 |
| `withLock(fn, name, ttlMs?)`               | Acquire, run `fn`, then always release                     |

`LockHandle` has `.release(): Promise<boolean>` — safe against releasing a
lock that expired and was re-acquired by someone else (token-checked via a
Lua script).

### Example

```ts
import { RedisLock } from "@stackhq/redis";

const lock = new RedisLock(client);

await lock.withLock(
  "send-daily-report",
  async () => {
    await sendReport(); // guaranteed single execution across all instances
  },
  30_000,
); // 30s TTL in case the process crashes mid-task
```

---

## RedisSessionStore

Drop-in Redis-backed replacement for `@stackhq/auth`'s in-memory
`SessionStore` — same `get`/`set`/`delete` shape, so pass it straight into
`SessionManager`.

```ts
new RedisSessionStore(client: RedisClientLike, keyPrefix?: string)
```

### Example

```ts
import { SessionManager } from "@stackhq/auth";
import { RedisSessionStore } from "@stackhq/redis";

const sessions = new SessionManager({ store: new RedisSessionStore(client) });
```
