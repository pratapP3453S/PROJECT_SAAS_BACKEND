# Docker Commands Reference

Complete list of all available Docker commands and what they do.

---

## pnpm Scripts (Recommended)

These are the primary commands you'll use:

### Build & Start

```bash
pnpm run docker:dev:build
# Builds dev image and starts all dev containers
# Mounts code for hot reload
# Runs migrations
# Use: First time on local machine

pnpm run docker:stg:build
# Builds production image and starts staging containers
# Compiles code
# Enables auto-restart
# Use: First time on VPS or when dependencies change

pnpm run docker:prod:build
# Builds production image and starts production containers
# Compiles code, strict limits
# Enables auto-restart
# Use: First time on VPS or when dependencies change
```

### Start Existing (No Build)

```bash
pnpm run docker:dev
# Starts dev containers without rebuilding
# Use: When containers already exist

pnpm run docker:stg
# Starts staging containers without rebuilding
# Use: When containers already exist

pnpm run docker:prod
# Starts production containers without rebuilding
# Use: When containers already exist
```

### Stop

```bash
pnpm run docker:down
# Stops all containers but keeps volumes/data
# Use: When taking a break or stopping work

pnpm run docker:down:v
# Stops all containers AND removes all volumes
# WARNING: This deletes your database data!
# Use: When you want a completely fresh start
```

---

## Manual Docker Compose Commands

If pnpm scripts don't work, use these directly:

### Development

```bash
# Build and start
docker compose --env-file .env.dev -f docker-compose.yml -f docker-compose.dev.yml up --build

# Start without build
docker compose --env-file .env.dev -f docker-compose.yml -f docker-compose.dev.yml up -d

# Stop
docker compose --env-file .env.dev -f docker-compose.yml -f docker-compose.dev.yml down
```

### Staging

```bash
# Build and start
docker compose --env-file .env.stg -f docker-compose.yml -f docker-compose.stg.yml up -d --build

# Start without build
docker compose --env-file .env.stg -f docker-compose.yml -f docker-compose.stg.yml up -d

# Stop
docker compose --env-file .env.stg -f docker-compose.yml -f docker-compose.stg.yml down
```

### Production

```bash
# Build and start
docker compose --env-file .env.prod -f docker-compose.yml -f docker-compose.prod.yml up -d --build

# Start without build
docker compose --env-file .env.prod -f docker-compose.yml -f docker-compose.prod.yml up -d

# Stop
docker compose --env-file .env.prod -f docker-compose.yml -f docker-compose.prod.yml down
```

---

## Container Management

### View Containers

```bash
docker ps
# Lists running containers
# Example output:
# CONTAINER ID   IMAGE              NAMES           STATUS
# abc123         nestjs:dev         app_dev         Up 2 hours
# def456         postgres:16        postgres_dev    Up 2 hours

docker ps -a
# Lists all containers (including stopped)

docker ps --filter "name=app"
# Lists containers matching pattern
```

### Logs

```bash
docker logs app_dev
# View all logs from a container

docker logs app_dev -f
# Follow logs in real-time (Ctrl+C to exit)

docker logs app_dev --tail 50
# Show last 50 lines

docker logs app_dev -f --tail 100
# Follow last 100 lines

docker logs app_stg app_prod
# View logs from multiple containers
```

### Execute Commands in Container

```bash
docker exec -it postgres_dev psql -U postgres -d nestjs_dev
# Connect to PostgreSQL shell

docker exec -it redis_dev redis-cli
# Connect to Redis CLI

docker exec -it app_dev bash
# Open bash shell in app container

docker exec app_dev pnpm run prisma:migrate
# Run migrations
```

### Stop/Start Individual Containers

```bash
docker stop app_dev
# Stop a container (graceful)

docker start app_dev
# Start a stopped container

docker restart app_dev
# Restart a container

docker kill app_dev
# Kill a container (force stop)

docker rm app_dev
# Remove a container (must be stopped first)
```

---

## Database Operations

### PostgreSQL

```bash
# Connect to database
docker exec -it postgres_dev psql -U postgres -d db_dev

# Common psql commands inside psql shell:
\dt              # List tables
\l               # List databases
SELECT * FROM "User";  # Query table
\q               # Quit

# Dump database
docker exec postgres_dev pg_dump -U postgres db_dev > backup.sql

# Restore from backup
docker exec -i postgres_dev psql -U postgres db_dev < backup.sql
```

### Redis

