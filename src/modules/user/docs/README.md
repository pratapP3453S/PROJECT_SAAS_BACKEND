# User Module Developer Guide

## Purpose

The user module owns profile reads, profile updates, admin user listing,
admin user lookup, admin update, and super-admin soft deletion. Authentication
and token lifecycle stay in [src/modules/auth](../../auth/).

## Layer map

```
modules/user/
├── domain/
│   └── entities/user.entity.ts          # PublicUserProfile
├── infrastructure/
│   └── prisma/user.repository.ts        # extends BaseRepository<User>; admin filters
├── application/
│   └── use-cases/user.service.ts        # cache-aside reads, updates, soft delete
├── api/
│   └── v1/
│       ├── controllers/user.controller.ts
│       ├── dto/update-user.dto.ts
│       └── user-v1.module.ts
└── user.module.ts                       # aggregator (re-exports UserV1Module)
```

## Routes (v1)

All routes are URI-versioned through `@Controller({ path: 'users', version: '1' })`,
producing `/api/v1/users/...`.

### Current user profile

`GET /api/v1/users/me`

1. `JwtAuthGuard` validates the Bearer token.
2. `@CurrentUser()` extracts the authenticated user from `req.user`.
3. `UserController.getMe()` calls `UserService.findById(user.id)`.
4. `UserService` checks `CacheService` with key `user:{id}`.
5. On cache miss, `UserRepository.findById()` loads the row.
6. The service rejects missing or soft-deleted users.
7. Sensitive fields are stripped and the public profile is cached for 300 seconds.

### Update current user

`PATCH /api/v1/users/me`

1. `UpdateUserDto` is validated globally.
2. `UserService.update()` confirms the user exists and is not deleted.
3. The repository updates allowed fields.
4. Cache key `user:{id}` is invalidated.
5. The updated public profile is returned.

### Admin list

`GET /api/v1/users`

1. `RolesGuard` requires `ADMIN` or `SUPER_ADMIN`.
2. `PaginationDto` validates page, limit, sort, and search inputs.
3. `UserRepository.findAllPaginated()` applies `deletedAt: null` plus optional role, status, and search filters.
4. `BaseRepository.findManyPaginated()` runs the item query and count query.
5. The service maps every `User` to `PublicUserProfile`.

### Admin lookup and update

`GET /api/v1/users/:id` and `PATCH /api/v1/users/:id`

1. `RolesGuard` requires `ADMIN` or `SUPER_ADMIN`.
2. The service uses the same `findById()` and `update()` paths as self-service profile routes.
3. Update invalidates cache.

### Super admin delete

`DELETE /api/v1/users/:id`

1. `RolesGuard` requires `SUPER_ADMIN`.
2. `UserService.remove()` confirms the user exists and is active.
3. `BaseRepository.softDelete()` sets `deletedAt`.
4. The profile cache entry is removed.

## Dependencies

- `JwtAuthGuard` and `RolesGuard` enforce access.
- `@CurrentUser()` reads the authenticated user.
- `CacheService` provides resilient cache-aside behavior.
- `UserRepository` extends `BaseRepository<User>`.
- `PaginationDto` (from [shared/dto](../../../shared/dto/)) and `ApiResponse.buildMeta()` define pagination behavior.
- `Role` and `UserStatus` are Prisma enums.

## Data Model Touchpoints

The module reads and writes the `User` model:

- Read: profile fields, role, status, verification flags, timestamps.
- Write: profile fields allowed by `UpdateUserDto`, avatar through `updateAvatar()`, and `deletedAt` through soft delete.
- It must not expose `password`, `refreshToken`, `passwordResetToken`, or `passwordResetExpiry`.

## Complexity And Risk

- Low to medium complexity.
- Highest-risk area: role enforcement on admin routes.
- Cache invalidation is required after every profile mutation.
- `findById()` from `BaseRepository` does not exclude soft-deleted records by itself, so service methods must check `deletedAt`.
- Admin list queries are uncached because filter and pagination combinations vary.

## Adding User Fields

1. Add the field to the Prisma user schema and migration.
2. Decide whether it is public. If yes, update `PublicUserProfile` and `UserService.toPublicProfile()`.
3. If the field can be changed by users, add it to `UpdateUserDto`.
4. Update Swagger decorators and this guide.

## Adding A v2

Same pattern as auth: copy `api/v1/` to `api/v2/`, bump `version: '2'`,
register a `UserV2Module`, and import it from `user.module.ts`. v1 keeps
serving existing clients.
