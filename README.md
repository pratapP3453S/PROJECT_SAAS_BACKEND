# NestJS Enterprise Template

A production-ready, enterprise-level NestJS backend template featuring a clean layered architecture (Controller → Service → Repository), full dependency injection, Prisma 7 ORM with PostgreSQL, BullMQ for background jobs, Swagger documentation, Docker support, and a standardized JSON API.

---

## Tech Stack

| Layer           | Technology                          |
| --------------- | ----------------------------------- |
| Framework       | NestJS 10                           |
| Language        | TypeScript 5                        |
| ORM             | Prisma 7 + PostgreSQL 16            |
| Auth            | JWT (access + refresh tokens)       |
| Validation      | class-validator + class-transformer |
| Queue           | BullMQ + Bull + Redis 7             |
| Cache           | cache-manager (Redis-ready)         |
| File Processing | Sharp (WebP conversion) + Multer    |
| Encryption      | AES-256-CBC (sensitive files)       |
| API Docs        | Swagger / OpenAPI 3                 |
| Rate Limiting   | @nestjs/throttler                   |
| Logging         | NestJS Logger + morgan              |
| Container       | Docker + Docker Compose             |
| Package Manager | pnpm 9                              |
| Testing         | Jest + Supertest                    |

---

## Project Structure

```
├── Dockerfile                         # Multi-stage (base → deps → builder → dev → prod)
├── docker-compose.yml                 # Development: app + postgres + redis + bullmq
├── docker-compose.prod.yml            # Production: same stack, hardened config
├── docker/
│   ├── entrypoint.prod.sh             # Production entrypoint (migrate → start)
│   └── postgres/
│       └── init.sql                   # First-run DB initialization (extensions)
├── prisma/
│   ├── schema.prisma                  # generator + datasource block
│   ├── schema/                        # Multi-file schema (Prisma 7+)
│   │   ├── enums.prisma               # Shared enums: Role, UserStatus, UploadStatus
│   │   ├── user.schema.prisma         # User model
│   │   ├── upload.schema.prisma       # Upload model
│   │   ├── audit-log.schema.prisma    # AuditLog model
│   │   └── idempotency.schema.prisma  # IdempotencyRecord model
│   └── seed.ts
├── prisma.config.ts                   # Prisma 7 config: schema dir + migrations path
└── src/
    ├── main.ts                        # Bootstrap: helmet, CORS, compression, Swagger
    ├── app.module.ts                  # Root module — global guards, filters, interceptors
    ├── config/                        # Typed config namespaces (registerAs)
    ├── common/                        # Cross-cutting (no business logic)
    │   ├── constants/                 # app, error, http, response constants
    │   ├── decorators/                # @CurrentUser, @Public, @Roles, @ApiPaginatedResponse
    │   ├── dto/                       # PaginationDto
    │   ├── errors/                    # ApiError (extends HttpException + factory methods)
    │   ├── filters/                   # AllExceptionsFilter → structured JSON error
    │   ├── guards/                    # JwtAuthGuard, RolesGuard
    │   ├── interceptors/              # IdempotencyInterceptor, ResponseInterceptor, LoggingInterceptor
    │   ├── interfaces/                # JwtPayload, AuthenticatedRequest, Pagination
    │   ├── middleware/                # LoggerMiddleware, SanitizeMiddleware (XSS)
    │   ├── pipes/                     # AppValidationPipe → structured field errors
    │   ├── responses/                 # ApiResponse.fromDefinition / buildSuccess / buildPaginated
    │   └── types/                     # Nullable<T>, DeepPartial<T>, etc.
    ├── database/
    │   ├── prisma/                    # PrismaModule (@Global) + PrismaService (adapter-pg)
    │   └── repositories/             # BaseRepository<T> — generic CRUD + pagination
    ├── lib/                           # multer.lib, redis.lib
    ├── shared/                        # @Global() shared services + utils
    │   ├── services/                  # CacheService, EncryptionService
    │   └── utils/                     # date, encryption, pagination, sanitize
    ├── jobs/                          # BullMQ infrastructure
    │   ├── queues/                    # EmailQueue (injectable producer)
    │   ├── processors/               # EmailProcessor (@Processor + lifecycle hooks)
    │   └── jobs.module.ts
    └── modules/                       # Feature modules (loosely coupled, DI)
        ├── auth/                      # register, login, refresh, logout + JWT strategy
        ├── user/                      # CRUD + cache layer
        ├── upload/                    # Sharp → WebP + AES-256 for sensitive types
        └── health/                    # /health + /health/ping (Terminus)
```

