export interface TokenBlacklist {
  add(tokenId: string, expiresAt?: number): Promise<void> | void;
  isBlacklisted(tokenId: string): Promise<boolean> | boolean;
  remove(tokenId: string): Promise<void> | void;
}

/**
 * In-memory blacklist for revoked JWT IDs (jti). Entries are lazily
 * garbage-collected once their expiry passes. Swap in a Redis-backed
 * implementation (SET with TTL) for a multi-instance deployment.
 */
export class InMemoryTokenBlacklist implements TokenBlacklist {
  private store = new Map<string, number>(); // tokenId -> expiresAt (ms epoch)

  add(tokenId: string, expiresAt: number = Date.now() + 1000 * 60 * 60 * 24 * 7): void {
    this.store.set(tokenId, expiresAt);
  }

  isBlacklisted(tokenId: string): boolean {
    const expiry = this.store.get(tokenId);
    if (expiry === undefined) return false;
    if (expiry < Date.now()) {
      this.store.delete(tokenId);
      return false;
    }
    return true;
  }

  remove(tokenId: string): void {
    this.store.delete(tokenId);
  }

  /** Periodically call this (e.g. via setInterval) to purge expired entries */
  sweep(): number {
    const now = Date.now();
    let removed = 0;
    for (const [id, exp] of this.store.entries()) {
      if (exp < now) {
        this.store.delete(id);
        removed++;
      }
    }
    return removed;
  }
}
