export interface Backend {
  id: string;
  host: string;
  port: number;
  weight?: number; // used by weighted round-robin
  activeConnections?: number; // used by least-connections
}

export type LoadBalancingAlgorithm =
  | "round-robin"
  | "weighted-round-robin"
  | "least-connections"
  | "random";

/**
 * Load balancer supporting 4 selection algorithms:
 *  - round-robin
 *  - weighted-round-robin
 *  - least-connections
 *  - random
 */
export class LoadBalancer {
  private backends: Backend[];
  private algorithm: LoadBalancingAlgorithm;
  private rrIndex = 0;
  private weightedCursor = 0;

  constructor(backends: Backend[], algorithm: LoadBalancingAlgorithm = "round-robin") {
    if (backends.length === 0) throw new Error("LoadBalancer requires at least one backend");
    this.backends = backends.map((b) => ({ activeConnections: 0, weight: 1, ...b }));
    this.algorithm = algorithm;
  }

  addBackend(backend: Backend): void {
    this.backends.push({ activeConnections: 0, weight: 1, ...backend });
  }

  removeBackend(id: string): void {
    this.backends = this.backends.filter((b) => b.id !== id);
  }

  setAlgorithm(algorithm: LoadBalancingAlgorithm): void {
    this.algorithm = algorithm;
  }

  /** Select the next backend to route a request to */
  next(): Backend {
    switch (this.algorithm) {
      case "round-robin":
        return this.roundRobin();
      case "weighted-round-robin":
        return this.weightedRoundRobin();
      case "least-connections":
        return this.leastConnections();
      case "random":
        return this.random();
      default:
        throw new Error(`Unknown algorithm: ${this.algorithm}`);
    }
  }

  /** Call when a request to `backend` completes, to keep least-connections accurate */
  release(backendId: string): void {
    const backend = this.backends.find((b) => b.id === backendId);
    if (backend && backend.activeConnections! > 0) backend.activeConnections!--;
  }

  private roundRobin(): Backend {
    const backend = this.backends[this.rrIndex % this.backends.length];
    this.rrIndex++;
    return backend;
  }

  private weightedRoundRobin(): Backend {
    // Expand into a weighted sequence and cycle through it (simple + deterministic)
    const expanded: Backend[] = [];
    for (const b of this.backends) {
      for (let i = 0; i < (b.weight ?? 1); i++) expanded.push(b);
    }
    const backend = expanded[this.weightedCursor % expanded.length];
    this.weightedCursor++;
    return backend;
  }

  private leastConnections(): Backend {
    let chosen = this.backends[0];
    for (const b of this.backends) {
      if ((b.activeConnections ?? 0) < (chosen.activeConnections ?? 0)) chosen = b;
    }
    chosen.activeConnections = (chosen.activeConnections ?? 0) + 1;
    return chosen;
  }

  private random(): Backend {
    return this.backends[Math.floor(Math.random() * this.backends.length)];
  }

  listBackends(): Backend[] {
    return [...this.backends];
  }
}