---

## Quick Start

### Option A — Local (no Docker)

#### Prerequisites

- Node.js ≥ 20
- pnpm ≥ 9 (`pnpm i -g pnpm`)
- PostgreSQL ≥ 16 running locally
- Redis ≥ 6 running locally

```bash
# 1. Install dependencies
pnpm install

# 2. Configure environment
cp .env.example .env
# → Edit .env: set DATABASE_URL, JWT_SECRET, JWT_REFRESH_SECRET, IMAGE_ENCRYPTION_KEY

# 3. Database setup
pnpm prisma:generate          # Generate Prisma client
pnpm prisma:migrate           # Run migrations
pnpm prisma:seed              # Create default users

# 4. Start dev server
pnpm start:dev
```

### Option B — Docker dev environment

#### Prerequisites

- Docker ≥ 24
- Docker Compose v2 (`docker compose version`)

```bash
# 1. Configure environment
cp .env.example .env
# → Edit .env: set JWT_SECRET, JWT_REFRESH_SECRET, IMAGE_ENCRYPTION_KEY at minimum
# → DATABASE_URL and REDIS_HOST are overridden by docker-compose to use service hostnames

# 2. Start dev stack (app + postgres + redis)
docker compose --env-file .env -f docker-compose.yml -f docker-compose.dev.yml up

# 3. (First run only) Seed the database
docker compose exec app pnpm prisma:seed
```

**Dev endpoints:**
| URL | Description |
|-----|-------------|
| `http://localhost:5001/api/v1` | REST API (port from `PORT` in `.env`) |
| `http://localhost:5001/docs` | Swagger UI |
| `http://localhost:5001/health/ping` | Health check |
| `http://localhost:5432` | PostgreSQL (exposed to host for local tooling) |
| `http://localhost:6379` | Redis (exposed to host for local tooling) |

---

## Docker Reference

### Compose File Pattern

The project uses a **base + environment override** pattern. Never use `docker-compose.yml` directly — always merge it with an environment-specific override:

```
docker-compose.yml            ← base: shared service definitions
  ├── docker-compose.dev.yml  ← dev overrides: hot-reload, all ports exposed, reads .env
  ├── docker-compose.stg.yml  ← stg overrides: prod image, 127.0.0.1 ports, reads .env.stg
  └── docker-compose.prod.yml ← prod overrides: prod image, 127.0.0.1 ports, reads .env.prod
```

### File Overview

| File                       | Purpose                                                                   |
| -------------------------- | ------------------------------------------------------------------------- |
| `Dockerfile`               | Multi-stage build with `development` and `production` targets             |
| `docker-compose.yml`       | Base service definitions — **do not use directly**                        |
| `docker-compose.dev.yml`   | Development overrides — hot-reload, host-exposed ports                    |
| `docker-compose.stg.yml`   | Staging overrides — production image, resource limits                     |
| `docker-compose.prod.yml`  | Production overrides — production image, resource limits                  |
| `.dockerignore`            | Excludes `node_modules`, `dist`, `.env*` from build context               |
| `docker/postgres/init.sql` | Runs once on first DB container creation — enables `uuid-ossp`, `pg_trgm` |

### Dockerfile Stages

```
base        ← Node 20 Alpine + pnpm corepack + non-root user (nestjs:nodejs)
  └── deps          ← pnpm install --frozen-lockfile (all deps)
  │     └── development  ← source copy + prisma:generate → hot-reload via nest start --watch
  └── prod-deps     ← pnpm install --frozen-lockfile --prod (no devDeps)
  └── builder       ← full source + prisma:generate + nest build → dist/
        └── production  ← prod-deps + .prisma client + dist/   [minimal runtime image]
```

