# @stackhq/microservices

Base service lifecycle class, in-memory service discovery with heartbeats,
an HTTP inter-service client resolved through the registry, and a ready-to-
adapt Docker Compose template.

```bash
npm install @stackhq/microservices
```

## Table of contents

- [BaseService](#baseservice)
- [ServiceRegistry](#serviceregistry)
- [ServiceClient / LocalEventBus](#serviceclient--localeventbus)
- [Docker Compose template](#docker-compose-template)

---

## BaseService

Abstract base class giving every microservice a consistent lifecycle
(`start`/`stop`), health status, and event emitter.

```ts
abstract class BaseService extends EventEmitter {
  constructor(config: {
    name: string;
    version?: string;
    port?: number;
    metadata?: object;
  });

  readonly status: "starting" | "healthy" | "degraded" | "stopping" | "stopped";

  protected abstract onStart(): Promise<void> | void;
  protected abstract onStop(): Promise<void> | void;

  healthCheck(): Promise<{ status; name; version }>;
  start(): Promise<void>;
  stop(): Promise<void>;
  describe(): { name; version; port; status; metadata };
}
```

Emits `"statusChange"`, `"started"`, `"stopped"`, and `"error"` events.

### Example

```ts
import { BaseService } from "@stackhq/microservices";

class UserService extends BaseService {
  private db!: DbConnection;

  constructor() {
    super({ name: "user-service", version: "1.2.0", port: 3002 });
  }

  protected async onStart() {
    this.db = await connectToDatabase();
  }

  protected async onStop() {
    await this.db.close();
  }
}

const service = new UserService();
service.on("statusChange", (status) =>
  console.log(`user-service is now ${status}`),
);
await service.start();
```

---

## ServiceRegistry

In-memory service registry (a lightweight Consul/Eureka substitute).
Services register on startup and send periodic heartbeats; instances that
go stale (no heartbeat within the timeout) are marked unhealthy.

```ts
new ServiceRegistry(heartbeatTimeoutMs?: number) // default: 15000
```

| Method                                             | Description                                                  |
| -------------------------------------------------- | ------------------------------------------------------------ |
| `register(serviceName, { host, port, metadata? })` | Register an instance, returns a `ServiceInstance` with `.id` |
| `deregister(instanceId)`                           | Remove an instance                                           |
| `heartbeat(instanceId)`                            | Mark an instance as alive                                    |
| `discover(serviceName)`                            | All currently-healthy instances of a service                 |
| `discoverOne(serviceName)`                         | One random healthy instance (or `undefined`)                 |
| `listAll()`                                        | Every registered instance, healthy or not                    |

### Example

```ts
import { ServiceRegistry } from "@stackhq/microservices";

const registry = new ServiceRegistry();
const instance = registry.register("user-service", {
  host: "10.0.0.2",
  port: 3002,
});

setInterval(() => registry.heartbeat(instance.id), 5000);

const target = registry.discoverOne("user-service");
```

---

## ServiceClient / LocalEventBus

`ServiceClient` calls other services over HTTP, resolving the target host
through the `ServiceRegistry` so callers never hardcode `host:port`.
`LocalEventBus` is a simple in-process pub/sub for same-instance event
communication.

```ts
new ServiceClient(registry: ServiceRegistry)
  .call<T>(serviceName, path, options?: { method?; headers?; body?; timeoutMs? }): Promise<T>
```

### Example

```ts
import { ServiceRegistry, ServiceClient } from "@stackhq/microservices";

const client = new ServiceClient(registry);
const user = await client.call("user-service", "/users/1", { timeoutMs: 3000 });
const created = await client.call("user-service", "/users", {
  method: "POST",
  body: { name: "Alice" },
});
```

> Wrap `ServiceClient.call` with `@stackhq/reliability`'s `CircuitBreaker`
> and `retry` for resilient inter-service calls.

---

## Docker Compose template

The package ships `docker-compose.template.yml` in its root — a starter
wiring up an API gateway, auth/user services, RabbitMQ, Redis, Postgres,
and Prometheus. Copy it into your project root and adjust service names,
images, and ports to match your actual services.
