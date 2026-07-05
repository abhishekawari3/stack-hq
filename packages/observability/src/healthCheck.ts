export type CheckStatus = "up" | "down" | "degraded";

export interface CheckResult {
  name: string;
  status: CheckStatus;
  durationMs: number;
  details?: any;
  error?: string;
}

export type HealthCheckFn = () => Promise<{ status: CheckStatus; details?: any }> | { status: CheckStatus; details?: any };

export interface OverallHealth {
  status: CheckStatus;
  checks: CheckResult[];
  timestamp: number;
}

/**
 * Aggregates multiple named health checks (DB connection, cache, message
 * broker, downstream services, disk space, etc.) into a single overall
 * status, suitable for a `/health` or `/readiness` endpoint.
 */
export class HealthCheckRegistry {
  private checks = new Map<string, HealthCheckFn>();

  register(name: string, check: HealthCheckFn): void {
    this.checks.set(name, check);
  }

  unregister(name: string): void {
    this.checks.delete(name);
  }

  async runAll(timeoutMs = 5000): Promise<OverallHealth> {
    const results: CheckResult[] = await Promise.all(
      [...this.checks.entries()].map(async ([name, check]) => {
        const start = Date.now();
        try {
          const result = await Promise.race([
            Promise.resolve(check()),
            new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error("Health check timed out")), timeoutMs)
            ),
          ]);
          return {
            name,
            status: result.status,
            durationMs: Date.now() - start,
            details: result.details,
          };
        } catch (err: any) {
          return {
            name,
            status: "down" as CheckStatus,
            durationMs: Date.now() - start,
            error: err.message,
          };
        }
      })
    );

    const overallStatus: CheckStatus = results.some((r) => r.status === "down")
      ? "down"
      : results.some((r) => r.status === "degraded")
      ? "degraded"
      : "up";

    return { status: overallStatus, checks: results, timestamp: Date.now() };
  }

  /** Express-style handler for a health endpoint */
  handler(timeoutMs?: number) {
    return async (_req: any, res: any) => {
      const health = await this.runAll(timeoutMs);
      const httpStatus = health.status === "up" ? 200 : health.status === "degraded" ? 200 : 503;
      res.status(httpStatus).json(health);
    };
  }
}
