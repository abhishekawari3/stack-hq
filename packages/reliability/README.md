# @stackhq/reliability

Circuit breaker, rate limiting (4 algorithms), retry with backoff, and
bulkhead isolation — the core resilience patterns for calling flaky
dependencies safely.

```bash
npm install @stackhq/reliability
```

## Table of contents

- [CircuitBreaker](#circuitbreaker)
- [RateLimiter](#ratelimiter)
- [retry / Retrier](#retry--retrier)
- [Bulkhead](#bulkhead)

---

## CircuitBreaker

Classic three-state breaker: `CLOSED` (normal) → `OPEN` (failing fast) →
`HALF_OPEN` (trial requests) → back to `CLOSED` or `OPEN`.

```ts
new CircuitBreaker(name: string, config?: CircuitBreakerConfig)
```

```ts
interface CircuitBreakerConfig {
  failureThreshold?: number; // default: 5 consecutive failures trips it
  successThreshold?: number; // default: 2 successes in HALF_OPEN closes it
  resetTimeoutMs?: number; // default: 30000 — how long to stay OPEN before trying HALF_OPEN
  rollingWindowSize?: number; // default: 20 — recent calls considered for failure rate
  failureRateThreshold?: number; // default: 0.5 — fraction of failures in the window that also trips it
}
```

| Method        | Description                                                                        |
| ------------- | ---------------------------------------------------------------------------------- |
| `execute(fn)` | Run `fn` through the breaker; throws `CircuitBreakerOpenError` immediately if OPEN |
| `getState()`  | Current state (auto-transitions OPEN → HALF_OPEN after the reset timeout)          |
| `reset()`     | Force back to CLOSED                                                               |
| `getStats()`  | `{ name, state, consecutiveFailures, rollingWindow }`                              |

### Example

```ts
import { CircuitBreaker, CircuitBreakerOpenError } from "@stackhq/reliability";

const breaker = new CircuitBreaker("payments-service", {
  failureThreshold: 5,
  resetTimeoutMs: 30_000,
});

try {
  const result = await breaker.execute(() =>
    fetch("https://payments.internal/charge"),
  );
} catch (err) {
  if (err instanceof CircuitBreakerOpenError) {
    // fail fast — service is known to be down, don't pile on more requests
  }
}
```

---

## RateLimiter

Supports 4 algorithms, keyed per identity (e.g. per user/IP) via an
internal map — one instance can serve a whole app.

```ts
new RateLimiter(
  algorithm: "token-bucket" | "fixed-window" | "sliding-window-log" | "sliding-window-counter",
  limit: number,
  windowMs: number
)
```

| Method               | Description                                     |
| -------------------- | ----------------------------------------------- |
| `check(key)`         | Returns `{ allowed, remaining, retryAfterMs? }` |
| `middleware(keyFn?)` | Express middleware; defaults to `req.ip`        |

### Algorithm tradeoffs

| Algorithm                | Behavior                                                                   | Memory           |
| ------------------------ | -------------------------------------------------------------------------- | ---------------- |
| `token-bucket`           | Smooth refill rate, allows bursts up to bucket size                        | O(1) per key     |
| `fixed-window`           | Simple counter reset every window; can allow 2x burst at window boundaries | O(1) per key     |
| `sliding-window-log`     | Exact — stores every timestamp in the window                               | O(limit) per key |
| `sliding-window-counter` | Approximates sliding window by weighting the previous window's count       | O(1) per key     |

### Example

```ts
import { RateLimiter } from "@stackhq/reliability";

const limiter = new RateLimiter("token-bucket", 100, 60_000); // 100 req/min, bursts allowed
app.use(limiter.middleware());

const result = limiter.check("user:42");
if (!result.allowed) {
  // result.retryAfterMs tells you how long to wait
}
```

> Need this enforced across multiple instances instead of per-process? See
> [`@stackhq/redis`](./redis.md)'s `RedisRateLimiter`.

---

## retry / Retrier

Retries an async function with configurable backoff and an optional
predicate for which errors are worth retrying.

```ts
retry<T>(fn: (attempt: number) => Promise<T>, config?: RetryConfig): Promise<T>
```

```ts
interface RetryConfig {
  maxAttempts?: number; // default: 3
  baseDelayMs?: number; // default: 200
  maxDelayMs?: number; // default: 10000
  strategy?: "fixed" | "linear" | "exponential"; // default: "exponential"
  jitter?: boolean; // default: true
  retryOn?: (error) => boolean; // default: retry all errors
  onRetry?: (attempt, error, delayMs) => void; // hook for logging
}
```

`Retrier` is a thin class wrapper for reusing the same config across calls:
`new Retrier(config).run(fn)`.

### Example

```ts
import { retry } from "@stackhq/reliability";

const data = await retry(
  () => fetch("https://api.example.com/data").then((r) => r.json()),
  {
    maxAttempts: 4,
    strategy: "exponential",
    retryOn: (err) => err.status >= 500, // don't retry 4xx client errors
    onRetry: (attempt, err, delay) =>
      console.warn(`retry ${attempt} after ${delay}ms:`, err.message),
  },
);
```

---

## Bulkhead

Isolates resource usage per dependency so one slow/failing downstream
service can't exhaust the whole app's capacity. Limits concurrent
executions and optionally queues excess calls up to a bound.

```ts
new Bulkhead(name: string, config: { maxConcurrent: number; maxQueue?: number })
```

| Method        | Description                                                                                  |
| ------------- | -------------------------------------------------------------------------------------------- |
| `execute(fn)` | Run `fn` if under the concurrency limit; queue or reject (`BulkheadRejectedError`) otherwise |
| `getStats()`  | `{ name, active, queued, maxConcurrent, maxQueue }`                                          |

### Example

```ts
import { Bulkhead, BulkheadRejectedError } from "@stackhq/reliability";

const bulkhead = new Bulkhead("payments-pool", {
  maxConcurrent: 10,
  maxQueue: 50,
});

try {
  const result = await bulkhead.execute(() => callPaymentsService());
} catch (err) {
  if (err instanceof BulkheadRejectedError) {
    // at capacity — surface a 503 rather than let this call pile up indefinitely
  }
}
```

### Composing all four together

```ts
async function callPaymentsService() {
  return breaker.execute(() =>
    bulkhead.execute(() =>
      retry(() => fetch("https://payments.internal/charge"), {
        maxAttempts: 3,
      }),
    ),
  );
}
```
