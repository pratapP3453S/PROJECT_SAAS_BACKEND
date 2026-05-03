# User Module Developer Guide

## Purpose

The user module owns profile reads, profile updates, admin user listing, admin user lookup, admin update, and super-admin soft deletion. Authentication and token lifecycle stay in `src/modules/auth`.

## Request Flow

### Current User Profile

`GET /users/me`

1. `JwtAuthGuard` validates the Bearer token.
2. `@CurrentUser()` extracts the authenticated user from `req.user`.
3. `UserController.getMe()` calls `UserService.findById(user.id)`.
4. `UserService` checks `CacheService` with key `user:{id}`.
5. On cache miss, `UserRepository.findById()` loads the row.
6. The service rejects missing or soft-deleted users.
7. Sensitive fields are stripped and the public profile is cached for 300 seconds.

### Update Current User

`PATCH /users/me`

1. `UpdateUserDto` is validated globally.
2. `UserService.update()` confirms the user exists and is not deleted.
3. The repository updates allowed fields.
4. Cache key `user:{id}` is invalidated.
5. The updated public profile is returned.

### Admin List

`GET /users`

1. `RolesGuard` requires `ADMIN` or `SUPER_ADMIN`.
2. `PaginationDto` validates page, limit, sort, and search inputs.
3. `UserRepository.findAllPaginated()` applies `deletedAt: null` plus optional role, status, and search filters.
4. `BaseRepository.findManyPaginated()` runs the item query and count query.
5. The service maps every `User` to `PublicUserProfile`.

### Admin Lookup And Update

`GET /users/:id` and `PATCH /users/:id`

1. `RolesGuard` requires `ADMIN` or `SUPER_ADMIN`.
2. The service uses the same `findById()` and `update()` paths as self-service profile routes.
3. Update invalidates cache.

### Super Admin Delete

`DELETE /users/:id`

1. `RolesGuard` requires `SUPER_ADMIN`.
2. `UserService.remove()` confirms the user exists and is active.
3. `BaseRepository.softDelete()` sets `deletedAt`.
4. The profile cache entry is removed.

## Key Files

- `user.controller.ts`: protected route map and role metadata.
- `user.service.ts`: cache-aside profile reads, updates, soft deletion, public profile mapping.
- `user.repository.ts`: user-specific Prisma queries and paginated filtering.
- `dto/update-user.dto.ts`: allowed profile update fields.
- `interfaces/user.interface.ts`: public profile contract.

## Dependencies

- `JwtAuthGuard` and `RolesGuard` enforce access.
- `@CurrentUser()` reads the authenticated user.
- `CacheService` provides resilient cache-aside behavior.
- `UserRepository` extends `BaseRepository<User>`.
- `PaginationDto` and `ApiResponse.buildMeta()` define pagination behavior.
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
2. Decide whether it is public. If yes, update `PublicUserProfile` and `toPublicProfile()`.
3. If the field can be changed by users, add it to `UpdateUserDto`.
4. Update Swagger decorators and this guide.

