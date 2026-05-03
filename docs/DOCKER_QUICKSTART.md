# Docker Quickstart Guide

Simple, enterprise-ready Docker setup for **dev**, **staging**, and **production** environments.

## Quick Start (Copy & Paste)

### Development (Local Machine - Hot Reload)
```bash
pnpm run docker:dev:build        # First time
pnpm run docker:dev              # Subsequent times
curl http://localhost:5000/health
docker logs app_dev -f          # Watch logs
```

### Staging (VPS - Production-like)
```bash
pnpm run docker:stg:build        # First time
pnpm run docker:stg              # Subsequent times
curl http://localhost:5005/health
docker logs app_stg -f
```

### Production (VPS - Optimized)
```bash
pnpm run docker:prod:build       # First time
pnpm run docker:prod             # Subsequent times
curl http://localhost:5010/health
docker logs app_prod -f
```

## Environment Files

Each environment has its own `.env.*` file with appropriate credentials and settings:

- **`.env.dev`** — Development (weak passwords OK, debug logging, hot reload)
- **`.env.stg`** — Staging (strong passwords, info logging, auto-restart)
- **`.env.prod`** — Production (very strong passwords, warn logging, strict limits)

## Ports Reference

| Environment | App | Database | Redis |
|---|---|---|---|
| **Dev** | 5000 | 5400 | 6300 |
| **Staging** | 5005 | 5435 | 6385 |
| **Production** | 5010 | 5430 | 6379 |

## Key Features by Environment

### Development
- ✅ Hot reload enabled
- ✅ Debug logging
- ✅ Swagger API docs
- ✅ All ports exposed
- ✅ Code mounted as volume

### Staging
- ✅ Production-like build
- ✅ Resource limits (1 CPU, 512MB)
- ✅ Auto-restart on failure
- ✅ Strong credentials
- ✅ Info-level logging

### Production
- ✅ Optimized build
- ✅ Strict limits (2 CPU, 1GB)
- ✅ Auto-restart on failure
- ✅ Very strong credentials
- ✅ Warning-level logging only
- ✅ Swagger disabled

## Database Access

```bash
# Development
docker exec -it postgres_dev psql -U postgres -d nestjs_dev

# Staging
docker exec -it postgres_stg psql -U stg_user -d nestjs_stg

# Production
docker exec -it postgres_prod psql -U prod_user -d nestjs_prod
```

## Stop All Containers

```bash
pnpm run docker:down              # Stop (keep volumes)
pnpm run docker:down:v            # Stop and remove volumes
```

## Next Steps

- See [SETUP_GUIDE.md](SETUP_GUIDE.md) for detailed step-by-step instructions
- See [ENV_CONFIGURATION.md](ENV_CONFIGURATION.md) for environment variables
- See [COMMANDS_REFERENCE.md](COMMANDS_REFERENCE.md) for all available commands
- See [TROUBLESHOOTING.md](TROUBLESHOOTING.md) if something goes wrong
REDIS_PASSWORD=your-secure-password
JWT_SECRET=your-secure-secret
IMAGE_ENCRYPTION_KEY=your-encryption-key
```

## Common Commands

```bash
# View logs
pnpm docker:dev    # foreground (shows logs)
pnpm docker:stg    # background
docker logs app_stg # view stg app logs
docker logs app_prod # view prod app logs

# Rebuild images
pnpm docker:dev:build
pnpm docker:stg:build
pnpm docker:prod:build

# Stop containers (keeps volumes)
pnpm docker:down

# Stop & remove everything
pnpm docker:down:v

# Shell into running container
docker exec -it app_dev bash
docker exec -it app_stg bash
docker exec -it app_prod bash

# Run Prisma Studio (connects to active DB)
pnpm prisma:studio
```

## Architecture

### Services (All Environments)

- **app** — NestJS application (Dockerfile targets: development/production)
- **migrator** — Prisma migrations (runs once, exits)
- **postgres** — PostgreSQL 16 database
- **redis** — Redis 7 (BullMQ, caching)

### Resource Limits

| Service  | Dev | Staging         | Production     |
| -------- | --- | --------------- | -------------- |
| app      | —   | 1 CPU, 512MB    | 2 CPU, 1GB     |
| postgres | —   | 0.5 CPU, 512MB  | 1 CPU, 1GB     |
| redis    | —   | 0.25 CPU, 128MB | 0.5 CPU, 256MB |

Dev has no limits for flexibility; staging/prod enforce enterprise-grade constraints.

## Troubleshooting

### Port already in use

Development exposes ports locally. If 5432 or 6379 are in use:

```bash
# Find and kill process using port
lsof -i :5432
kill -9 <PID>
```

### Database won't start

```bash
# Reset all volumes (data will be lost)
pnpm docker:down:v
pnpm docker:dev  # fresh start
```

### App won't connect to database

- Check DATABASE_URL in `.env.*` matches postgres service name
- Check POSTGRES_PASSWORD in `.env.*` matches container initialization
- Review `docker logs app_dev` for connection errors

### Migrations failed

```bash
# Manually run migrations
docker exec -it migrator sh -c "node_modules/.bin/prisma migrate deploy"
```

## File Structure

```
docker-compose.yml          ← Shared base services
docker-compose.dev.yml      ← Dev overrides (hot-reload, exposed ports)
docker-compose.stg.yml      ← Staging overrides (resource limits, security)
docker-compose.prod.yml     ← Production overrides (hardened, optimized)

.env.dev        ← Development credentials & settings
.env.stg        ← Staging credentials & settings
.env.prod       ← Production credentials & settings
.env.example    ← Template for new environments
```

## Next Steps

1. Update `.env.dev`, `.env.stg`, `.env.prod` with real credentials
2. Run `pnpm docker:dev` to start development
3. Access app at `http://localhost:3000`
4. Access API docs at `http://localhost:3000/docs`
