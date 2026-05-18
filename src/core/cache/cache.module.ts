import { CacheModule as NestCacheModule } from '@nestjs/cache-manager';
import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { CacheService } from './cache.service';

/**
 * CoreCacheModule — @Global() module exposing CacheService application-wide.
 *
 * Responsibility
 *  Configures NestJS's CacheManager and publishes `CacheService` (a resilient
 *  wrapper) so any module can inject it without an explicit import. Lives in
 *  `core/` because caching is an infrastructure concern bound to runtime
 *  configuration (TTL, eventual Redis store), not a pure utility.
 *
 * Configuration
 *  TTL is read from `redis.ttl` (default 3600 s) via ConfigService and
 *  converted to milliseconds for cache-manager v5. The in-memory store backs
 *  development; swap to an ioredis-backed store for production by adding
 *  `store: redisStore` to the useFactory return.
 *
 * Exports
 *  CacheService    : the resilient wrapper feature modules inject.
 *  NestCacheModule : re-exported so the raw CACHE_MANAGER token is reachable
 *                    when a consumer needs direct access (rare).
 *
 * Used by: AppModule (imports list).
 * See also: CacheService → src/core/cache/cache.service.ts
 */
@Global()
@Module({
  imports: [
    NestCacheModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        ttl: configService.get<number>('redis.ttl', 3600) * 1000,
        max: 1000,
        // Swap for ioredis store in production:
        // store: redisStore,
        // host: configService.get('redis.host'),
        // port: configService.get('redis.port'),
      }),
    }),
  ],
  providers: [CacheService],
  exports: [CacheService, NestCacheModule],
})
export class CoreCacheModule {}
