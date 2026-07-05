import { createHash } from "crypto";

function hash32(key: string): number {
  const digest = createHash("md5").update(key).digest();
  return digest.readUInt32BE(0);
}

/**
 * Consistent hash ring, used to distribute keys (e.g. cache keys, user IDs,
 * shard keys) across a changing set of nodes with minimal remapping when
 * nodes are added or removed — critical for horizontal scaling of caches,
 * partitioned databases, or sticky-session load balancing.
 */
export class ConsistentHashRing {
  private ring = new Map<number, string>(); // hash -> node
  private sortedHashes: number[] = [];
  private virtualNodes: number;

  constructor(nodes: string[] = [], virtualNodes = 150) {
    this.virtualNodes = virtualNodes;
    for (const node of nodes) this.addNode(node);
  }

  addNode(node: string): void {
    for (let i = 0; i < this.virtualNodes; i++) {
      const hash = hash32(`${node}#${i}`);
      this.ring.set(hash, node);
    }
    this.rebuildSorted();
  }

  removeNode(node: string): void {
    for (let i = 0; i < this.virtualNodes; i++) {
      const hash = hash32(`${node}#${i}`);
      this.ring.delete(hash);
    }
    this.rebuildSorted();
  }

  private rebuildSorted(): void {
    this.sortedHashes = [...this.ring.keys()].sort((a, b) => a - b);
  }

  /** Returns which node a given key maps to */
  getNode(key: string): string {
    if (this.ring.size === 0) throw new Error("ConsistentHashRing has no nodes");
    const hash = hash32(key);

    // Binary search for the first ring position >= hash (wrap around if none)
    let lo = 0;
    let hi = this.sortedHashes.length - 1;
    if (hash > this.sortedHashes[hi]) return this.ring.get(this.sortedHashes[0])!;

    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (this.sortedHashes[mid] < hash) lo = mid + 1;
      else hi = mid;
    }
    return this.ring.get(this.sortedHashes[lo])!;
  }

  /** Returns the N distinct physical nodes responsible for replicas of a key */
  getNodes(key: string, count: number): string[] {
    const result: string[] = [];
    if (this.ring.size === 0) return result;

    const hash = hash32(key);
    let idx = this.sortedHashes.findIndex((h) => h >= hash);
    if (idx === -1) idx = 0;

    const seen = new Set<string>();
    let i = idx;
    while (seen.size < count && seen.size < new Set(this.ring.values()).size) {
      const node = this.ring.get(this.sortedHashes[i])!;
      if (!seen.has(node)) {
        seen.add(node);
        result.push(node);
      }
      i = (i + 1) % this.sortedHashes.length;
    }
    return result;
  }

  listNodes(): string[] {
    return [...new Set(this.ring.values())];
  }
}
