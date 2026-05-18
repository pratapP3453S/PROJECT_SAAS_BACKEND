# Shared Layer Developer Guide

## Purpose

`src/shared/` is the pure-utility layer. Everything here can be imported by
`core/` AND by feature modules without creating circular dependencies. Nothing
in `shared/` depends on NestJS DI, the database, the cache, or the network —
they're plain TypeScript modules.

Rule of thumb — if removing NestJS would leave it working, it belongs here.

## Folder Map

| Folder         | What it owns                                                                |
| -------------- | --------------------------------------------------------------------------- |
| `constants/`   | `APP_CONSTANTS`, `CACHE_KEYS`, `QUEUE_NAMES`, `JOB_NAMES`, `Errors`, `Responses`, `HTTP_STATUS`, `MIME_TYPES`, metadata keys |
| `context/`     | `RequestContext` — AsyncLocalStorage scope opened by the request middleware |
| `dto/`         | `PaginationDto` (page / limit / sortBy / sortOrder / search)                |
| `types/`       | `common.types`, `request.interface`, `jwt-payload.interface`, `pagination.interface` |
| `responses/`   | `ApiResponse` builder + envelope types (`SuccessResponseBody`, `ErrorResponseBody`, `PaginationMeta`, etc.) |
| `utils/`       | `date`, `encryption`, `pagination`, `sanitize` — stateless functions        |
| `services/`    | `EncryptionService` — Nest-injectable wrapper over `encryption.util`         |
| `helpers/`     | Reserved for future domain-neutral helper functions                          |
| `shared.module.ts` | `@Global()` module that provides `EncryptionService`                    |

## Why Both `services/` AND `utils/`?

- `utils/` holds pure functions you can call from anywhere (tests, scripts, batch jobs).
- `services/` wraps utilities into Nest-injectable classes when DI is preferable
  (e.g. `EncryptionService` reads `IMAGE_ENCRYPTION_KEY` from `ConfigService`
  and delegates to `encryption.util` for the actual crypto).

If you only need the function, import from `utils/`. If you need DI for the
secret/key, inject the service.

## The Response Envelope

Every HTTP response — success or error — follows the shape:

```jsonc
{
  "success": true,
  "statusCode": 200,
  "message": "...",
  "data": { ... },
  "meta": { ... },          // pagination only
  "request": { ... },       // requestId, method, path, apiVersion
  "timing":  { ... },       // totalMs, dbMs, cacheMs, externalMs (+ counts)
  "server":  { ... },       // hostname, pid, env, region, appVersion
  "tags":    { ... },       // free-form, set via RequestContext.tag()
  "timestamp": "...",
  "path": "..."
}
```

`ApiResponse.attachDiagnostics()` stamps `request` / `timing` / `server` /
`tags` from the active `RequestContext` just before send. Without a request
context (tests, batch jobs) the envelope is still valid but thinner.

## Adding Code Here

Add to `shared/` only when:

- It is feature-agnostic (genuinely reusable across ≥ 2 modules), AND
- It is framework-agnostic (no NestJS / Prisma / Redis dependency).

If your helper imports `@nestjs/...`, it probably belongs in `core/` or in
the feature module's `infrastructure/` folder.

## Complexity And Risk

- Low complexity in isolation — each file is small and pure.
- Changes are still high blast radius: every layer can import shared.
- Be cautious about adding new constants; prefer extending an existing registry
  (`Errors`, `Responses`) over creating a new top-level file.
- Cache keys are encoded as functions (`CACHE_KEYS.USER(id)`); never hand-roll
  raw cache key strings in feature code — namespace collisions are easy and
  silent.
- Encryption key (`IMAGE_ENCRYPTION_KEY`) rotation breaks existing ciphertext.
  Plan a migration before rotating in production.
