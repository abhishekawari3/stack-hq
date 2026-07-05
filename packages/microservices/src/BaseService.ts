import { EventEmitter } from "events";

export interface ServiceConfig {
  name: string;
  version?: string;
  port?: number;
  metadata?: Record<string, any>;
}

export type ServiceStatus = "starting" | "healthy" | "degraded" | "stopping" | "stopped";

/**
 * Base class every microservice extends. Provides a consistent
 * lifecycle (start/stop), health status, and a lightweight event bus
 * so subclasses can hook init/shutdown logic without boilerplate.
 */
export abstract class BaseService extends EventEmitter {
  public readonly name: string;
  public readonly version: string;
  public readonly port?: number;
  public readonly metadata: Record<string, any>;
  private _status: ServiceStatus = "stopped";

  constructor(config: ServiceConfig) {
    super();
    this.name = config.name;
    this.version = config.version ?? "1.0.0";
    this.port = config.port;
    this.metadata = config.metadata ?? {};
  }

  get status(): ServiceStatus {
    return this._status;
  }

  private setStatus(status: ServiceStatus) {
    this._status = status;
    this.emit("statusChange", status);
  }

  /** Subclasses implement their own startup (open DB pools, connect to broker, etc.) */
  protected abstract onStart(): Promise<void> | void;

  /** Subclasses implement graceful shutdown */
  protected abstract onStop(): Promise<void> | void;

  /** Subclasses can override for custom health logic; default just checks status */
  async healthCheck(): Promise<{ status: ServiceStatus; name: string; version: string }> {
    return { status: this._status, name: this.name, version: this.version };
  }

  async start(): Promise<void> {
    this.setStatus("starting");
    try {
      await this.onStart();
      this.setStatus("healthy");
      this.emit("started");
    } catch (err) {
      this.setStatus("degraded");
      this.emit("error", err);
      throw err;
    }
  }

  async stop(): Promise<void> {
    this.setStatus("stopping");
    await this.onStop();
    this.setStatus("stopped");
    this.emit("stopped");
  }

  describe() {
    return {
      name: this.name,
      version: this.version,
      port: this.port,
      status: this._status,
      metadata: this.metadata,
    };
  }
}
