# Prisma Schema Developer Guide

## Purpose

The `prisma` folder owns database schema, migrations, and seed data. Runtime database access is wrapped by `src/database`.

## Schema Layout

- `schema.prisma`: generator and datasource entry point.
- `schema/user.schema.prisma`: `User` model.
- `schema/upload.schema.prisma`: `Upload` model.
- `schema/audit-log.schema.prisma`: audit log model.
- `schema/idempotency.schema.prisma`: POST idempotency records.
- `schema/enums.prisma`: shared enums.
- `migrations/`: generated SQL migrations.
- `seed.ts`: default seed data.

## Naming Conventions

- Prisma fields use `camelCase`.
- Database columns use `snake_case` through `@map`.
- Tables use `snake_case` through `@@map`.
- Indexes should be named when clarity matters, especially soft-delete indexes.

## Important Models

### User

Used by auth and user modules. Stores credentials, profile fields, role, status, refresh token hash, verification state, and soft-delete timestamp.

### Upload

Tracks two-stage file uploads. `tempUrl` is used before commit, `permanentUrl` after commit, and `status` should reflect lifecycle state.

### IdempotencyRecord

Stores POST request hashes and response bodies for replay or duplicate protection.

## Dependencies

- Prisma 7 configuration is in `prisma.config.ts`.
- Runtime client creation is in `src/database/prisma/prisma.service.ts`.
- Docker migrator runs `prisma migrate deploy` before app startup.

## Complexity And Risk

- Medium complexity.
- Highest-risk area: changing existing columns used by auth tokens, soft deletes, and idempotency.
- Avoid destructive migrations without a data migration plan.
- Adding a Prisma model also requires adding a getter in `PrismaService` if application code needs direct access.
- Keep soft-delete fields consistent where records should be retained.

## Schema Change Flow

1. Edit the schema file under `prisma/schema`.
2. Generate and inspect the migration.
3. Update repositories, DTOs, interfaces, and response shapes.
4. Update seed data if required.
5. Update the matching folder-level docs.

