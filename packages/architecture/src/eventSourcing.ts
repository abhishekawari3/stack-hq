export interface DomainEvent<T = any> {
  streamId: string; // e.g. an aggregate/entity ID
  type: string;
  payload: T;
  version: number; // position within the stream
  occurredAt: number;
}

export interface EventStore {
  append(streamId: string, events: Omit<DomainEvent, "version" | "occurredAt">[], expectedVersion?: number): Promise<DomainEvent[]> | DomainEvent[];
  getStream(streamId: string): Promise<DomainEvent[]> | DomainEvent[];
}

export class ConcurrencyError extends Error {
  constructor(streamId: string, expected: number, actual: number) {
    super(`Concurrency conflict on stream "${streamId}": expected version ${expected}, actual ${actual}`);
    this.name = "ConcurrencyError";
  }
}

/**
 * In-memory event store. Every state change is captured as an immutable
 * event appended to a per-aggregate stream; current state is derived by
 * replaying events (see `Aggregate` below), never stored directly.
 */
export class InMemoryEventStore implements EventStore {
  private streams = new Map<string, DomainEvent[]>();

  append(
    streamId: string,
    events: Omit<DomainEvent, "version" | "occurredAt">[],
    expectedVersion?: number
  ): DomainEvent[] {
    const existing = this.streams.get(streamId) ?? [];

    if (expectedVersion !== undefined && existing.length !== expectedVersion) {
      throw new ConcurrencyError(streamId, expectedVersion, existing.length);
    }

    const appended: DomainEvent[] = events.map((e, i) => ({
      ...e,
      streamId,
      version: existing.length + i + 1,
      occurredAt: Date.now(),
    }));

    this.streams.set(streamId, [...existing, ...appended]);
    return appended;
  }

  getStream(streamId: string): DomainEvent[] {
    return [...(this.streams.get(streamId) ?? [])];
  }

  getAllEvents(): DomainEvent[] {
    return [...this.streams.values()].flat().sort((a, b) => a.occurredAt - b.occurredAt);
  }
}

/**
 * Base class for an event-sourced aggregate: state is rebuilt by folding
 * over its event history via `apply`. Subclasses implement `apply` to
 * mutate `this.state` for each event type, and use `raise` to record new
 * events during command handling.
 */
export abstract class Aggregate<S> {
  public version = 0;
  private pendingEvents: Omit<DomainEvent, "version" | "occurredAt" | "streamId">[] = [];

  constructor(public readonly id: string, public state: S) {}

  protected abstract apply(state: S, event: DomainEvent): S;

  /** Record a new event to be persisted, and immediately fold it into state */
  protected raise(type: string, payload: any): void {
    const fakeEvent: DomainEvent = {
      streamId: this.id,
      type,
      payload,
      version: this.version + this.pendingEvents.length + 1,
      occurredAt: Date.now(),
    };
    this.state = this.apply(this.state, fakeEvent);
    this.pendingEvents.push({ type, payload });
  }

  getUncommittedEvents() {
    return [...this.pendingEvents];
  }

  markEventsAsCommitted(): void {
    this.version += this.pendingEvents.length;
    this.pendingEvents = [];
  }

  /** Rebuild an aggregate's state by replaying its full event stream */
  static replay<S, A extends Aggregate<S>>(
    factory: (id: string) => A,
    id: string,
    events: DomainEvent[]
  ): A {
    const aggregate = factory(id);
    for (const event of events) {
      aggregate.state = (aggregate as any).apply(aggregate.state, event);
      aggregate.version = event.version;
    }
    return aggregate;
  }
}

/** A read-model projection built by folding over the event stream(s) */
export class Projection<S> {
  constructor(
    public state: S,
    private handlers: Record<string, (state: S, event: DomainEvent) => S>
  ) {}

  handle(event: DomainEvent): void {
    const handler = this.handlers[event.type];
    if (handler) this.state = handler(this.state, event);
  }

  rebuild(events: DomainEvent[]): void {
    for (const event of events) this.handle(event);
  }
}
