import { v4 as uuidv4 } from "uuid";

export interface Message<T = any> {
  id: string;
  payload: T;
  attempts: number;
  createdAt: number;
  availableAt: number; // supports delayed delivery
}

export type MessageHandler<T = any> = (message: Message<T>) => Promise<void> | void;

export interface QueueConfig {
  maxRetries?: number;
  retryDelayMs?: number;
  visibilityTimeoutMs?: number; // how long a message is hidden while being processed
}

/**
 * In-memory FIFO message queue with delayed delivery, retry-with-backoff
 * on handler failure, and a dead-letter queue for messages that exhaust
 * their retries. Swap the internals for SQS/RabbitMQ/Kafka in production
 * while keeping this same interface.
 */
export class MessageQueue<T = any> {
  private queue: Message<T>[] = [];
  private inFlight = new Map<string, Message<T>>();
  private deadLetterQueue: Message<T>[] = [];
  private maxRetries: number;
  private retryDelayMs: number;
  private visibilityTimeoutMs: number;

  constructor(private name: string, config: QueueConfig = {}) {
    this.maxRetries = config.maxRetries ?? 3;
    this.retryDelayMs = config.retryDelayMs ?? 1000;
    this.visibilityTimeoutMs = config.visibilityTimeoutMs ?? 30_000;
  }

  enqueue(payload: T, delayMs = 0): Message<T> {
    const now = Date.now();
    const message: Message<T> = {
      id: uuidv4(),
      payload,
      attempts: 0,
      createdAt: now,
      availableAt: now + delayMs,
    };
    this.queue.push(message);
    return message;
  }

  /** Pull the next available message (respecting delay), marking it in-flight */
  dequeue(): Message<T> | undefined {
    const now = Date.now();
    const idx = this.queue.findIndex((m) => m.availableAt <= now);
    if (idx === -1) return undefined;

    const [message] = this.queue.splice(idx, 1);
    this.inFlight.set(message.id, message);

    // Auto-return to queue if not acknowledged within the visibility timeout
    setTimeout(() => {
      if (this.inFlight.has(message.id)) {
        this.inFlight.delete(message.id);
        this.queue.push(message);
      }
    }, this.visibilityTimeoutMs);

    return message;
  }

  ack(messageId: string): void {
    this.inFlight.delete(messageId);
  }

  nack(messageId: string): void {
    const message = this.inFlight.get(messageId);
    if (!message) return;
    this.inFlight.delete(messageId);

    message.attempts++;
    if (message.attempts > this.maxRetries) {
      this.deadLetterQueue.push(message);
      return;
    }
    message.availableAt = Date.now() + this.retryDelayMs * message.attempts;
    this.queue.push(message);
  }

  /** Continuously process messages with the given handler (call stop() to end) */
  consume(handler: MessageHandler<T>, pollIntervalMs = 100): () => void {
    let stopped = false;
    const loop = async () => {
      if (stopped) return;
      const message = this.dequeue();
      if (message) {
        try {
          await handler(message);
          this.ack(message.id);
        } catch {
          this.nack(message.id);
        }
      }
      setTimeout(loop, pollIntervalMs);
    };
    loop();
    return () => {
      stopped = true;
    };
  }

  getDeadLetterQueue(): Message<T>[] {
    return [...this.deadLetterQueue];
  }

  stats() {
    return {
      name: this.name,
      pending: this.queue.length,
      inFlight: this.inFlight.size,
      deadLettered: this.deadLetterQueue.length,
    };
  }
}

/**
 * Topic-based publish/subscribe. Multiple subscribers per topic all
 * receive every message (fan-out), unlike the point-to-point MessageQueue.
 */
export class PubSub {
  private topics = new Map<string, Set<MessageHandler>>();

  subscribe<T = any>(topic: string, handler: MessageHandler<T>): () => void {
    const set = this.topics.get(topic) ?? new Set();
    set.add(handler as MessageHandler);
    this.topics.set(topic, set);
    return () => set.delete(handler as MessageHandler);
  }

  async publish<T = any>(topic: string, payload: T): Promise<void> {
    const handlers = this.topics.get(topic);
    if (!handlers || handlers.size === 0) return;

    const message: Message<T> = {
      id: uuidv4(),
      payload,
      attempts: 0,
      createdAt: Date.now(),
      availableAt: Date.now(),
    };

    await Promise.all([...handlers].map((h) => h(message)));
  }

  topicSubscriberCount(topic: string): number {
    return this.topics.get(topic)?.size ?? 0;
  }
}