### Environment Comparison

|                       | Dev                   | Staging                  | Production                |
| --------------------- | --------------------- | ------------------------ | ------------------------- |
| Env file              | `.env`                | `.env.stg`               | `.env.prod`               |
| Dockerfile target     | `development`         | `production`             | `production`              |
| Port                  | `5001` (from `.env`)  | `5012` (from `.env.stg`) | `5011` (from `.env.prod`) |
| Container restart     | `unless-stopped`      | `always`                 | `always`                  |
| Ports exposed         | all (host-accessible) | `127.0.0.1` only         | `127.0.0.1` only          |
| Resource limits       | none                  | CPU 1.0 / RAM 512M       | CPU 1.0 / RAM 512M        |
| Log rotation          | none                  | 10 MB × 3 files          | 10 MB × 3 files           |
| Redis password        | optional              | required                 | required                  |
| Redis AOF persistence | no                    | yes                      | yes                       |
| Swagger UI            | enabled               | enabled                  | **disabled**              |
| Log level             | `debug`               | `info`                   | `warn`                    |

### Migration Strategy

Migrations run automatically via a **`migrator` service** that starts before the app:

```
migrator  ← builds from `builder` stage
           → runs `prisma migrate deploy`
           → exits (service_completed_successfully)
app        ← starts only after migrator exits successfully
```

No manual migration step needed on deploy — just start the stack.

### Scripts Reference

```bash
# ─── Development (no shortcut — uses raw docker compose) ────────────
docker compose --env-file .env \
  -f docker-compose.yml -f docker-compose.dev.yml up            # Start (foreground)

docker compose --env-file .env \
  -f docker-compose.yml -f docker-compose.dev.yml up --build    # Force rebuild

# ─── Staging ─────────────────────────────────────────────────────────
pnpm docker:stg              # Start staging stack (detached)
pnpm docker:stg:build        # Rebuild images then start

# ─── Production ──────────────────────────────────────────────────────
pnpm docker:prod             # Start production stack (detached)
pnpm docker:prod:build       # Rebuild images then start

# ─── All environments ─────────────────────────────────────────────────
pnpm docker:down             # Stop containers (keep volumes)
pnpm docker:down:v           # Stop containers + wipe volumes

# ─── Useful one-offs ─────────────────────────────────────────────────
docker compose logs -f app                              # Stream app logs
docker compose exec app sh                              # Shell into app
docker compose exec postgres psql -U postgres -d nestjs_db   # Postgres CLI
```

### Environment File Setup

```bash
# Development — copy example, edit secrets
cp .env.example .env

# Staging — already provided at .env.stg
# → Change these before deploying:
#   POSTGRES_PASSWORD, JWT_SECRET, JWT_REFRESH_SECRET, IMAGE_ENCRYPTION_KEY, REDIS_PASSWORD, CORS_ORIGINS

# Production — already provided at .env.prod
# → Change these before deploying:
#   POSTGRES_PASSWORD, JWT_SECRET, JWT_REFRESH_SECRET, IMAGE_ENCRYPTION_KEY, REDIS_PASSWORD, CORS_ORIGINS
```

> **Never commit `.env`, `.env.stg`, or `.env.prod` to version control.** They contain real credentials. Only `.env.example` is committed.

### First Deploy Checklist

```bash
# 1. Fill in real secrets in .env.prod (or .env.stg)
# 2. Start the stack — migrator runs automatically
pnpm docker:prod:build

# 3. Seed default users (first deploy only)
docker compose --env-file .env.prod \
  -f docker-compose.yml -f docker-compose.prod.yml \
  exec app pnpm prisma:seed
```

> **Production security notes:**
>
> - PostgreSQL binds to `127.0.0.1:5432` — not publicly accessible
> - Redis binds to `127.0.0.1:6379` — not publicly accessible
> - Swagger UI is disabled (`SWAGGER_ENABLED=false` in `.env.prod`)
> - All services have CPU and memory resource limits

---

## Database Schema

### Naming Conventions

