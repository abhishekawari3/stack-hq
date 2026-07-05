# @stack-hq/scaling

Load balancer with 4 selection algorithms (round-robin, weighted round-robin, least-connections, random) and a consistent-hash ring for stable key-to-node distribution.

## Install
```bash
npm install @stack-hq/scaling
```

## Usage
```ts
import { LoadBalancer, ConsistentHashRing } from "@stack-hq/scaling";

const lb = new LoadBalancer(
  [{ id: "a", host: "10.0.0.1", port: 3000 }, { id: "b", host: "10.0.0.2", port: 3000 }],
  "least-connections"
);
const backend = lb.next();

const ring = new ConsistentHashRing(["cache-1", "cache-2", "cache-3"]);
const shard = ring.getNode("user:42"); // stable across node additions/removals
```

## License
MIT
