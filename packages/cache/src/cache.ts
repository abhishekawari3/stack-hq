interface CacheEntry<V> {
  value: V;
  expiresAt?: number;
  frequency: number; // used by LFU
}

export type EvictionPolicy = "LRU" | "LFU" | "TTL";

export interface CacheConfig {
  maxSize?: number;
  defaultTtlMs?: number;
  policy?: EvictionPolicy;
}

/**
 * In-memory cache supporting three eviction strategies:
 *  - LRU  (least recently used)
 *  - LFU  (least frequently used)
 *  - TTL  (pure time-based expiry, no size-based eviction beyond capacity)
 *
 * Uses a Map for O(1) get/set; Map iteration order = insertion order,
 * which is (ab)used for LRU recency tracking (re-insert on access).
 */
export class Cache<K = string, V = any> {
  private store = new Map<K, CacheEntry<V>>();
  private maxSize: number;
  private defaultTtlMs?: number;
  private policy: EvictionPolicy;

  constructor(config: CacheConfig = {}) {
    this.maxSize = config.maxSize ?? 1000;
    this.defaultTtlMs = config.defaultTtlMs;
    this.policy = config.policy ?? "LRU";
  }

  set(key: K, value: V, ttlMs?: number): void {
    this.purgeExpired();

    if (this.store.has(key)) {
      this.store.delete(key); // remove to reinsert (keeps Map order fresh for LRU)
    } else if (this.store.size >= this.maxSize) {
      this.evict();
    }

    const ttl = ttlMs ?? this.defaultTtlMs;
    this.store.set(key, {
      value,
      expiresAt: ttl ? Date.now() + ttl : undefined,
      frequency: 1,
    });
  }

  get(key: K): V | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;

    if (entry.expiresAt && entry.expiresAt < Date.now()) {
      this.store.delete(key);
      return undefined;
    }

    if (this.policy === "LRU") {
      // Move to the end (most recently used)
      this.store.delete(key);
      this.store.set(key, entry);
    } else if (this.policy === "LFU") {
      entry.frequency++;
    }

    return entry.value;
  }

  has(key: K): boolean {
    return this.get(key) !== undefined;
  }

  delete(key: K): boolean {
    return this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }

  get size(): number {
    return this.store.size;
  }

  private purgeExpired(): void {
    if (this.policy !== "TTL") return; // other policies purge lazily on get()
    const now = Date.now();
    for (const [key, entry] of this.store.entries()) {
      if (entry.expiresAt && entry.expiresAt < now) this.store.delete(key);
    }
  }

  private evict(): void {
    if (this.policy === "LRU" || this.policy === "TTL") {
      // Oldest inserted / least recently touched is first in Map iteration order
      const oldestKey = this.store.keys().next().value;
      if (oldestKey !== undefined) this.store.delete(oldestKey);
      return;
    }

    if (this.policy === "LFU") {
      let leastKey: K | undefined;
      let leastFreq = Infinity;
      for (const [key, entry] of this.store.entries()) {
        if (entry.frequency < leastFreq) {
          leastFreq = entry.frequency;
          leastKey = key;
        }
      }
      if (leastKey !== undefined) this.store.delete(leastKey);
    }
  }

  /** Get-or-compute helper: returns cached value, or computes + caches it */
  async getOrSet(key: K, factory: () => Promise<V> | V, ttlMs?: number): Promise<V> {
    const cached = this.get(key);
    if (cached !== undefined) return cached;
    const value = await factory();
    this.set(key, value, ttlMs);
    return value;
  }
}
