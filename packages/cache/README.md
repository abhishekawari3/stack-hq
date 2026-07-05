# @stackhq/cache

In-memory cache supporting LRU, LFU, and TTL eviction policies.

```bash
npm install @stackhq/cache
```

## Cache<K, V>

### Constructor

```ts
new Cache<K = string, V = any>(config?: CacheConfig)
```

```ts
interface CacheConfig {
  maxSize?: number; // default: 1000
  defaultTtlMs?: number; // no default expiry unless set
  policy?: "LRU" | "LFU" | "TTL"; // default: "LRU"
}
```

### Methods

| Method     | Signature                              | Description                                                      |
| ---------- | -------------------------------------- | ---------------------------------------------------------------- |
| `set`      | `(key, value, ttlMs?) => void`         | Store a value, optionally with a per-entry TTL                   |
| `get`      | `(key) => V \| undefined`              | Retrieve a value (updates recency/frequency depending on policy) |
| `has`      | `(key) => boolean`                     | Check existence without side effects beyond expiry checks        |
| `delete`   | `(key) => boolean`                     | Remove an entry                                                  |
| `clear`    | `() => void`                           | Empty the cache                                                  |
| `size`     | `get` property                         | Current number of entries                                        |
| `getOrSet` | `(key, factory, ttlMs?) => Promise<V>` | Return cached value, or compute + cache it via `factory()`       |

### Eviction policies

- **LRU** (default): evicts the least recently accessed entry when `maxSize` is exceeded.
- **LFU**: evicts the least frequently accessed entry (tracks per-key hit count).
- **TTL**: entries expire purely based on time; oldest-inserted entries are evicted first once `maxSize` is exceeded.

### Example

```ts
import { Cache } from "@stackhq/cache";

const cache = new Cache<string, User>({
  maxSize: 5000,
  policy: "LRU",
  defaultTtlMs: 60_000,
});

// Cache-aside pattern
const user = await cache.getOrSet(`user:${id}`, () => db.users.findById(id));

cache.set("session:abc", { userId: 1 }, 30_000); // 30s TTL override
cache.delete("session:abc");
```

> Need this shared across multiple app instances instead of per-process?
> See [`@stackhq/redis`](./redis.md)'s `RedisCache`.
