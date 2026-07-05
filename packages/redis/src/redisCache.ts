import { RedisClientLike } from "./client";

export interface RedisCacheConfig {
  keyPrefix?: string;
  defaultTtlSeconds?: number;
}

/**
 * A distributed cache backed by Redis — same ergonomics as an in-memory
 * cache (get/set/getOrSet), but shared across every instance of your app.
 */
export class RedisCache {
  private prefix: string;
  private defaultTtl?: number;

  constructor(private client: RedisClientLike, config: RedisCacheConfig = {}) {
    this.prefix = config.keyPrefix ?? "cache:";
    this.defaultTtl = config.defaultTtlSeconds;
  }

  private k(key: string): string {
    return `${this.prefix}${key}`;
  }

  async get<T = any>(key: string): Promise<T | undefined> {
    const raw = await this.client.get(this.k(key));
    if (raw === null) return undefined;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return raw as unknown as T;
    }
  }

  async set(key: string, value: any, ttlSeconds?: number): Promise<void> {
    const serialized = typeof value === "string" ? value : JSON.stringify(value);
    const ttl = ttlSeconds ?? this.defaultTtl;
    if (ttl) {
      await this.client.set(this.k(key), serialized, "EX", ttl);
    } else {
      await this.client.set(this.k(key), serialized);
    }
  }

  async delete(key: string): Promise<void> {
    await this.client.del(this.k(key));
  }

  async getOrSet<T = any>(key: string, factory: () => Promise<T> | T, ttlSeconds?: number): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== undefined) return cached;
    const value = await factory();
    await this.set(key, value, ttlSeconds);
    return value;
  }
}
