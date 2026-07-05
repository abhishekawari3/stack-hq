# @stackhq/messaging

In-memory message queue (delayed delivery, retries, dead-letter queue) and
topic-based pub/sub for fan-out event delivery.

```bash
npm install @stackhq/messaging
```

## Table of contents

- [MessageQueue](#messagequeue)
- [PubSub](#pubsub)

---

## MessageQueue

Point-to-point FIFO queue: each message is delivered to exactly one
consumer. Supports delayed delivery, automatic retry with backoff on
handler failure, and a dead-letter queue for messages that exhaust retries.

```ts
new MessageQueue<T>(name: string, config?: QueueConfig)
```

```ts
interface QueueConfig {
  maxRetries?: number; // default: 3
  retryDelayMs?: number; // default: 1000 (multiplied by attempt number)
  visibilityTimeoutMs?: number; // default: 30000 — how long a dequeued message is hidden before auto-returning
}
```

| Method                              | Description                                                        |
| ----------------------------------- | ------------------------------------------------------------------ |
| `enqueue(payload, delayMs?)`        | Add a message, optionally delayed                                  |
| `dequeue()`                         | Pull the next available message, marking it in-flight              |
| `ack(messageId)`                    | Confirm successful processing                                      |
| `nack(messageId)`                   | Signal failure; message is retried (with backoff) or dead-lettered |
| `consume(handler, pollIntervalMs?)` | Continuously process messages; returns a stop function             |
| `getDeadLetterQueue()`              | Messages that exhausted their retries                              |
| `stats()`                           | `{ name, pending, inFlight, deadLettered }`                        |

### Example

```ts
import { MessageQueue } from "@stackhq/messaging";

const queue = new MessageQueue<{ orderId: string }>("orders", {
  maxRetries: 3,
  retryDelayMs: 500,
});

queue.enqueue({ orderId: "o-1" });
queue.enqueue({ orderId: "o-2" }, 5000); // deliver after 5s

const stop = queue.consume(async (msg) => {
  await processOrder(msg.payload); // throwing here triggers automatic retry
});

// later
stop();
console.log(queue.stats());
console.log(queue.getDeadLetterQueue()); // inspect failed messages
```

---

## PubSub

Topic-based publish/subscribe: every subscriber to a topic receives every
message (fan-out), unlike `MessageQueue`'s point-to-point delivery.

```ts
new PubSub();
```

| Method                         | Description                                                         |
| ------------------------------ | ------------------------------------------------------------------- |
| `subscribe<T>(topic, handler)` | Subscribe; returns an unsubscribe function                          |
| `publish<T>(topic, payload)`   | Publish to all current subscribers of a topic (awaits all handlers) |
| `topicSubscriberCount(topic)`  | Number of active subscribers                                        |

### Example

```ts
import { PubSub } from "@stackhq/messaging";

const pubsub = new PubSub();

const unsubscribe = pubsub.subscribe("order.created", (msg) =>
  sendConfirmationEmail(msg.payload),
);
pubsub.subscribe("order.created", (msg) => updateAnalytics(msg.payload));

await pubsub.publish("order.created", { orderId: "o-1" }); // both handlers run

unsubscribe(); // stop the email handler from firing on future publishes
```
