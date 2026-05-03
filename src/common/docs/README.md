# Common Layer Developer Guide

## Purpose

`src/common` contains cross-cutting application building blocks. It should not contain business logic for a specific feature. Feature modules consume common guards, decorators, interceptors, filters, DTOs, response builders, errors, and constants.

## Request Lifecycle

The root `AppModule` wires common pieces globally:

1. Middleware: `LoggerMiddleware`, then `SanitizeMiddleware`.
2. Guards: `ThrottlerGuard`, `JwtAuthGuard`, then `RolesGuard`.
3. Interceptors: `IdempotencyInterceptor`, then `LoggingInterceptor`.
4. Pipes: `AppValidationPipe` from `main.ts`.
5. Controller, service, repository code.
6. Filter: `AllExceptionsFilter` converts thrown errors into the standard envelope.

## Key Areas

- `constants`: app-wide names, response definitions, error definitions, HTTP metadata.
- `decorators`: route metadata and request extraction helpers such as `@Public()`, `@Roles()`, `@CurrentUser()`.
- `dto`: shared DTOs such as `PaginationDto`.
- `errors`: `ApiError` factories.
- `filters`: exception-to-response mapping.
- `guards`: JWT auth and role checks.
- `interceptors`: idempotency, request logging, response wrapping.
- `interfaces`: shared request and JWT contracts.
- `middleware`: request logging and sanitization.
- `pipes`: structured validation errors.
- `responses`: success and pagination response builders.

## Idempotency Flow

All `POST` requests pass through `IdempotencyInterceptor`.

Client-keyed mode:

1. Client sends `Idempotency-Key`.
2. The interceptor computes a stable SHA-256 hash from method, path, and sorted JSON body.
3. If the key exists with the same hash and has not expired, the stored response is replayed.
4. If the key exists with a different hash, the request fails with key mismatch.
5. A fresh response is stored for 24 hours.

Hash-only mode:

1. No key is sent.
2. The same request body and path within 30 seconds is rejected as duplicate.
3. A fresh response is stored with a short expiry.

Storage uses the `IdempotencyRecord` Prisma model.

## Dependencies

- `PrismaService` for idempotency persistence.
- `passport-jwt` via auth guards and strategy.
- `class-validator` and `class-transformer` through validation pipe and DTOs.
- `xss` through sanitization middleware.
- Shared response and error constants used by every module.

## Complexity And Risk

- Medium complexity because this layer changes behavior globally.
- A change to guards, filters, validation, or idempotency affects every route.
- `@Public()` is the intended way to bypass JWT auth.
- `RolesGuard` only enforces roles when `@Roles()` metadata exists.
- Keep error and response constants centralized to avoid inconsistent API envelopes.

## When Adding Common Code

Add code here only when at least two modules need it or when it is a true app-wide concern. Otherwise keep the behavior in the feature module.