```bash
# Connect to Redis
docker exec -it redis_dev redis-cli

# Common Redis commands inside redis-cli:
PING             # Test connection
KEYS *           # List all keys
GET key_name     # Get value
DEL key_name     # Delete key
FLUSHDB          # Clear database
INFO             # Show stats
EXIT             # Quit

# With password
docker exec -it redis_stg redis-cli -a "password"
```

### Prisma

```bash
# Generate Prisma client
pnpm run prisma:generate

# Run migrations (development)
pnpm run prisma:migrate

# Deploy migrations (production)
pnpm run prisma:migrate:prod

# View Prisma Studio
pnpm run prisma:studio

# Reset database (WARNING: deletes data!)
pnpm run prisma:reset

# Seed database
pnpm run prisma:seed
```

---

## Image Management

```bash
docker images
# Lists all Docker images

docker image ls nestjs
# Lists NestJS images

docker rmi image_id
# Remove an image

docker build -t myimage:latest .
# Build an image

docker tag nestjs:dev myregistry/myimage:latest
# Tag an image for registry
```

---

## Volume Management

```bash
docker volume ls
# Lists all volumes

docker volume inspect volume_name
# Shows volume details

docker volume rm volume_name
# Remove a volume

docker volume prune
# Remove unused volumes

docker volume prune -a
# Remove all unused volumes
```

---

## Network Management

```bash
docker network ls
# Lists all networks

docker network inspect app_net
# Shows network details

docker network connect app_net container_name
# Connect container to network

docker network disconnect app_net container_name
# Disconnect container from network
```

---

## System Management

```bash
docker ps
# List running containers

docker stats
# View resource usage (CPU, memory)
# Press Ctrl+C to exit

docker version
# Show Docker version

docker info
# Show Docker system info

docker system df
# Show disk usage

docker system prune
# Remove unused images/containers/networks

docker system prune -a
# Remove all unused resources
```

---

## Useful One-Liners

```bash
# Restart all containers
docker restart $(docker ps -q)

# Stop all containers
docker stop $(docker ps -q)

# Remove all stopped containers
docker container prune -f

# See resource usage
docker stats --no-stream

# Connect to dev database
docker exec -it postgres_dev psql -U postgres -d db_dev

# Tail logs from all containers
docker logs $(docker ps -q) -f

# Show all environment variables in a container
docker exec app_dev env

# Copy file from container
docker cp app_dev:/app/dist/main.js ./main.js

# Copy file to container
docker cp ./myfile app_dev:/app/myfile
```

---

## Common Workflow

### Development Cycle
```bash
# 1. Start dev
pnpm run docker:dev:build

# 2. Edit code and watch reload
# (changes auto-reload in container)

# 3. Monitor logs
docker logs app_dev -f

# 4. Test via API
curl http://localhost:5000/health

# 5. Stop when done
pnpm run docker:down
```

### Staging Deployment
```bash
# 1. Build staging
pnpm run docker:stg:build

# 2. Verify
curl http://localhost:5005/health

# 3. Monitor
docker logs app_stg -f

# 4. Update code
git pull origin staging
pnpm run docker:stg:build

# 5. Test
curl http://localhost:5005/health
```

### Production Deployment
```bash
# 1. Backup (IMPORTANT!)
docker exec postgres_prod pg_dump -U prod_user nestjs_prod > backup.sql

# 2. Deploy
git pull origin main
pnpm run docker:prod:build

# 3. Verify
curl http://localhost:5010/health

# 4. Monitor logs
docker logs app_prod -f

# 5. If issue: ROLLBACK
docker compose -f docker-compose.yml -f docker-compose.prod.yml down
git reset --hard HEAD~1
pnpm run docker:prod:build
```

---

## Quick Reference Card

| Task | Command |
|------|---------|
| Start dev | `pnpm run docker:dev:build` |
| Start staging | `pnpm run docker:stg:build` |
| Start production | `pnpm run docker:prod:build` |
| Stop all | `pnpm run docker:down` |
| View containers | `docker ps` |
| View logs | `docker logs app_dev -f` |
| Connect to DB | `docker exec -it postgres_dev psql -U postgres` |
| Redis CLI | `docker exec -it redis_dev redis-cli` |
| Resource usage | `docker stats` |
| Backup DB | `docker exec postgres_prod pg_dump ... > backup.sql` |

---

See [TROUBLESHOOTING.md](TROUBLESHOOTING.md) for help if something goes wrong.

