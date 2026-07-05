# @stack-hq/cache

In-memory cache supporting LRU, LFU, and TTL eviction policies, with a `getOrSet` helper for cache-aside patterns.

## Install
```bash
npm install @stack-hq/cache
```

## Usage
```ts
import { Cache } from "@stack-hq/cache";

const cache = new Cache<string, User>({ maxSize: 5000, policy: "LRU", defaultTtlMs: 60_000 });
const user = await cache.getOrSet(`user:${id}`, () => db.users.findById(id));
```

Need a distributed (multi-instance) cache instead? See `@stack-hq/redis`.

## License
MIT
