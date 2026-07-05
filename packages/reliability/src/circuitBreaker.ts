export type CircuitState = "CLOSED" | "OPEN" | "HALF_OPEN";

export interface CircuitBreakerConfig {
  failureThreshold?: number; // consecutive/rolling failures before opening
  successThreshold?: number; // successes needed in HALF_OPEN to close
  resetTimeoutMs?: number; // how long to stay OPEN before trying HALF_OPEN
  rollingWindowSize?: number; // number of recent calls considered for the failure rate
  failureRateThreshold?: number; // 0-1, fraction of failures in the window that trips the breaker
}

export class CircuitBreakerOpenError extends Error {
  constructor(serviceName: string) {
    super(`Circuit breaker is OPEN for "${serviceName}" — call rejected fast`);
    this.name = "CircuitBreakerOpenError";
  }
}

/**
 * Classic circuit breaker: CLOSED (normal) -> OPEN (failing fast) -> HALF_OPEN
 * (trial requests) -> CLOSED or back to OPEN.
 */
export class CircuitBreaker {
  private state: CircuitState = "CLOSED";
  private consecutiveFailures = 0;
  private consecutiveSuccesses = 0;
  private openedAt = 0;
  private rollingResults: boolean[] = []; // true = success, false = failure

  private failureThreshold: number;
  private successThreshold: number;
  private resetTimeoutMs: number;
  private rollingWindowSize: number;
  private failureRateThreshold: number;

  constructor(private name: string, config: CircuitBreakerConfig = {}) {
    this.failureThreshold = config.failureThreshold ?? 5;
    this.successThreshold = config.successThreshold ?? 2;
    this.resetTimeoutMs = config.resetTimeoutMs ?? 30_000;
    this.rollingWindowSize = config.rollingWindowSize ?? 20;
    this.failureRateThreshold = config.failureRateThreshold ?? 0.5;
  }

  getState(): CircuitState {
    if (this.state === "OPEN" && Date.now() - this.openedAt >= this.resetTimeoutMs) {
      this.state = "HALF_OPEN";
      this.consecutiveSuccesses = 0;
    }
    return this.state;
  }

  /** Wrap any async call with breaker protection */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    const state = this.getState();
    if (state === "OPEN") {
      throw new CircuitBreakerOpenError(this.name);
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (err) {
      this.onFailure();
      throw err;
    }
  }

  private recordRolling(success: boolean) {
    this.rollingResults.push(success);
    if (this.rollingResults.length > this.rollingWindowSize) this.rollingResults.shift();
  }

  private onSuccess(): void {
    this.recordRolling(true);
    this.consecutiveFailures = 0;

    if (this.state === "HALF_OPEN") {
      this.consecutiveSuccesses++;
      if (this.consecutiveSuccesses >= this.successThreshold) {
        this.state = "CLOSED";
        this.rollingResults = [];
      }
    }
  }

  private onFailure(): void {
    this.recordRolling(false);
    this.consecutiveFailures++;

    if (this.state === "HALF_OPEN") {
      this.trip();
      return;
    }

    const failureRate =
      this.rollingResults.length > 0
        ? this.rollingResults.filter((r) => !r).length / this.rollingResults.length
        : 0;

    if (
      this.consecutiveFailures >= this.failureThreshold ||
      (this.rollingResults.length >= this.rollingWindowSize && failureRate >= this.failureRateThreshold)
    ) {
      this.trip();
    }
  }

  private trip(): void {
    this.state = "OPEN";
    this.openedAt = Date.now();
    this.consecutiveSuccesses = 0;
  }

  reset(): void {
    this.state = "CLOSED";
    this.consecutiveFailures = 0;
    this.consecutiveSuccesses = 0;
    this.rollingResults = [];
  }

  getStats() {
    return {
      name: this.name,
      state: this.getState(),
      consecutiveFailures: this.consecutiveFailures,
      rollingWindow: [...this.rollingResults],
    };
  }
}
