# Feature Modules Guide

## Purpose

`src/modules` contains feature modules. Each feature should own its controller, service, repository, DTOs, interfaces, constants, and a local `docs/README.md` that explains how the feature works before someone opens code files.

## Current Modules

- `auth`: registration, login, refresh-token rotation, logout, JWT strategy.
- `user`: profile reads/updates, admin user listing, admin updates, soft deletion.
- `upload`: authenticated two-stage file upload, processing, encryption, storage.
- `health`: public health and liveness endpoints.

## Standard Module Shape

A typical feature follows this pattern:

1. Controller receives HTTP input and returns response envelopes.
2. DTOs define request validation.
3. Service owns business rules.
4. Repository owns Prisma queries.
5. Interfaces define external shapes.
6. Module wires providers and exports only what other modules need.

Controllers should stay thin. Services should not know HTTP details. Repositories should not apply business decisions beyond query shape and persistence.

## Cross-Cutting Dependencies

Feature modules are affected by root app wiring:

- Global `ThrottlerGuard`, `JwtAuthGuard`, and `RolesGuard`.
- Global `IdempotencyInterceptor` for all `POST` requests.
- Global `LoggingInterceptor`.
- Global `AllExceptionsFilter`.
- Global `AppValidationPipe`.
- `PrismaService` from `PrismaModule`.
- `CacheService` and `EncryptionService` from `SharedModule`.

## Adding A Feature

1. Create `src/modules/{feature}`.
2. Add `{feature}.module.ts`, `{feature}.controller.ts`, `{feature}.service.ts`, and repository if it persists data.
3. Add `dto/`, `interfaces/`, and constants as needed.
4. Register the module in `AppModule`.
5. Add Prisma schema and migrations if needed.
6. Add response and error constants.
7. Create `src/modules/{feature}/docs/README.md` before or alongside implementation.

