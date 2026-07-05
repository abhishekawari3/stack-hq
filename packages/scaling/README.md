# @stackhq/scaling

Load balancer with 4 selection algorithms and a consistent-hash ring for
stable key-to-node distribution.

```bash
npm install @stackhq/scaling
```

## Table of contents

- [LoadBalancer](#loadbalancer)
- [ConsistentHashRing](#consistenthashring)

---

## LoadBalancer

```ts
new LoadBalancer(backends: Backend[], algorithm?: LoadBalancingAlgorithm)
```

```ts
interface Backend {
  id: string;
  host: string;
  port: number;
  weight?: number; // used by "weighted-round-robin"
  activeConnections?: number; // used by "least-connections"
}

type LoadBalancingAlgorithm =
  | "round-robin"
  | "weighted-round-robin"
  | "least-connections"
  | "random";
```

| Method                    | Description                                                                                  |
| ------------------------- | -------------------------------------------------------------------------------------------- |
| `next()`                  | Select the next backend per the configured algorithm                                         |
| `addBackend(backend)`     | Add a backend to the pool                                                                    |
| `removeBackend(id)`       | Remove a backend                                                                             |
| `setAlgorithm(algorithm)` | Switch algorithms at runtime                                                                 |
| `release(backendId)`      | Notify the balancer a request to this backend completed (keeps `least-connections` accurate) |
| `listBackends()`          | Current backend pool                                                                         |

### Algorithm behavior

- **round-robin**: cycles through backends in order.
- **weighted-round-robin**: backends with higher `weight` are selected proportionally more often.
- **least-connections**: always picks the backend with the fewest currently-active connections (call `release()` when a request finishes).
- **random**: picks uniformly at random.

### Example

```ts
import { LoadBalancer } from "@stackhq/scaling";

const lb = new LoadBalancer(
  [
    { id: "a", host: "10.0.0.1", port: 3000, weight: 2 },
    { id: "b", host: "10.0.0.2", port: 3000, weight: 1 },
  ],
  "weighted-round-robin",
);

const backend = lb.next();
// ... proxy the request to backend.host:backend.port ...
lb.release(backend.id); // if using "least-connections"
```

---

## ConsistentHashRing

Distributes keys across a changing set of nodes with minimal remapping when
nodes are added/removed — for sharded caches, partitioned databases, or
sticky routing.

```ts
new ConsistentHashRing(nodes?: string[], virtualNodes?: number) // default: 150 virtual nodes per physical node
```

| Method                 | Description                                                  |
| ---------------------- | ------------------------------------------------------------ |
| `addNode(node)`        | Add a physical node to the ring                              |
| `removeNode(node)`     | Remove a physical node                                       |
| `getNode(key)`         | Which node a key maps to                                     |
| `getNodes(key, count)` | The `count` distinct nodes responsible for replicas of a key |
| `listNodes()`          | All physical nodes currently on the ring                     |

### Example

```ts
import { ConsistentHashRing } from "@stackhq/scaling";

const ring = new ConsistentHashRing(["cache-1", "cache-2", "cache-3"]);

const shard = ring.getNode("user:42"); // e.g. "cache-2" — stable across ring changes
const replicas = ring.getNodes("user:42", 2); // e.g. ["cache-2", "cache-3"]

ring.addNode("cache-4"); // only ~1/4 of keys remap, not all of them
```
