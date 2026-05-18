# Core Layer Developer Guide

## Purpose

`src/core/` is the system layer. Everything that touches the framework, the
database, the cache, or the network lives here. Feature modules consume these
pieces but never reach the other way around.

Rule of thumb — if it depends on NestJS DI, on Prisma, on Redis, on Passport,
or on Express, it goes in `core/`. If it's a pure TypeScript helper, it goes
in `shared/`.

## Folder Map

| Folder            | What it owns                                                                          |
| ----------------- | ------------------------------------------------------------------------------------- |
| `config/`         | Typed env loader, namespaced config factories, Swagger setup                          |
| `database/`       | `PrismaService` (global), `PrismaModule`, `BaseRepository`                            |
| `cache/`          | `CoreCacheModule` (global), `CacheService` (resilient wrapper)                        |
| `logger/`         | `LoggerMiddleware` (Express layer), `LoggingInterceptor` (NestJS layer)               |
| `guards/`         | `JwtAuthGuard`, `RolesGuard` — registered globally in `AppModule`                     |
| `interceptors/`   | `IdempotencyInterceptor`, `ResponseInterceptor` — registered globally                 |
| `filters/`        | `AllExceptionsFilter` — normalises every thrown value to the standard envelope        |
| `exceptions/`     | `ApiError` typed exception + `FieldError` / `ApiErrorPayload` contracts               |
| `decorators/`     | `@Public`, `@Roles`, `@CurrentUser`, `@ApiPaginatedResponse`                          |
| `pipes/`          | `AppValidationPipe` — class-validator with structured `FieldError[]` output           |
| `middleware/`     | `RequestContextMiddleware`, `SanitizeMiddleware`                                      |

## Request Lifecycle

`AppModule` wires these globally:

1. Middleware (in order): `RequestContextMiddleware`, `LoggerMiddleware`, `SanitizeMiddleware`
2. Guards (in order): `ThrottlerGuard`, `JwtAuthGuard`, `RolesGuard`
3. Pipes: `AppValidationPipe` (mounted in `main.ts`)
4. Controller / service / repository code (in feature modules)
5. Interceptors (in order): `IdempotencyInterceptor`, `LoggingInterceptor`, `ResponseInterceptor`
6. Filter: `AllExceptionsFilter` (last-resort exception handler)

The `RequestContext` (defined in [shared/context](../../shared/context/)) is opened by
`RequestContextMiddleware`; every downstream layer reads it through
`RequestContext.current()`.

## Idempotency

All `POST` requests (except `multipart/form-data`) go through
`IdempotencyInterceptor`:

1. **Client-keyed** — caller sends `Idempotency-Key: <uuid>`. Same key + same
   request hash within 24 hours replays the original response. Same key with
   a different hash returns `422 ERR_IDEMPOTENCY_KEY_MISMATCH`.
2. **Hash-only** — no header. SHA-256 of `method:path:stableBody` is stored
   for 30 seconds; an identical replay returns `409 ERR_DUPLICATE_REQUEST`.

Storage uses the `IdempotencyRecord` Prisma model.

## Adding Code Here

Add to `core/` only when:

- It is application-wide (would be imported by ≥ 2 feature modules), AND
- It depends on the framework / infrastructure.

If a class is feature-specific, keep it inside that feature's `infrastructure/`
folder instead — that keeps `core/` from becoming a kitchen-drawer module.

## Dependencies

- `PrismaService` for `IdempotencyInterceptor`.
- `passport-jwt` via `JwtAuthGuard` (Passport strategy itself lives in `auth/infrastructure/jwt/`).
- `class-validator` + `class-transformer` through `AppValidationPipe` and DTOs.
- `xss` through `SanitizeMiddleware`.
- `cache-manager` + `@nestjs/cache-manager` through `CoreCacheModule`.

## Complexity And Risk

- High blast radius — a change to a guard, filter, or interceptor affects every route.
- `@Public()` is the intended way to bypass JWT auth — don't add bespoke `if (skip) return`.
- `RolesGuard` enforces only when `@Roles()` is present; absence means "any auth'd user".
- Keep error and response constants in [shared/constants](../../shared/constants/) so envelopes stay consistent.
