# @stack-hq/messaging

In-memory message queue (delayed delivery, retries, dead-letter queue) and topic-based pub/sub for fan-out event delivery.

## Install
```bash
npm install @stack-hq/messaging
```

## Usage
```ts
import { MessageQueue, PubSub } from "@stack-hq/messaging";

const queue = new MessageQueue<{ orderId: string }>("orders", { maxRetries: 3 });
queue.enqueue({ orderId: "o-1" });
queue.consume(async (msg) => processOrder(msg.payload));

const pubsub = new PubSub();
pubsub.subscribe("order.created", (msg) => sendConfirmationEmail(msg.payload));
await pubsub.publish("order.created", { orderId: "o-1" });
```

## License
MIT
