# @stackhq/architecture

CQRS, event sourcing, and the saga pattern (orchestrated + choreographed)
for distributed consistency.

```bash
npm install @stackhq/architecture
```

## Table of contents

- [CQRS](#cqrs)
- [Event Sourcing](#event-sourcing)
- [Saga](#saga)

---

## CQRS

Separates writes (`CommandBus`) from reads (`QueryBus`) — each command/query
type maps to exactly one handler.

```ts
class CommandBus {
  register<T, R>(type: string, handler: (cmd: Command<T>) => Promise<R> | R): void;
  use(middleware: (cmd, next) => Promise<any>): void; // e.g. logging, validation
  dispatch<T, R>(command: Command<T>): Promise<R>;
}

class QueryBus {
  register<T, R>(type: string, handler: (query: Query<T>) => Promise<R> | R): void;
  execute<T, R>(query: Query<T>): Promise<R>;
}
```

### Example

```ts
import { CommandBus, QueryBus } from "@stackhq/architecture";

const commands = new CommandBus();
commands.use(async (cmd, next) => {
  console.log("dispatching", cmd.type);
  return next();
});
commands.register("createOrder", (cmd) => createOrder(cmd.payload));

const queries = new QueryBus();
queries.register("getOrderById", (q) => db.orders.findById(q.payload.id));

await commands.dispatch({ type: "createOrder", payload: { items: [...] } });
const order = await queries.execute({ type: "getOrderById", payload: { id: "o-1" } });
```

---

## Event Sourcing

State changes are captured as immutable events appended to a per-aggregate
stream; current state is derived by replaying events, never stored
directly.

```ts
class InMemoryEventStore implements EventStore {
  append(streamId, events, expectedVersion?): DomainEvent[]; // throws ConcurrencyError on version mismatch
  getStream(streamId): DomainEvent[];
  getAllEvents(): DomainEvent[];
}

abstract class Aggregate<S> {
  constructor(id: string, initialState: S);
  protected abstract apply(state: S, event: DomainEvent): S;
  protected raise(type: string, payload: any): void; // record + immediately fold a new event
  getUncommittedEvents(): DomainEvent[];
  markEventsAsCommitted(): void;
  static replay<S, A>(factory, id, events): A;
}

class Projection<S> {
  constructor(initialState: S, handlers: Record<string, (state, event) => S>);
  handle(event): void;
  rebuild(events): void;
}
```

### Example

```ts
import { InMemoryEventStore, Aggregate, Projection } from "@stackhq/architecture";

interface OrderState { status: string; total: number }

class Order extends Aggregate<OrderState> {
  protected apply(state: OrderState, event: any): OrderState {
    switch (event.type) {
      case "OrderCreated": return { status: "created", total: event.payload.total };
      case "OrderPaid": return { ...state, status: "paid" };
      default: return state;
    }
  }

  static create(id: string, total: number): Order {
    const order = new Order(id, { status: "pending", total: 0 });
    order.raise("OrderCreated", { total });
    return order;
  }

  pay() {
    this.raise("OrderPaid", {});
  }
}

const store = new InMemoryEventStore();

const order = Order.create("o-1", 99.99);
order.pay();
store.append(order.id, order.getUncommittedEvents());
order.markEventsAsCommitted();

// Rebuild from history later
const replayed = Aggregate.replay(
  (id) => new Order(id, { status: "pending", total: 0 }),
  "o-1",
  store.getStream("o-1")
);

// A read-model projection across many orders
const revenueByStatus = new Projection<Record<string, number>>({}, {
  OrderPaid: (state, event) => ({ ...state, paid: (state.paid ?? 0) + 1 }),
});
revenueByStatus.rebuild(store.getAllEvents());
```

---

## Saga

### Orchestrated (`Saga`)

Runs a sequence of steps, each with a compensating action. If any step
fails, previously completed steps are compensated in reverse order.

```ts
new Saga<C>(name: string)
  .addStep({ name, action: (ctx: C) => Promise<void> | void, compensate: (ctx: C) => Promise<void> | void }): this
  .run(context: C): Promise<{ status: "completed" | "compensated"; completedSteps: string[]; error?: any }>
```

```ts
import { Saga } from "@stackhq/architecture";

const checkoutSaga = new Saga<{ orderId: string }>("checkout")
  .addStep({ name: "reserveInventory", action: reserveInventory, compensate: releaseInventory })
  .addStep({ name: "chargeCard", action: chargeCard, compensate: refundCard })
  .addStep({ name: "createShipment", action: createShipment, compensate: cancelShipment });

const result = await checkoutSaga.run({ orderId: "o-1" });
if (result.status === "compensated") {
  console.error("Checkout failed and was rolled back:", result.error);
}
```

### Choreographed (`ChoreographedSaga`)

Services react to each other's events rather than a central orchestrator.

```ts
new ChoreographedSaga()
  .on(event: string, handler: (payload) => Promise<void> | void): this
  .emit(event: string, payload: any): Promise<void>
```

```ts
import { ChoreographedSaga } from "@stackhq/architecture";

const saga = new ChoreographedSaga()
  .on("OrderCreated", async (payload) => {
    await reserveInventory(payload);
    await saga.emit("InventoryReserved", payload);
  })
  .on("InventoryReserved", async (payload) => {
    await chargeCard(payload);
  });

await saga.emit("OrderCreated", { orderId: "o-1" });
```