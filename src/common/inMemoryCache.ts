/**
 * Very small in-memory TTL cache.
 *
 * Notes:
 * - Works well on free tiers where you want to reduce DB calls within the same instance.
 * - Not a substitute for Redis (instances can restart any time).
 * - Stores the in-flight Promise to prevent thundering-herd on hot endpoints.
 */

type CacheEntry<T> = {
  expiresAt: number;
  value: Promise<T>;
};

export class InMemoryCache {
  private store = new Map<string, CacheEntry<any>>();

  get<T>(key: string): Promise<T> | null {
    const it = this.store.get(key);
    if (!it) return null;
    if (Date.now() > it.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return it.value as Promise<T>;
  }

  set<T>(key: string, value: Promise<T>, ttlMs: number) {
    this.store.set(key, { value, expiresAt: Date.now() + Math.max(0, ttlMs) });
  }

  del(key: string) {
    this.store.delete(key);
  }

  clear() {
    this.store.clear();
  }

  async getOrSet<T>(key: string, ttlMs: number, factory: () => Promise<T>): Promise<T> {
    const hit = this.get<T>(key);
    if (hit) return hit;

    const p = factory();
    this.set(key, p, ttlMs);

    try {
      return await p;
    } catch (err) {
      // Do not keep failed promise in cache
      this.del(key);
      throw err;
    }
  }
}

// A single process-level cache instance (simple + enough for this project).
export const cache = new InMemoryCache();
