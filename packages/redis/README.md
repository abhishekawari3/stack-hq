# @stack-hq/redis

Redis-backed distributed cache, rate limiter, distributed lock, and session store. Bring your own client — anything shaped like `ioredis` or `node-redis` v4+ works, no hard dependency required.

## Install
```bash
npm install @stack-hq/redis ioredis
```

## Usage
```ts
import Redis from "ioredis";
import { RedisCache, RedisRateLimiter, RedisLock, RedisSessionStore } from "@stack-hq/redis";

const client = new Redis(process.env.REDIS_URL);

const cache = new RedisCache(client, { defaultTtlSeconds: 300 });
await cache.set("user:1", { name: "Alice" });

const limiter = new RedisRateLimiter(client, 100, 60); // 100 requests / 60s, shared across all instances
app.use(limiter.middleware());

const lock = new RedisLock(client);
await lock.withLock("send-daily-report", async () => {
  await sendReport(); // only one instance runs this at a time
});

const sessionStore = new RedisSessionStore(client); // drop-in for @stack-hq/auth's SessionManager
```

## License
MIT
