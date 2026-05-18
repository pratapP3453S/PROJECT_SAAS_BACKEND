import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';

import { appConfig } from './core/config/app.config';
import { databaseConfig } from './core/config/database.config';
import { jwtConfig } from './core/config/jwt.config';
import { redisConfig } from './core/config/redis.config';
import { validateEnv } from './core/config/env.config';

import { AllExceptionsFilter } from './core/filters/all-exceptions.filter';
import { JwtAuthGuard } from './core/guards/jwt-auth.guard';
import { RolesGuard } from './core/guards/roles.guard';
import { IdempotencyInterceptor } from './core/interceptors/idempotency.interceptor';
import { ResponseInterceptor } from './core/interceptors/response.interceptor';
import { LoggingInterceptor } from './core/logger/logging.interceptor';
import { LoggerMiddleware } from './core/logger/logger.middleware';
import { RequestContextMiddleware } from './core/middleware/request-context.middleware';
import { SanitizeMiddleware } from './core/middleware/sanitize.middleware';

import { PrismaModule } from './core/database/prisma/prisma.module';
import { CoreCacheModule } from './core/cache/cache.module';
import { SharedModule } from './shared/shared.module';

import { JobsModule } from './modules/jobs/jobs.module';
import { AuthModule } from './modules/auth/auth.module';
import { HealthModule } from './modules/health/health.module';
import { UploadModule } from './modules/upload/upload.module';
import { UserModule } from './modules/user/user.module';

const envFilePath = process.env.ENV_FILE
  ? [process.env.ENV_FILE]
  : process.env.NODE_ENV === 'production'
    ? ['.env.prod', '.env']
    : process.env.NODE_ENV === 'staging'
      ? ['.env.stg', '.env']
      : ['.env.local', '.env.dev', '.env'];

/**
 * AppModule — root NestJS module that wires the entire application together.
 *
 * Responsibility
 *  Declares global providers (filter, guards, interceptors), imports feature
 *  modules, and applies middleware to all routes. This is the single source
 *  of truth for application-wide cross-cutting concerns.
 *
 * Layer map
 *  - core/    : infrastructure + cross-cutting (config, db, cache, guards,
 *               filters, pipes, middleware, logger, exceptions, decorators)
 *  - shared/  : pure utilities (constants, types, dto, context, helpers,
 *               EncryptionService, response envelope)
 *  - modules/ : feature modules organised as
 *               domain / infrastructure / application / api/v{n}
 *
 * Provider execution order (applied globally via APP_* tokens):
 *  1. ThrottlerGuard       — rate limiting (10/s · 50/10s · 100/min)
 *  2. JwtAuthGuard         — validates Bearer token; @Public() routes bypass this
 *  3. RolesGuard           — checks @Roles() metadata; no-op if no roles required
 *  4. AllExceptionsFilter  — catches all thrown errors and shapes JSON response
 *  5. IdempotencyInterceptor — deduplicates POST requests via key + request hash
 *  6. LoggingInterceptor   — logs method/url/status/duration after response
 *  7. ResponseInterceptor  — stamps diagnostics + wraps return values
 *
 * Middleware (applied to all routes — order matters):
 *  - RequestContextMiddleware : opens the AsyncLocalStorage scope (MUST run first)
 *  - LoggerMiddleware         : morgan-style request/response line logging
 *  - SanitizeMiddleware       : XSS-strips req.body, req.query, req.params via `xss`
 *
 * Config namespaces loaded: app, database, jwt, redis (see src/core/config/).
 * Environment files loaded in priority order: .env.local → .env.
 */
@Module({
  imports: [
    // ─── Config ─────────────────────────────────────────────────────────
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
      load: [appConfig, databaseConfig, jwtConfig, redisConfig],
      envFilePath,
      expandVariables: true,
    }),

    // ─── Rate Limiting ───────────────────────────────────────────────────
    ThrottlerModule.forRoot([
      {
        name: 'short',
        ttl: 1000,
        limit: 10,
      },
      {
        name: 'medium',
        ttl: 10000,
        limit: 50,
      },
      {
        name: 'long',
        ttl: 60000,
        limit: 100,
      },
    ]),

    // ─── Core / global infrastructure ────────────────────────────────────
    PrismaModule,
    CoreCacheModule,
    SharedModule,
    JobsModule,

    // ─── Feature Modules ─────────────────────────────────────────────────
    AuthModule,
    UserModule,
    UploadModule.forRoot(),
    HealthModule,
  ],

  providers: [
    // ─── Global Exception Filter ─────────────────────────────────────────
    {
      provide: APP_FILTER,
      useClass: AllExceptionsFilter,
    },

    // ─── Global Guards ────────────────────────────────────────────────────
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },

    // ─── Global Interceptors ──────────────────────────────────────────────
    // Order matters: ResponseInterceptor wraps return values & stamps the
    // diagnostic envelope — must run AFTER LoggingInterceptor so the logger
    // sees the final timing snapshot, but BEFORE the response is serialised.
    // Nest runs interceptors top-down for `intercept` and bottom-up for the
    // mapped result, so listing ResponseInterceptor LAST means it gets to
    // touch the envelope just before send.
    {
      provide: APP_INTERCEPTOR,
      useClass: IdempotencyInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: LoggingInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: ResponseInterceptor,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    // RequestContextMiddleware MUST run first so all downstream middleware,
    // guards, interceptors, controllers, repositories, and cache calls share
    // the same AsyncLocalStorage scope. Without this, RequestContext.current()
    // returns undefined and the diagnostic envelope falls back to thin meta.
    consumer
      .apply(RequestContextMiddleware, LoggerMiddleware, SanitizeMiddleware)
      .forRoutes({ path: '*', method: RequestMethod.ALL });
  }
}
