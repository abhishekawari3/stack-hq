# @stack-hq/logger

Structured logging with levels, JSON or pretty output, child loggers, automatic redaction of sensitive fields, and a `time()` helper.

## Install
```bash
npm install @stack-hq/logger
```

## Usage
```ts
import { Logger } from "@stack-hq/logger";

const log = new Logger({ name: "api", level: "info", format: "json" });
log.info("server started", { port: 3000 });

const requestLog = log.child({ requestId: req.id });
requestLog.warn("slow query", { durationMs: 820 });

await log.time("db.query", () => db.users.findMany());
```

Sensitive fields (`password`, `token`, `secret`, `authorization` by default) are automatically redacted from logged objects — configure via `redactKeys`.

## License
MIT
