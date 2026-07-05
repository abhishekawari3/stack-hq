export interface ServiceInstance {
  id: string;
  serviceName: string;
  host: string;
  port: number;
  metadata?: Record<string, any>;
  lastHeartbeat: number;
  healthy: boolean;
}

export interface RegisterOptions {
  host: string;
  port: number;
  metadata?: Record<string, any>;
}

/**
 * In-memory service registry (a lightweight Consul/Eureka substitute).
 * Services register themselves and send periodic heartbeats; instances
 * that go stale are automatically considered unhealthy and pruned.
 */
export class ServiceRegistry {
  private instances = new Map<string, ServiceInstance>();
  private heartbeatTimeoutMs: number;

  constructor(heartbeatTimeoutMs = 15_000) {
    this.heartbeatTimeoutMs = heartbeatTimeoutMs;
  }

  register(serviceName: string, options: RegisterOptions): ServiceInstance {
    const id = `${serviceName}-${options.host}-${options.port}-${Date.now()}`;
    const instance: ServiceInstance = {
      id,
      serviceName,
      host: options.host,
      port: options.port,
      metadata: options.metadata ?? {},
      lastHeartbeat: Date.now(),
      healthy: true,
    };
    this.instances.set(id, instance);
    return instance;
  }

  deregister(instanceId: string): void {
    this.instances.delete(instanceId);
  }

  heartbeat(instanceId: string): void {
    const inst = this.instances.get(instanceId);
    if (inst) {
      inst.lastHeartbeat = Date.now();
      inst.healthy = true;
    }
  }

  /** Get all currently-healthy instances of a named service */
  discover(serviceName: string): ServiceInstance[] {
    this.pruneStale();
    return [...this.instances.values()].filter(
      (i) => i.serviceName === serviceName && i.healthy
    );
  }

  /** Pick one healthy instance (random) — useful for simple client-side discovery */
  discoverOne(serviceName: string): ServiceInstance | undefined {
    const candidates = this.discover(serviceName);
    if (candidates.length === 0) return undefined;
    return candidates[Math.floor(Math.random() * candidates.length)];
  }

  listAll(): ServiceInstance[] {
    this.pruneStale();
    return [...this.instances.values()];
  }

  private pruneStale(): void {
    const now = Date.now();
    for (const inst of this.instances.values()) {
      if (now - inst.lastHeartbeat > this.heartbeatTimeoutMs) {
        inst.healthy = false;
      }
    }
  }
}