| Layer               | Convention                 | Example                    |
| ------------------- | -------------------------- | -------------------------- |
| Prisma model fields | `camelCase`                | `firstName`, `createdAt`   |
| PostgreSQL columns  | `snake_case` (via `@map`)  | `first_name`, `created_at` |
| PostgreSQL tables   | `snake_case` (via `@@map`) | `users`, `audit_logs`      |
| PostgreSQL indexes  | `idx_{table}_{column}`     | `idx_users_deleted_at`     |

### Schema Files

```
prisma/
├── schema.prisma                  ← generator + datasource block
└── schema/
    ├── enums.prisma               ← Role, UserStatus, UploadStatus
    ├── user.schema.prisma         ← users table
    ├── upload.schema.prisma       ← uploads table
    ├── audit-log.schema.prisma    ← audit_logs table (append-only)
    └── idempotency.schema.prisma  ← idempotency_records table
```

Connection URL and migrations path are managed in [prisma.config.ts](prisma.config.ts):

```ts
export default defineConfig({
  schema: 'prisma/',
  migrations: { path: 'prisma/migrations' },
  datasource: { url: env('DATABASE_URL') },
});
```

At runtime, `PrismaService` constructs the client with `@prisma/adapter-pg`:

```ts
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
new PrismaClient({ adapter });
```

---

## Architecture Deep Dive

### Request Lifecycle

Every incoming request passes through this pipeline in order:

```
HTTP Request
  │
  ├─ 1. Middleware
  │     ├── LoggerMiddleware  — morgan-style request/response line to stdout
  │     └── SanitizeMiddleware — XSS-strips req.body / req.query / req.params via `xss`
  │
  ├─ 2. Guards (global, via APP_GUARD)
  │     ├── ThrottlerGuard — 3-tier rate limiting: 10/s · 50/10s · 100/min
  │     ├── JwtAuthGuard   — validates Bearer token via JwtStrategy; @Public() bypasses
  │     └── RolesGuard     — checks @Roles() decorator; no-op if no roles required
  │
  ├─ 3. Interceptors (global, via APP_INTERCEPTOR)
  │     ├── IdempotencyInterceptor — deduplicates POST via key+hash (see Idempotency)
  │     └── LoggingInterceptor    — logs method/url/statusCode/duration
  │
  ├─ 4. Pipes
  │     └── AppValidationPipe — class-validator DTO validation; emits FieldError[] on failure
  │
  ├─ 5. Controller → Service → Repository
  │
  └─ 6. Filters (on exception)
        └── AllExceptionsFilter — catches any thrown error; shapes it into the error envelope
```

### Response & Error Patterns

Both responses and errors are driven by centralized constant registries — no magic strings in controllers:

```typescript
// Errors   → src/common/constants/error.constants.ts
throw ApiError.fromDefinition(Errors.FILE_NOT_FOUND);
throw ApiError.fromDefinition(Errors.USER_NOT_FOUND, { details: 'Extra context here' });

// Responses → src/common/constants/response.constants.ts
return AppResponse.fromDefinition(Responses.FILE_UPLOADED, result);

// Paginated (pass PaginationMeta as 3rd arg)
return AppResponse.fromDefinition(Responses.USERS_FETCHED, result.items, result.meta);
```

**Success envelope:**

```json
{ "success": true, "statusCode": 200, "message": "...", "data": {}, "timestamp": "..." }
```

**Error envelope:**

```json
{
  "success": false,
  "statusCode": 422,
  "error": { "name": "...", "code": "ERR_...", "message": "...", "fields": [] },
  "timestamp": "..."
}
```

### Dependency Injection Flow

```
AppModule (global guards + filters)
  ├── PrismaModule (@Global) ──→ PrismaService (adapter-pg) — available everywhere
  ├── SharedModule (@Global) ──→ CacheService, EncryptionService — available everywhere
  └── FeatureModule
        ├── Controller  ←── injects Service
        ├── Service     ←── injects Repository + CacheService
        └── Repository  ←── injects PrismaService (extends BaseRepository<T>)
```

### BaseRepository\<T\>

All feature repositories extend `BaseRepository<T>` which provides:

