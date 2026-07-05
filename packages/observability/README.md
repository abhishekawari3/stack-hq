# @stack-hq/observability

Health check registry (aggregate multiple dependency checks into one `/health` response) and a Prometheus-style metrics registry (counters, gauges, histograms).

## Install
```bash
npm install @stack-hq/observability
```

## Usage
```ts
import { HealthCheckRegistry, MetricsRegistry } from "@stack-hq/observability";

const health = new HealthCheckRegistry();
health.register("database", async () => ({ status: (await db.ping()) ? "up" : "down" }));
app.get("/health", health.handler());

const metrics = new MetricsRegistry();
app.get("/metrics", metrics.handler());
app.use((req, res, next) => {
  metrics.incrementCounter("http_requests_total", 1, { method: req.method });
  next();
});
```

## License
MIT
