import { logger } from '../../config/logger';

/**
 * CacheService - In-memory cache with Redis-ready interface
 * 
 * Current: Uses Map for in-memory caching
 * Future: Can be swapped with Redis implementation without code changes
 * 
 * Usage:
 * - CacheService.set('key', data, 300) // 300 seconds TTL
 * - CacheService.get('key')
 * - CacheService.delete('key')
 * - CacheService.clear()
 */

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

export class CacheService {
  private static cache = new Map<string, CacheEntry<any>>();
  private static cleanupInterval: NodeJS.Timeout | null = null;

  /**
   * Initialize cache service with automatic cleanup
   */
  public static initialize(): void {
    // Run cleanup every 60 seconds to remove expired entries
    if (!this.cleanupInterval) {
      this.cleanupInterval = setInterval(() => {
        this.cleanup();
      }, 60000);

      logger.info('CacheService initialized with in-memory storage');
    }
  }

  /**
   * Set cache entry with TTL (Time To Live)
   * @param key - Cache key
   * @param data - Data to cache
   * @param ttlSeconds - Time to live in seconds (default: 300 = 5 minutes)
   */
  public static set<T>(key: string, data: T, ttlSeconds: number = 300): void {
    const expiresAt = Date.now() + (ttlSeconds * 1000);
    this.cache.set(key, { data, expiresAt });
    
    logger.debug(`Cache SET: ${key} (TTL: ${ttlSeconds}s)`);
  }

  /**
   * Get cache entry
   * @param key - Cache key
   * @returns Cached data or null if not found/expired
   */
  public static get<T>(key: string): T | null {
    const entry = this.cache.get(key);

    if (!entry) {
      logger.debug(`Cache MISS: ${key}`);
      return null;
    }

    // Check if expired
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      logger.debug(`Cache EXPIRED: ${key}`);
      return null;
    }

    logger.debug(`Cache HIT: ${key}`);
    return entry.data as T;
  }

  /**
   * Delete cache entry
   * @param key - Cache key
   */
  public static delete(key: string): void {
    this.cache.delete(key);
    logger.debug(`Cache DELETE: ${key}`);
  }

  /**
   * Clear all cache entries
   */
  public static clear(): void {
    this.cache.clear();
    logger.info('Cache cleared');
  }

  /**
   * Get cache statistics
   */
  public static getStats(): { size: number; keys: string[] } {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys()),
    };
  }

  /**
   * Cleanup expired entries
   */
  private static cleanup(): void {
    const now = Date.now();
    let expiredCount = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
        expiredCount++;
      }
    }

    if (expiredCount > 0) {
      logger.debug(`Cache cleanup: removed ${expiredCount} expired entries`);
    }
  }

  /**
   * Shutdown cache service
   */
  public static shutdown(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.clear();
    logger.info('CacheService shutdown');
  }
}

// Cache key builders for consistency
export const CacheKeys = {
  // Fare configs (TTL: 10 minutes)
  fareConfig: (vehicleTypeId: string, regionId: string) => 
    `fare:config:${vehicleTypeId}:${regionId}`,
  
  // Analytics (TTL: 5 minutes)
  analytics: (type: string, period: string, filters: string) => 
    `analytics:${type}:${period}:${filters}`,
  
  // Vehicle types (TTL: 30 minutes)
  vehicleTypes: (regionId: string) => 
    `vehicle:types:${regionId}`,
  
  // Courier dashboard (TTL: 2 minutes)
  courierDashboard: (courierId: string, period: string) => 
    `courier:dashboard:${courierId}:${period}`,
};

// TTL constants (in seconds)
export const CacheTTL = {
  FARE_CONFIG: 600,      // 10 minutes
  ANALYTICS: 300,        // 5 minutes
  VEHICLE_TYPES: 1800,   // 30 minutes
  COURIER_DASHBOARD: 120, // 2 minutes
  STATIC_CONFIG: 1800,   // 30 minutes
};
