# StackHQ Documentation

StackHQ is a suite of independent, scoped backend packages published under
`@stackhq/*` (or your own scope, e.g. `@stack-hq/*`). Install only what you
need — no package depends on any other package in the suite.

## Packages

| Package                  | Purpose                                                        | Docs                                   |
| ------------------------ | -------------------------------------------------------------- | -------------------------------------- |
| `@stackhq/auth`          | JWT, OAuth 2.0, sessions, token refresh/rotation, blacklisting | [auth.md](./auth.md)                   |
| `@stackhq/rbac`          | Roles, inheritance, permission guards, conditional permissions | [rbac.md](./rbac.md)                   |
| `@stackhq/cache`         | In-memory LRU / LFU / TTL cache                                | [cache.md](./cache.md)                 |
| `@stackhq/logger`        | Structured logging with levels, redaction, child loggers       | [logger.md](./logger.md)               |
| `@stackhq/config`        | Env config loader with schema validation                       | [config.md](./config.md)               |
| `@stackhq/redis`         | Redis-backed cache, rate limiter, lock, session store          | [redis.md](./redis.md)                 |
| `@stackhq/prisma`        | Base repository, transactions, pagination, soft delete         | [prisma.md](./prisma.md)               |
| `@stackhq/microservices` | Base service class, discovery, inter-service comms             | [microservices.md](./microservices.md) |
| `@stackhq/scaling`       | Load balancing (4 algorithms), consistent hashing              | [scaling.md](./scaling.md)             |
| `@stackhq/reliability`   | Circuit breaker, rate limiting, retry, bulkhead                | [reliability.md](./reliability.md)     |
| `@stackhq/messaging`     | Message queue with retries/DLQ, pub/sub                        | [messaging.md](./messaging.md)         |
| `@stackhq/architecture`  | CQRS, event sourcing, saga pattern                             | [architecture.md](./architecture.md)   |
| `@stackhq/observability` | Health checks, Prometheus-style metrics                        | [observability.md](./observability.md) |

## Installation

Each package is installed independently:

```bash
npm install @stackhq/auth
npm install @stackhq/auth @stackhq/rbac @stackhq/cache   # or several at once
```

All packages are written in TypeScript and ship with `.d.ts` type
definitions — no `@types/*` package needed.

## Requirements

- Node.js >= 16
- TypeScript >= 5 (optional — packages work fine from plain JS/CommonJS too)

## Design principles

1. **No cross-package dependencies.** `@stackhq/auth` doesn't import
   `@stackhq/redis`, etc. Adapters are documented where two packages are
   commonly paired (e.g. using `@stackhq/redis`'s `RedisSessionStore` with
   `@stackhq/auth`'s `SessionManager`), but nothing is wired together for you.
2. **Duck-typed, not hard-coupled.** `@stackhq/redis` and `@stackhq/prisma`
   define minimal interfaces (`RedisClientLike`, `PrismaModelDelegate`)
   instead of depending directly on `ioredis` or `@prisma/client`. Pass in
   your real client/delegate and it just works.
3. **In-memory by default, swappable in production.** Things like caches,
   session stores, and rate limiters default to in-memory implementations
   so you can prototype without infra — swap in the Redis-backed versions
   when you scale to multiple instances.
4. **Framework-agnostic core, Express-shaped middleware helpers.** Core
   logic (e.g. `RateLimiter.check()`) has no framework dependency; a
   `.middleware()` method is provided as a convenience for Express-style
   `(req, res, next)` handlers, but you can call the underlying methods
   directly from Koa, Fastify, or anywhere else.

## Getting help

Each package's doc page below covers full API reference, constructor
options, and runnable examples. For publishing instructions, see the root
[README.md](../README.md).
