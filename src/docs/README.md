# Source Tree Developer Guide

## Purpose

`src` contains the NestJS application code. This guide explains the top-level flow before diving into feature folders.

## Startup Flow

1. `main.ts` creates the Nest Express app from `AppModule`.
2. Security middleware is applied with Helmet.
3. Compression and CORS are configured.
4. The global API prefix is set, excluding `/health` and `/health/ping`.
5. `AppValidationPipe` is installed globally.
6. Static uploads are served from `/uploads`.
7. Swagger is mounted when enabled.
8. The app listens on `PORT`.

## AppModule Flow

`app.module.ts` wires:

- Config namespaces and environment validation.
- Rate limiting.
- Global `PrismaModule`, `SharedModule`, and `JobsModule`.
- Feature modules under `src/modules`.
- Global exception filter.
- Global throttling, JWT, and roles guards.
- Global idempotency and logging interceptors.
- Logger and sanitization middleware.

## Folder Responsibilities

- `common`: cross-cutting request pipeline, constants, decorators, guards, filters, interceptors, errors, and responses.
- `config`: typed configuration and Swagger setup.
- `database`: Prisma service and reusable repository base.
- `jobs`: Redis-backed background queue infrastructure.
- `lib`: small non-provider helpers such as Multer configuration.
- `modules`: feature modules.
- `shared`: global shared services and utilities.

## Complexity And Risk

- Medium complexity because root wiring affects every route.
- Changes in `AppModule`, `main.ts`, or `common` should be tested against multiple modules.
- Keep business logic inside feature services, not in startup or common infrastructure.
- When adding a folder with meaningful ownership, add a local `docs/README.md`.

