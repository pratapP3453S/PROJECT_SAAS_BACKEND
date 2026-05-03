import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

/**
 * redis.lib — ioredis client factory utilities.
 *
 * Responsibility: Creates and caches a singleton ioredis client for use outside
 * of the cache-manager abstraction (e.g., direct Pub/Sub, BullMQ, session store).
 *
 * createRedisClient(configService):
 *  Singleton factory — returns the existing client if already created.
 *  Reads connection details from the 'redis.*' config namespace (redis.config.ts).
 *  Retry strategy: exponential back-off capped at 2 s between attempts.
 *  maxRetriesPerRequest=3 limits individual command retries.
 *  Logs connection and error events to console (pre-Logger, so always visible).
 *
 * getRedisConnectionOptions(configService):
 *  Returns a plain options object (host, port, password, db) suitable for
 *  passing to BullModule.forRootAsync or CacheModule config factories without
 *  creating a full ioredis instance.
 *
 * Used by: JobsModule (BullModule config), SharedModule (cache store config)
 * Config namespace: redis → src/config/redis.config.ts
 */

let redisClient: Redis | null = null;

export function createRedisClient(configService: ConfigService): Redis {
  if (redisClient) return redisClient;

  const host = configService.get<string>('redis.host', 'localhost');
  const port = configService.get<number>('redis.port', 6379);
  const password = configService.get<string>('redis.password');
  const db = configService.get<number>('redis.db', 0);

  redisClient = new Redis({
    host,
    port,
    password: password || undefined,
    db,
    retryStrategy: (times) => {
      const delay = Math.min(times * 50, 2000);
      return delay;
    },
    maxRetriesPerRequest: 3,
  });

  redisClient.on('connect', () => {
    console.log(`✅ Redis connected at ${host}:${port}`);
  });

  redisClient.on('error', (err) => {
    console.error('Redis connection error:', err.message);
  });

  return redisClient;
}

export function getRedisConnectionOptions(configService: ConfigService) {
  return {
    host: configService.get<string>('redis.host', 'localhost'),
    port: configService.get<number>('redis.port', 6379),
    password: configService.get<string>('redis.password') || undefined,
    db: configService.get<number>('redis.db', 0),
  };
}
