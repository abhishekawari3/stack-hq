import { RedisClientLike } from "./client";

export interface RedisSessionRecord {
  id: string;
  data: Record<string, any>;
  createdAt: number;
  expiresAt: number;
}

/**
 * Redis-backed session store. Matches the `SessionStore` interface
 * shape expected by `@stackhq/auth`'s SessionManager (get/set/delete),
 * so it can be passed straight in as a drop-in replacement for the
 * default in-memory store when running multiple app instances.
 */
export class RedisSessionStore {
  private prefix: string;

  constructor(private client: RedisClientLike, keyPrefix = "session:") {
    this.prefix = keyPrefix;
  }

  private k(id: string): string {
    return `${this.prefix}${id}`;
  }

  async get(id: string): Promise<RedisSessionRecord | null> {
    const raw = await this.client.get(this.k(id));
    if (!raw) return null;
    return JSON.parse(raw) as RedisSessionRecord;
  }

  async set(id: string, record: RedisSessionRecord): Promise<void> {
    const ttlSeconds = Math.max(1, Math.ceil((record.expiresAt - Date.now()) / 1000));
    await this.client.set(this.k(id), JSON.stringify(record), "EX", ttlSeconds);
  }

  async delete(id: string): Promise<void> {
    await this.client.del(this.k(id));
  }
}
