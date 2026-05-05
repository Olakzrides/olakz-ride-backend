import { logger } from '../utils/logger';

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

export class CacheService {
  private static cache = new Map<string, CacheEntry<unknown>>();
  private static cleanupInterval: NodeJS.Timeout | null = null;

  static initialize(): void {
    if (!this.cleanupInterval) {
      this.cleanupInterval = setInterval(() => this.cleanup(), 60000);
      logger.info('CacheService initialized');
    }
  }

  static set<T>(key: string, data: T, ttlSeconds = 300): void {
    this.cache.set(key, { data, expiresAt: Date.now() + ttlSeconds * 1000 });
  }

  static get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }
    return entry.data as T;
  }

  static delete(key: string): void {
    this.cache.delete(key);
  }

  static clear(): void {
    this.cache.clear();
  }

  private static cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) this.cache.delete(key);
    }
  }

  static shutdown(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.clear();
  }
}

export const CacheKeys = {
  analytics: (type: string, period: string, filters: string) =>
    `analytics:${type}:${period}:${filters}`,
};

export const CacheTTL = {
  ANALYTICS: 300,
};
