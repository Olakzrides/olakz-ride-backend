import config from '../config';

interface CacheItem<T> {
  data: T;
  expiry: number;
}

class CacheUtil {
  private static cache = new Map<string, CacheItem<any>>();

  static set<T>(key: string, data: T, ttlMinutes?: number): void {
    const ttl = ttlMinutes || config.cache.ttlMinutes;
    const expiry = Date.now() + (ttl * 60 * 1000);
    
    this.cache.set(key, { data, expiry });
  }

  static get<T>(key: string): T | null {
    const item = this.cache.get(key);
    
    if (!item) {
      return null;
    }

    if (item.expiry < Date.now()) {
      this.cache.delete(key);
      return null;
    }

    return item.data;
  }

  static delete(key: string): boolean {
    return this.cache.delete(key);
  }

  static clear(): void {
    this.cache.clear();
  }

  static has(key: string): boolean {
    const item = this.cache.get(key);
    
    if (!item) {
      return false;
    }

    if (item.expiry < Date.now()) {
      this.cache.delete(key);
      return false;
    }

    return true;
  }

  static size(): number {
    return this.cache.size;
  }

  // Clean expired items
  static cleanup(): void {
    const now = Date.now();
    for (const [key, item] of this.cache.entries()) {
      if (item.expiry < now) {
        this.cache.delete(key);
      }
    }
  }
}

// Run cleanup every 5 minutes
setInterval(() => {
  CacheUtil.cleanup();
}, 5 * 60 * 1000);

export default CacheUtil;