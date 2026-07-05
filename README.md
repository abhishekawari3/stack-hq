# @stack-hq — a suite of scoped backend packages

Instead of one monolithic library, stack-hq ships as independent, individually
installable packages under the `@stack-hq` npm scope. Pull in only what you
need.

| Package | What it does |
|---|---|
| [`@stack-hq/auth`](packages/auth) | JWT, OAuth 2.0 (Google/GitHub/Facebook), sessions, token refresh & rotation, token blacklisting |
| [`@stack-hq/rbac`](packages/rbac) | Role management, permission guards, role inheritance, conditional permissions, default roles |
| [`@stack-hq/cache`](packages/cache) | In-memory LRU / LFU / TTL cache |
| [`@stack-hq/logger`](packages/logger) | Structured logging, levels, JSON/pretty output, child loggers, redaction |
| [`@stack-hq/config`](packages/config) | Env-based config loader, schema validation, type coercion, `.env` parsing |
| [`@stack-hq/redis`](packages/redis) | Redis-backed distributed cache, rate limiter, lock, and session store |
| [`@stack-hq/prisma`](packages/prisma) | Base repository pattern, transactions with retry, pagination, soft delete |
| [`@stack-hq/microservices`](packages/microservices) | Base service class, service discovery, inter-service comms, Docker Compose template |
| [`@stack-hq/scaling`](packages/scaling) | Load balancing (4 algorithms), consistent hashing |
| [`@stack-hq/reliability`](packages/reliability) | Circuit breaker, rate limiting (4 algorithms), retry + backoff, bulkhead |
| [`@stack-hq/messaging`](packages/messaging) | Message queue with retries/DLQ, topic-based pub/sub |
| [`@stack-hq/architecture`](packages/architecture) | CQRS, event sourcing, saga pattern |
| [`@stack-hq/observability`](packages/observability) | Health checks, Prometheus-style metrics |

Each package has its own `package.json`, version, README, and LICENSE — install
and publish them independently.

## Install what you need

```bash
npm install @stack-hq/auth @stack-hq/rbac @stack-hq/cache
```

## Repo structure (npm workspaces)

```
stack-hq/
  package.json          <- workspace root (private, not published)
  tsconfig.base.json     <- shared compiler options
  packages/
    auth/
      package.json       <- @stack-hq/auth
      tsconfig.json
      src/
      README.md
      LICENSE
    rbac/
    cache/
    logger/
    config/
    redis/
    prisma/
    microservices/
    scaling/
    reliability/
    messaging/
    architecture/
    observability/
```

## Build everything

```bash
npm install
npm run build     # builds every package (tsc -p tsconfig.json in each)
```

## Publish everything

```bash
npm run publish-all   # npm publish --workspaces --access public
```

Or publish one package at a time:

```bash
cd packages/auth
npm publish --access public
```

> **Before publishing:** create the `stack-hq` org on npmjs.com (one-time,
> free) so you can publish under the `@stack-hq` scope, and run `npm login`.
> Each package's `package.json` has placeholder `YOUR_NAME_HERE` and
> `YOUR_GITHUB_USERNAME` fields — update those first.

## Versioning

Each package is versioned independently. Bump a single package with:

```bash
cd packages/cache
npm version patch    # or minor / major
npm publish --access public
```

## License

MIT (per package)
