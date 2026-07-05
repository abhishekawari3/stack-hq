# @stackhq/logger

Structured logging with levels, JSON/pretty output, child loggers,
automatic redaction of sensitive fields, and a `time()` helper.

```bash
npm install @stackhq/logger
```

## Logger

### Constructor

```ts
new Logger(config?: LoggerConfig)
```

```ts
interface LoggerConfig {
  name?: string;
  level?: "trace" | "debug" | "info" | "warn" | "error" | "fatal"; // default: "info"
  format?: "json" | "pretty"; // default: "json"
  redactKeys?: string[]; // default: ["password", "token", "secret", "authorization"]
  bindings?: Record<string, any>; // fields attached to every log line
  destination?: (line: string) => void; // default: console.log
}
```

### Methods

| Method                                                | Description                                                                    |
| ----------------------------------------------------- | ------------------------------------------------------------------------------ |
| `trace/debug/info/warn/error/fatal(message, fields?)` | Log at the given level; below-threshold calls are no-ops                       |
| `setLevel(level)`                                     | Change the minimum log level at runtime                                        |
| `child(bindings, name?)`                              | Create a derived logger that merges in extra bound context (e.g. a request ID) |
| `time(label, fn, level?)`                             | Time an async/sync function, logging its duration on success or failure        |

A pre-configured default instance is also exported: `import { logger } from "@stackhq/logger"`.

### Levels & filtering

Levels are ordered `trace < debug < info < warn < error < fatal`. Setting
`level: "warn"` means `trace`/`debug`/`info` calls are silently dropped —
useful for cutting log volume in production while keeping `warn`+ visible.

### Redaction

Any object field whose key (case-insensitive) matches an entry in
`redactKeys` is replaced with `"[REDACTED]"` before logging, recursively
through nested objects and arrays. This applies to the `fields` argument of
each log call, not to the `message` string itself — don't interpolate
secrets directly into the message text.

### Example

```ts
import { Logger } from "@stackhq/logger";

const log = new Logger({ name: "api", level: "info", format: "json" });

log.info("server started", { port: 3000 });
log.error("db connection failed", { error: err.message });

// Per-request context, e.g. Express middleware
app.use((req, res, next) => {
  req.log = log.child({ requestId: req.headers["x-request-id"] });
  next();
});

app.post("/login", (req, res) => {
  req.log.info("login attempt", {
    email: req.body.email,
    password: req.body.password,
  });
  // password field is automatically redacted in the output
});

// Timing a slow operation
await log.time("db.query.users", () => db.users.findMany());
```

### Pretty vs JSON output

```ts
new Logger({ format: "pretty" }); // colorized, human-readable — good for local dev
new Logger({ format: "json" }); // one JSON object per line — good for log aggregators (Datadog, CloudWatch, etc.)
```
