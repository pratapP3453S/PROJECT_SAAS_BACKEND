# Shared Layer Developer Guide

## Purpose

`src/shared` contains global reusable services and pure utilities that are useful across feature modules. It is imported once by `AppModule` and marked `@Global()`.

## Services

### CacheService

`CacheService` wraps Nest CacheManager.

Flow:

1. Services call `get`, `set`, `del`, `getOrSet`, or `invalidateByPattern`.
2. Cache errors are logged and swallowed.
3. On failures, callers fall back to their normal DB path.

Current user-profile caching is implemented in `UserService`.

### EncryptionService

`EncryptionService` wraps pure AES utilities.

Flow:

1. The service reads `IMAGE_ENCRYPTION_KEY` from config.
2. Buffer and string encryption methods delegate to `shared/utils/encryption.util.ts`.
3. Upload flows use `encryptBuffer()` for sensitive processed files.

## Utilities

- `date.util.ts`: date helpers.
- `encryption.util.ts`: pure crypto functions and secure token generation.
- `pagination.util.ts`: pagination helpers.
- `sanitize.util.ts`: sanitization helpers.
- `index.ts`: utility exports.

## Dependencies

- `CacheModule` is configured in `shared.module.ts`.
- `ConfigService` supplies cache TTL and encryption key.
- `CacheService` depends on `CACHE_MANAGER`.
- `EncryptionService` depends on config and Node crypto utilities.

## Complexity And Risk

- Low to medium complexity.
- Highest-risk area: encryption key handling. Changing keys makes existing encrypted files unreadable unless migration/decryption strategy exists.
- Cache must remain optional. Do not make business correctness depend on a cache write succeeding.
- `invalidateByPattern()` depends on a cache store with `keys()` support; memory stores may not support it.

## Adding Shared Code

Add code here only when it is not feature-specific. If the logic belongs to one domain, keep it in that feature module.

