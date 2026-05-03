import { CacheModule } from '@nestjs/cache-manager';
import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { CacheService } from './services/cache.service';
import { EncryptionService } from './services/encryption.service';

/**
 * SharedModule — @Global() module exposing cross-cutting services to the whole app.
 *
 * Responsibility: Provides CacheService and EncryptionService to every module
 * without requiring explicit imports. Because it is @Global(), any module that
 * imports AppModule (which imports SharedModule) automatically has access to these.
 *
 * CacheModule setup:
 *  Uses CacheModule.registerAsync() to read TTL from the 'redis.ttl' config key
 *  (default 3600 s). TTL is converted to milliseconds for cache-manager v5.
 *  The in-memory store is used by default (max: 1000 entries). Swap to an ioredis
 *  store for production Redis-backed caching (see commented config).
 *
 * Exports:
 *  CacheService     : injected into UserService (profile caching)
 *  EncryptionService: injected into UploadService (file encryption)
 *  CacheModule      : re-exported so CACHE_MANAGER token is available to other
 *                     modules if they need direct access.
 *
 * Used by: AppModule → imports: [..., SharedModule]
 * See also: CacheService   → src/shared/services/cache.service.ts
 *           EncryptionService → src/shared/services/encryption.service.ts
 */
@Global()
@Module({
  imports: [
    CacheModule.registerAsync({
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
  providers: [CacheService, EncryptionService],
  exports: [CacheService, EncryptionService, CacheModule],
})
export class SharedModule {}
