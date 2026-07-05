# @stack-hq/architecture

CQRS (command/query buses), event sourcing (event store, aggregates, projections), and the saga pattern (orchestrated + choreographed, with compensation) for distributed consistency.

## Install
```bash
npm install @stack-hq/architecture
```

## Usage
```ts
import { CommandBus, InMemoryEventStore, Saga } from "@stack-hq/architecture";

const commands = new CommandBus();
commands.register("createOrder", (cmd) => createOrder(cmd.payload));

const eventStore = new InMemoryEventStore();
eventStore.append("order-1", [{ streamId: "order-1", type: "OrderCreated", payload: {} }]);

const checkoutSaga = new Saga("checkout")
  .addStep({ name: "reserveInventory", action: reserve, compensate: releaseInventory })
  .addStep({ name: "chargeCard", action: charge, compensate: refund });

await checkoutSaga.run({ orderId: "o-1" });
```

## License
MIT
