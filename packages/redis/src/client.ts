/**
 * Minimal interface covering the subset of Redis commands this package
 * needs. Both `ioredis` and `node-redis` (v4+) clients satisfy this
 * shape already, so you can pass either in directly — no adapter needed.
 */
export interface RedisClientLike {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ...args: any[]): Promise<any>;
  del(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<number>;
  incr(key: string): Promise<number>;
  ttl(key: string): Promise<number>;
  eval(script: string, ...args: any[]): Promise<any>;
  publish(channel: string, message: string): Promise<number>;
  subscribe?(channel: string, callback: (message: string) => void): Promise<void> | void;
}
