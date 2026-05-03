import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cache } from 'cache-manager';

/**
 * CacheService — application-level Redis cache abstraction.
 *
 * Responsibility: Wraps the NestJS CacheManager with a resilient interface.
 * All cache operations swallow errors (log + return null / no-op) so a Redis
 * outage never crashes the application — the request falls through to the DB.
 * Provided globally via SharedModule (@Global).
 *
 * Methods:
 *  get<T>(key)                      : Returns cached value or null on miss/error.
 *  set<T>(key, value, ttlSeconds?)  : Stores value; ttl is converted to ms for
 *                                     cache-manager v5 (which expects milliseconds).
 *  del(key)                         : Deletes a single key; swallows errors.
 *  getOrSet<T>(key, factory, ttl?)  : Cache-aside pattern — check cache, call factory
 *                                     on miss, store result, return value.
 *  invalidateByPattern(pattern)     : Bulk-deletes keys matching a glob pattern.
 *                                     Requires the Redis store to expose a `keys()`
 *                                     method (ioredis-based stores do; memory store does not).
 *
 * Cache key convention (CACHE_KEYS constants):
 *  user:{id}            → user profile (TTL: 300s, set by UserService)
 *  user:email:{email}   → email → user mapping (reserved)
 *
 * Backend: cache-manager with @nestjs/cache-manager; Redis in production,
 *          in-memory store in development/test (configured in SharedModule).
 *
 * Used by: UserService
 * See also: CACHE_KEYS → src/common/constants/app.constants.ts
 */
@Injectable()
export class CacheService {
  private readonly logger = new Logger(CacheService.name);

  constructor(@Inject(CACHE_MANAGER) private readonly cacheManager: Cache) {}

  async get<T>(key: string): Promise<T | null> {
    try {
      return (await this.cacheManager.get<T>(key)) ?? null;
    } catch (error) {
      this.logger.warn(`Cache GET failed for key "${key}": ${(error as Error).message}`);
      return null;
    }
  }

  async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    try {
      await this.cacheManager.set(key, value, ttlSeconds ? ttlSeconds * 1000 : undefined);
    } catch (error) {
      this.logger.warn(`Cache SET failed for key "${key}": ${(error as Error).message}`);
    }
  }

  async del(key: string): Promise<void> {
    try {
      await this.cacheManager.del(key);
    } catch (error) {
      this.logger.warn(`Cache DEL failed for key "${key}": ${(error as Error).message}`);
    }
  }

  async getOrSet<T>(key: string, factory: () => Promise<T>, ttlSeconds?: number): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== null) return cached;

    const value = await factory();
    await this.set(key, value, ttlSeconds);
    return value;
  }

  async invalidateByPattern(pattern: string): Promise<void> {
    try {
      const store = this.cacheManager.store as unknown as {
        keys?: (pattern: string) => Promise<string[]>;
      };
      if (typeof store?.keys === 'function') {
        const keys = await store.keys(pattern);
        await Promise.all(keys.map((key) => this.cacheManager.del(key)));
      }
    } catch (error) {
      this.logger.warn(
        `Cache invalidation failed for pattern "${pattern}": ${(error as Error).message}`,
      );
    }
  }
}
