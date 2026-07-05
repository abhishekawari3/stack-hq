# @stack-hq/reliability

Circuit breaker, rate limiting (4 algorithms), retry with backoff, and bulkhead isolation — the core resilience patterns for calling flaky dependencies safely.

## Install
```bash
npm install @stack-hq/reliability
```

## Usage
```ts
import { CircuitBreaker, RateLimiter, retry, Bulkhead } from "@stack-hq/reliability";

const breaker = new CircuitBreaker("payments-service", { failureThreshold: 5 });
const bulkhead = new Bulkhead("payments-pool", { maxConcurrent: 10, maxQueue: 50 });
const limiter = new RateLimiter("token-bucket", 100, 60_000);

async function callPaymentsService() {
  return breaker.execute(() =>
    bulkhead.execute(() =>
      retry(() => fetch("https://payments.internal/charge"), { maxAttempts: 3, strategy: "exponential" })
    )
  );
}
```

## License
MIT