| Method                     | Description                                         |
| -------------------------- | --------------------------------------------------- |
| `findById(id)`             | Find one by UUID; throws `ERR_NOT_FOUND` if missing |
| `findMany(where, options)` | Filtered list with optional sorting                 |
| `create(data)`             | Insert + return created record                      |
| `update(id, data)`         | Update by ID + return updated record                |
| `softDelete(id)`           | Sets `deletedAt = NOW()` — record is retained in DB |
| `paginate(query, where)`   | Returns `{ items, meta: PaginationMeta }`           |

`PaginationMeta` shape: `{ page, limit, total, totalPages, hasNextPage, hasPreviousPage }`

### Auth Flow

```
POST /auth/register → hash password (bcrypt) → create User → issue access + refresh tokens
POST /auth/login    → verify password → check account status → issue tokens → record lastLoginAt
POST /auth/refresh  → decode refresh JWT (no verify) → load user → bcrypt-compare stored hash
                      → rotate: issue new pair, hash + store new refresh token
POST /auth/logout   → set refreshToken = null in DB (invalidates all refresh-based sessions)
```

**Token details:**

- `accessToken` — short-lived JWT signed with `JWT_SECRET`; carries `{ sub, email, role }`
- `refreshToken` — longer-lived JWT signed with `JWT_REFRESH_SECRET`; bcrypt hash stored in DB
- `JwtStrategy` validates the access token and populates `req.user` as `AuthenticatedUser`
- `@CurrentUser()` decorator extracts `req.user` in controllers

### Role Hierarchy

```
SUPER_ADMIN  →  full access (including DELETE /users/:id)
  ADMIN      →  user management (GET/PATCH /users, GET /users/:id)
    USER     →  own profile only (GET/PATCH /users/me)
```

Roles are enforced by `RolesGuard` reading `@Roles(Role.ADMIN, Role.SUPER_ADMIN)` metadata set on controller routes.

### Upload — Two-Stage Lifecycle

```
Stage 1 — POST /upload/:type
  Multer writes raw file to uploads/temp/
  → Sharp: rotate → resize(≤1024px) → WebP(q=80)
  → isSensitiveType? → AES-256-CBC encrypt buffer
  → storageProvider.saveTemp() → returns { tempUrl, serverFileName, ... }
  Caller: save DB record with tempUrl

Stage 2 — POST /upload/commit
  Caller sends { filename, type }
  → storageProvider.commitToPermanent() — moves temp → uploads/{type}/
  → returns { permanentUrl, serverFileName }
  Caller: update DB record tempUrl → permanentUrl

DELETE /upload/remove — deletes from storage by URL (idempotent — returns false if missing)
```

**Sensitive types** (AES-256-CBC encrypted on disk): `aadhar`, `identity`, `document`, `passport`

### Idempotency

All `POST` endpoints are protected by `IdempotencyInterceptor` (global `APP_INTERCEPTOR`):

| Mode         | Header                    | Behaviour                                             | TTL  |
| ------------ | ------------------------- | ----------------------------------------------------- | ---- |
| Client-keyed | `Idempotency-Key: <uuid>` | Same key + same body → replay original response       | 24 h |
| Hash-only    | _(none)_                  | Same body within window → `409 ERR_DUPLICATE_REQUEST` | 30 s |

The request fingerprint is `SHA-256(method:path:stableJSON(body))`. Records are stored in the `idempotency_records` table.

### CacheService

`CacheService` (from `SharedModule`, globally available) wraps `cache-manager` with Redis:

```typescript
await cacheService.get<User>('user:123');
await cacheService.set('user:123', user, 3600); // TTL in seconds
await cacheService.del('user:123');
```

Used by `UserService` to cache profile lookups and invalidate on update/delete.

### Adding a New Module

```bash
mkdir src/modules/product
# Create: product.module.ts, product.controller.ts, product.service.ts,
#         product.repository.ts (extends BaseRepository<Product>),
#         dto/create-product.dto.ts, dto/update-product.dto.ts,
#         interfaces/product.interface.ts
# Register in app.module.ts → imports: [..., ProductModule]

# Add Prisma model in prisma/schema/product.schema.prisma
# Run: pnpm prisma:migrate

# Add response constants in src/common/constants/response.constants.ts
# Add error constants   in src/common/constants/error.constants.ts
```

