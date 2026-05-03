# Docker Developer Guide

## Purpose

The `docker` folder and compose files define local, staging, and production container behavior for the NestJS API, PostgreSQL, Redis, and migrations.

## Compose Flow

The project uses a base compose file plus environment override:

- `docker-compose.yml`: shared services.
- `docker-compose.dev.yml`: development overrides.
- `docker-compose.stg.yml`: staging overrides.
- `docker-compose.prod.yml`: production overrides.

Use the base file with exactly one environment override.

## Startup Flow

1. Compose builds the app image using the target for the selected environment.
2. PostgreSQL and Redis start.
3. The migrator service runs `prisma migrate deploy`.
4. The app starts only after migration succeeds.
5. In production, `docker/entrypoint.prod.sh` handles production startup behavior.

## Key Files

- `Dockerfile`: multi-stage Node image.
- `docker/entrypoint.prod.sh`: production container entrypoint.
- `docker/postgres/init.sql`: first-run PostgreSQL initialization.
- `docker-compose*.yml`: environment-specific service wiring.

## Dependencies

- `.env`, `.env.stg`, or `.env.prod` provide runtime settings.
- PostgreSQL stores application data.
- Redis backs queues and, when configured, cache.
- Prisma migrations must be valid before app startup.

## Complexity And Risk

- Medium complexity.
- Highest-risk area: environment-specific overrides. Check which compose files are combined before debugging ports, volumes, or credentials.
- Staging and production bind database and Redis ports to localhost for safer host exposure.
- Do not commit real secrets in environment files.
- Migrator failure should stop the app from starting; this prevents booting against an unexpected schema.

## Changing Container Behavior

1. Identify whether the change is base behavior or environment-specific.
2. Update the smallest compose file that owns that behavior.
3. Keep staging and production hardening aligned unless there is a deliberate reason to differ.
4. Update root README and this guide when startup or deployment commands change.

