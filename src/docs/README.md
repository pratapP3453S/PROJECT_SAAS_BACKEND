# Source Tree Developer Guide

## Purpose

`src/` is organised in three concentric rings:

| Ring         | Folder      | Depends on        | What lives here                                                                 |
| ------------ | ----------- | ----------------- | ------------------------------------------------------------------------------- |
| Infra        | `core/`     | NestJS + adapters | Config, database, cache, guards, interceptors, filters, pipes, middleware, etc. |
| Pure utility | `shared/`   | Nothing           | Constants, types, DTOs, response envelope, helpers, context, encryption utility |
| Features     | `modules/`  | `core` + `shared` | One folder per business feature, each split into DDD layers                     |

A feature module follows the layout

```
modules/<feature>/
├── domain/         # business types, port interfaces, pure rules, DI tokens
├── infrastructure/ # Prisma repositories, external SDKs, queue processors
├── application/    # use-case services (commands, queries, orchestration)
├── api/
│   └── v1/         # URI-versioned controllers + request DTOs + sub-module
└── <feature>.module.ts   # composition root that aggregates the api/v{n}
```

When a v2 API arrives, copy `api/v1/` to `api/v2/`, change the controller's
`@Controller({ version: '2' })`, and import the new sub-module from the
feature aggregator. No changes ripple to existing v1 callers.

## Startup Flow

1. `main.ts` creates the Nest Express app from `AppModule`.
2. Helmet sets security headers; `compression` enables gzip; CORS is configured.
3. `setGlobalPrefix('api')` + `enableVersioning({ type: URI, defaultVersion: '1' })`
   produce routes like `GET /api/v1/users/me`. `/health`, `/health/ping`,
   and `/upload/local/direct` are excluded from the prefix.
4. `AppValidationPipe` is installed globally.
5. Static `uploads/` is served at `/uploads/*`.
6. Swagger UI mounts at `/${SWAGGER_PATH}` when `SWAGGER_ENABLED=true`.
7. App listens on `PORT`.

## AppModule Wiring

`app.module.ts` imports — in this order — `ConfigModule`, `ThrottlerModule`,
the four `@Global()` infrastructure modules (`PrismaModule`, `CoreCacheModule`,
`SharedModule`, `JobsModule`), and the feature aggregators
(`AuthModule`, `UserModule`, `UploadModule.forRoot()`, `HealthModule`).

Global providers register `ThrottlerGuard` → `JwtAuthGuard` → `RolesGuard`,
then `IdempotencyInterceptor` → `LoggingInterceptor` → `ResponseInterceptor`,
plus `AllExceptionsFilter`. Middleware order is `RequestContextMiddleware`
→ `LoggerMiddleware` → `SanitizeMiddleware` — **the request context must
open first** or `RequestContext.current()` returns `undefined` downstream.

## Folder Map

- [core/](../core/) — system-level infrastructure (see [core/docs/README.md](../core/docs/README.md))
- [shared/](../shared/) — pure utilities and contracts (see [shared/docs/README.md](../shared/docs/README.md))
- [modules/](../modules/) — feature modules (see [modules/docs/README.md](../modules/docs/README.md))

## Complexity And Risk

- Medium complexity because root wiring affects every route.
- Changes in `AppModule`, `main.ts`, or `core/` should be tested against multiple modules.
- Keep business logic inside feature `application/use-cases`, never in startup or `core/`.
- When adding a new feature module, follow the same DDD folder split and add a `docs/README.md`.
