import { ServiceRegistry } from "./serviceDiscovery";

export interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  headers?: Record<string, string>;
  body?: any;
  timeoutMs?: number;
}

/**
 * HTTP-based inter-service client that resolves target hosts through the
 * ServiceRegistry (so callers never hardcode host:port) and layers on
 * timeouts + basic error normalization. Combine with the reliability
 * module's CircuitBreaker/Retry for resilient service-to-service calls.
 */
export class ServiceClient {
  constructor(private registry: ServiceRegistry) {}

  private async resolveBaseUrl(serviceName: string): Promise<string> {
    const instance = this.registry.discoverOne(serviceName);
    if (!instance) throw new Error(`No healthy instance found for service "${serviceName}"`);
    return `http://${instance.host}:${instance.port}`;
  }

  async call<T = any>(serviceName: string, path: string, options: RequestOptions = {}): Promise<T> {
    const baseUrl = await this.resolveBaseUrl(serviceName);
    const url = `${baseUrl}${path.startsWith("/") ? path : `/${path}`}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 5000);

    try {
      const res = await fetch(url, {
        method: options.method ?? "GET",
        headers: { "Content-Type": "application/json", ...options.headers },
        body: options.body ? JSON.stringify(options.body) : undefined,
        signal: controller.signal,
      });

      if (!res.ok) {
        throw new Error(`Service call to ${serviceName}${path} failed: ${res.status} ${await res.text()}`);
      }
      const contentType = res.headers.get("content-type") ?? "";
      return (contentType.includes("application/json") ? await res.json() : ((await res.text()) as any)) as T;
    } finally {
      clearTimeout(timeout);
    }
  }
}

/** Simple in-process pub/sub for event-driven communication between local service instances */
export class LocalEventBus {
  private handlers = new Map<string, Array<(payload: any) => void>>();

  on(event: string, handler: (payload: any) => void): () => void {
    const list = this.handlers.get(event) ?? [];
    list.push(handler);
    this.handlers.set(event, list);
    return () => {
      this.handlers.set(
        event,
        (this.handlers.get(event) ?? []).filter((h) => h !== handler)
      );
    };
  }

  emit(event: string, payload: any): void {
    for (const handler of this.handlers.get(event) ?? []) {
      handler(payload);
    }
  }
}
