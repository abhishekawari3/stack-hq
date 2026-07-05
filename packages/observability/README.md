# @stackhq/observability

Health check registry and a Prometheus-style metrics registry.

```bash
npm install @stackhq/observability
```

## Table of contents

- [HealthCheckRegistry](#healthcheckregistry)
- [MetricsRegistry](#metricsregistry)

---

## HealthCheckRegistry

Aggregates multiple named health checks (DB connection, cache, message
broker, downstream services, disk space, etc.) into a single overall
status, suitable for a `/health` or `/readiness` endpoint.

```ts
new HealthCheckRegistry();
```

| Method                    | Description                                                                     |
| ------------------------- | ------------------------------------------------------------------------------- |
| `register(name, checkFn)` | `checkFn` returns/resolves `{ status: "up" \| "down" \| "degraded", details? }` |
| `unregister(name)`        | Remove a check                                                                  |
| `runAll(timeoutMs?)`      | Run every check in parallel (default 5s timeout each), returns overall status   |
| `handler(timeoutMs?)`     | Express handler; responds `200` for up/degraded, `503` for down                 |

Overall status is `"down"` if any check is down, else `"degraded"` if any
check is degraded, else `"up"`.

### Example

```ts
import { HealthCheckRegistry } from "@stackhq/observability";

const health = new HealthCheckRegistry();

health.register("database", async () => {
  const ok = await db.ping();
  return { status: ok ? "up" : "down" };
});

health.register("redis", async () => {
  const latency = await pingRedis();
  return {
    status: latency < 100 ? "up" : "degraded",
    details: { latencyMs: latency },
  };
});

app.get("/health", health.handler());
```

---

## MetricsRegistry

Dependency-free metrics registry supporting counters, gauges, and
histograms, exported in Prometheus text exposition format.

```ts
new MetricsRegistry();
```

| Method                                                  | Description                                                          |
| ------------------------------------------------------- | -------------------------------------------------------------------- |
| `incrementCounter(name, value?, labels?)`               | Increase a counter (default `+1`)                                    |
| `setGauge(name, value, labels?)`                        | Set a gauge to an absolute value                                     |
| `incrementGauge(name, delta?, labels?)`                 | Adjust a gauge relatively                                            |
| `observeHistogram(name, value, labels?, buckets?)`      | Record an observation into bucketed histogram                        |
| `time(name, fn, labels?)`                               | Time an async function and record its duration (ms) into a histogram |
| `getCounter(name, labels?)` / `getGauge(name, labels?)` | Read current values                                                  |
| `export()`                                              | Render everything in Prometheus text format                          |
| `handler()`                                             | Express handler for a `/metrics` endpoint                            |
| `reset()`                                               | Clear all metrics                                                    |

Default histogram buckets (ms): `5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000`.

### Example

```ts
import { MetricsRegistry } from "@stackhq/observability";

const metrics = new MetricsRegistry();

app.use((req, res, next) => {
  metrics.incrementCounter("http_requests_total", 1, {
    method: req.method,
    route: req.path,
  });
  next();
});

app.get("/users/:id", async (req, res) => {
  const user = await metrics.time("db_query_duration_ms", () =>
    db.users.findById(req.params.id),
  );
  res.json(user);
});

app.get("/metrics", metrics.handler()); // scrape endpoint for Prometheus
```
