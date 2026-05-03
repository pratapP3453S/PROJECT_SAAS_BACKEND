# Database Layer Developer Guide

## Purpose

`src/database` owns Prisma access and reusable repository behavior. Feature modules should reach the database through repositories instead of embedding Prisma queries directly in controllers or services.

## Runtime Flow

1. `PrismaModule` is marked `@Global()` and imported once by `AppModule`.
2. `PrismaService` constructs a Prisma 7 client using `@prisma/adapter-pg`.
3. On module init, it connects to PostgreSQL.
4. In development, it logs query events.
5. On module destroy, it disconnects cleanly.
6. Repositories inject `PrismaService`.

## Key Files

- `prisma/prisma.module.ts`: global provider module.
- `prisma/prisma.service.ts`: Prisma client wrapper and lifecycle owner.
- `repositories/base.repository.ts`: generic CRUD, pagination, soft delete, restore, count, and exists helpers.

## Repository Pattern

Feature repositories extend `BaseRepository<T>` and set `modelName` to the Prisma model accessor name:

```ts
protected readonly modelName = 'user';
```

`BaseRepository` dynamically resolves `this.prisma[modelName]`. This is intentional because Prisma model delegates are generated properties and cannot be indexed cleanly with a runtime string.

## Dependencies

- `DATABASE_URL` must be valid before app startup.
- Prisma schema files live in `prisma/schema`.
- Prisma migrations live in `prisma/migrations`.
- `ApiResponse.buildMeta()` is used for pagination metadata.

## Complexity And Risk

- Medium complexity.
- Highest-risk area: `PrismaService` composition. Prisma 7 with adapter-pg should stay wrapped rather than inherited from.
- Add a getter in `PrismaService` for each new model that repositories or infrastructure code need.
- `BaseRepository.findById()` does not apply `deletedAt: null`; services must enforce soft-delete semantics.
- `cleanDatabase()` is blocked in production and should stay that way.

## Adding A Model Repository

1. Add the model in `prisma/schema`.
2. Run and commit a migration.
3. Add a model getter in `PrismaService`.
4. Create a feature repository extending `BaseRepository<Model>`.
5. Put business-specific queries in the feature repository, not in `BaseRepository`.

