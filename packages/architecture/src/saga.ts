export interface SagaStep<C = any> {
  name: string;
  action: (context: C) => Promise<void> | void;
  compensate: (context: C) => Promise<void> | void;
}

export type SagaStatus = "pending" | "completed" | "compensated" | "failed";

export interface SagaResult {
  status: SagaStatus;
  completedSteps: string[];
  error?: any;
}

/**
 * Orchestration-style Saga: runs a sequence of steps, each with a
 * compensating action. If any step fails, previously completed steps
 * are compensated (undone) in reverse order — the classic pattern for
 * maintaining consistency across a distributed transaction that spans
 * multiple services/databases without a 2PC.
 */
export class Saga<C = any> {
  private steps: SagaStep<C>[] = [];

  constructor(private name: string) {}

  addStep(step: SagaStep<C>): this {
    this.steps.push(step);
    return this;
  }

  async run(context: C): Promise<SagaResult> {
    const completed: SagaStep<C>[] = [];

    for (const step of this.steps) {
      try {
        await step.action(context);
        completed.push(step);
      } catch (error) {
        await this.compensate(completed, context);
        return {
          status: "compensated",
          completedSteps: completed.map((s) => s.name),
          error,
        };
      }
    }

    return { status: "completed", completedSteps: completed.map((s) => s.name) };
  }

  private async compensate(completedSteps: SagaStep<C>[], context: C): Promise<void> {
    for (const step of [...completedSteps].reverse()) {
      try {
        await step.compensate(context);
      } catch (compensationError) {
        // Compensation failures are logged, not thrown — a saga's job is
        // to attempt best-effort rollback; surface this to your ops/alerting.
        console.error(
          `[Saga:${this.name}] Compensation failed for step "${step.name}":`,
          compensationError
        );
      }
    }
  }
}

/**
 * Choreography-style saga helper: services react to each other's events
 * rather than a central orchestrator. Register event handlers that each
 * emit the next event, and failure handlers that emit compensating events.
 */
export class ChoreographedSaga {
  private handlers = new Map<string, Array<(payload: any) => Promise<void> | void>>();

  on(event: string, handler: (payload: any) => Promise<void> | void): this {
    const list = this.handlers.get(event) ?? [];
    list.push(handler);
    this.handlers.set(event, list);
    return this;
  }

  async emit(event: string, payload: any): Promise<void> {
    const handlers = this.handlers.get(event) ?? [];
    for (const handler of handlers) {
      await handler(payload);
    }
  }
}
