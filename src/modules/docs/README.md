# Modules Layer Developer Guide

## Purpose

`src/modules/` holds every business feature. One folder per feature; each
folder follows the same DDD layered layout so you can drop into any feature
and find the same shape.

## Per-feature layout

```
modules/<feature>/
├── domain/
│   ├── entities/       # plain types describing the feature's data
│   ├── interfaces/     # ports (abstract contracts) the application depends on
│   ├── services/       # pure domain rules (no DB / HTTP / network)
│   ├── constants/      # DI tokens, domain-level constants
│   ├── repositories/   # abstract repository interfaces (when used)
│   └── policies/       # authorization / business policies (when used)
│
├── infrastructure/
│   ├── prisma/         # concrete repositories implementing the domain ports
│   ├── jwt/            # Passport strategies, signing helpers
│   ├── mail/           # email senders (Nodemailer, SES, etc.)
│   ├── providers/      # external SDK adapters (S3, Cloudinary, etc.)
│   ├── processors/     # background job consumers
│   └── ...             # other adapters (audit sinks, signing, multer, ...)
│
├── application/
│   ├── use-cases/      # orchestration services (the public surface)
│   ├── commands/       # explicit write operations (when CQRS-flavoured)
│   ├── queries/        # explicit read operations
│   ├── queues/         # producer-side queue services
│   └── dto/            # application DTOs distinct from HTTP DTOs (rare)
│
├── api/
│   ├── v1/
│   │   ├── controllers/    # HTTP route handlers
│   │   ├── dto/            # request DTOs (v1 contract)
│   │   ├── serializers/    # response shapers (when output diverges from entity)
│   │   └── <feature>-v1.module.ts
│   └── common/
│       ├── guards/         # version-agnostic, module-specific guards
│       └── decorators/     # version-agnostic, module-specific decorators
│
└── <feature>.module.ts     # composition root — imports the api/v{n} submodule(s)
```

Folders are optional — only create what the feature needs. A feature with no
custom policies doesn't need an empty `domain/policies/` directory.

## Dependency direction

```
api/v{n}  ──▶ application ──▶ domain
                          ──▶ infrastructure ──▶ domain
```

- `api` depends on `application`.
- `application` depends on `domain` (entities, interfaces) and `infrastructure` (concrete adapters).
- `infrastructure` depends on `domain` (implements its interfaces).
- `domain` depends on nothing inside the module.

No layer ever imports `api/v{n}`. Versioned controllers are leaves.

## API versioning

URI versioning is enabled globally in `main.ts` via
`app.enableVersioning({ type: URI, defaultVersion: '1' })`.

Controllers opt in with:

```ts
@Controller({ path: 'users', version: '1' })
```

Routes become `GET /api/v1/users/me`, `POST /api/v1/auth/login`, etc.

To add a v2: copy `api/v1/` to `api/v2/`, change the controllers'
`version: '2'`, write a `<feature>-v2.module.ts`, and import it from
`<feature>.module.ts` alongside the v1 sub-module. v1 keeps serving its
callers; v2 ships when ready.

Two controllers in this codebase intentionally do NOT version:

- `HealthController` — K8s liveness/readiness probes expect a stable `/health`.
- `LocalDirectUploadController` — signed URLs are bearer credentials minted
  for a specific path; baking a version segment in would invalidate every
  outstanding URL on a version bump.

## Cross-cutting dependencies

Every feature module is affected by root wiring in `AppModule`:

- Global `ThrottlerGuard`, `JwtAuthGuard`, and `RolesGuard`.
- Global `IdempotencyInterceptor` for all non-multipart `POST` requests.
- Global `LoggingInterceptor` and `ResponseInterceptor`.
- Global `AllExceptionsFilter`.
- Global `AppValidationPipe`.
- `PrismaService` (from `PrismaModule`) and `CacheService` (from `CoreCacheModule`).
- `EncryptionService` (from `SharedModule`).

## Adding a new feature module

1. Create `modules/<name>/` with whichever DDD folders the feature needs.
2. Put types in `domain/entities/` and port interfaces in `domain/interfaces/`.
3. Write the concrete repository in `infrastructure/prisma/`.
4. Write the use-case service in `application/use-cases/`.
5. Build the v1 controller + DTOs under `api/v1/`.
6. Wire it all in `api/v1/<name>-v1.module.ts`.
7. Aggregate under `<name>.module.ts`.
8. Import from `AppModule`.
9. Add `docs/README.md`.
10. Extend the `Errors` and `Responses` registries in [shared/constants](../../shared/constants/) if you need new envelope entries.

## Features in this template

| Feature   | Folder                          | What it does                                              |
| --------- | ------------------------------- | --------------------------------------------------------- |
| `auth`    | [auth/](../auth/)               | Registration, login, refresh-token rotation, logout       |
| `user`    | [user/](../user/)               | Profile CRUD + admin user management                      |
| `upload`  | [upload/](../upload/)           | Multi-format file uploads with 5 pluggable storage backends |
| `health`  | [health/](../health/)           | Kubernetes-friendly health and liveness endpoints         |
| `jobs`    | [jobs/](../jobs/)               | BullMQ queues + processors (email, upload, notification)  |
