/**
 * core/ — application-wide system layer (infrastructure + cross-cutting concerns).
 *
 * What lives here
 *  - config/      typed env loaders + Swagger setup
 *  - database/    PrismaService and BaseRepository
 *  - cache/       Redis-backed CacheService (global)
 *  - logger/      Express access logger + Nest LoggingInterceptor
 *  - guards/      global JwtAuthGuard + RolesGuard
 *  - interceptors/ idempotency + envelope wrapper
 *  - filters/     AllExceptionsFilter
 *  - exceptions/  ApiError + payload types
 *  - decorators/  @Public, @Roles, @CurrentUser, @ApiPaginatedResponse
 *  - pipes/       AppValidationPipe
 *  - middleware/  RequestContextMiddleware + SanitizeMiddleware
 *
 * Rule of thumb: code lives in `core/` if it depends on NestJS runtime, the
 * database, the cache, or other infrastructure. Pure utilities and types
 * belong in `shared/`.
 */
export * from './exceptions';
export * from './decorators';
export * from './guards';
export * from './interceptors';
export * from './filters';
export * from './pipes';
export * from './middleware';
export * from './logger';
export * from './cache';
export * from './database';
export * from './config';