### Adding a Background Job

```typescript
// 1. src/common/constants/app.constants.ts — add to QUEUE_NAMES + JOB_NAMES
// 2. src/jobs/jobs.module.ts — add BullModule.registerQueue({ name: QUEUE_NAMES.MY_QUEUE })
// 3. src/jobs/processors/my.processor.ts — @Processor(QUEUE_NAMES.MY_QUEUE)
// 4. src/jobs/queues/my.queue.ts        — @InjectQueue(QUEUE_NAMES.MY_QUEUE)
// 5. Inject MyQueue into your service and call myQueue.add(...)
```

---

## Environment Variables

| Variable               | Required | Default       | Description                                        |
| ---------------------- | -------- | ------------- | -------------------------------------------------- |
| `DATABASE_URL`         | ✅       | —             | PostgreSQL connection string                       |
| `JWT_SECRET`           | ✅       | —             | JWT signing secret (≥32 chars)                     |
| `JWT_REFRESH_SECRET`   | ✅       | —             | Refresh token secret (≥32 chars)                   |
| `IMAGE_ENCRYPTION_KEY` | ✅       | —             | AES-256 key for sensitive files (exactly 32 chars) |
| `POSTGRES_USER`        | Docker   | `postgres`    | DB username (used by docker-compose)               |
| `POSTGRES_PASSWORD`    | Docker   | `postgres`    | DB password                                        |
| `POSTGRES_DB`          | Docker   | `nestjs_db`   | Database name                                      |
| `PORT`                 | ❌       | `5001`        | HTTP port                                          |
| `NODE_ENV`             | ❌       | `development` | `development\|production\|test`                    |
| `REDIS_HOST`           | ❌       | `localhost`   | Redis host (`redis` inside Docker)                 |
| `REDIS_PASSWORD`       | ❌       | ``            | Redis password (required in stg/prod)              |
| `SWAGGER_ENABLED`      | ❌       | `true`        | Enable/disable Swagger UI (`false` in prod)        |

See [.env.example](.env.example) for the full list.

---

## Default Seeded Users

| Email                    | Password    | Role          |
| ------------------------ | ----------- | ------------- |
| `superadmin@example.com` | `Admin@123` | `SUPER_ADMIN` |
| `admin@example.com`      | `Admin@123` | `ADMIN`       |
| `user@example.com`       | `User@123`  | `USER`        |

---

## Scripts

```bash
# ─── Development ────────────────────────────────────────────────────
pnpm start:dev           # Hot-reload dev server
pnpm start:debug         # Debug mode
pnpm build               # Compile TypeScript → dist/
pnpm lint                # ESLint with auto-fix
pnpm format              # Prettier format

# ─── Testing ────────────────────────────────────────────────────────
pnpm test                # Unit tests
pnpm test:watch          # Watch mode
pnpm test:cov            # Coverage report
pnpm test:e2e            # End-to-end tests

# ─── Prisma ─────────────────────────────────────────────────────────
pnpm prisma:generate     # Generate Prisma client
pnpm prisma:migrate      # Create + apply dev migration
pnpm prisma:migrate:prod # Apply migrations (production — no prompt)
pnpm prisma:seed         # Seed default users
pnpm prisma:studio       # Open Prisma Studio (GUI)
pnpm prisma:reset        # Drop all tables + re-migrate (dev only)

# ─── Docker (dev — no pnpm shortcut) ────────────────────────────────
docker compose --env-file .env \
  -f docker-compose.yml -f docker-compose.dev.yml up            # Start dev
docker compose --env-file .env \
  -f docker-compose.yml -f docker-compose.dev.yml up --build    # Rebuild + start dev

# ─── Docker (staging/prod — pnpm shortcuts) ──────────────────────────
pnpm docker:stg              # Start staging (detached)
pnpm docker:stg:build        # Rebuild + start staging
pnpm docker:prod             # Start production (detached)
pnpm docker:prod:build       # Rebuild + start production
pnpm docker:down             # Stop containers (keep volumes)
pnpm docker:down:v           # Stop containers + wipe volumes
```

---

## License

MIT
