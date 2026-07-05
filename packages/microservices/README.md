# @stack-hq/microservices

Base service lifecycle class, in-memory service discovery with heartbeats, an HTTP inter-service client resolved through the registry, and a ready-to-adapt Docker Compose template.

## Install
```bash
npm install @stack-hq/microservices
```

## Usage
```ts
import { BaseService, ServiceRegistry, ServiceClient } from "@stack-hq/microservices";

class UserService extends BaseService {
  protected async onStart() { /* connect to DB, etc. */ }
  protected async onStop() { /* close connections */ }
}

const registry = new ServiceRegistry();
registry.register("user-service", { host: "10.0.0.2", port: 3002 });

const client = new ServiceClient(registry);
const user = await client.call("user-service", "/users/1");
```

`docker-compose.template.yml` (in the package root) wires up an API gateway, auth/user services, RabbitMQ, Redis, Postgres, and Prometheus — copy and adapt it.

## License
MIT
