# Environment Configuration Guide

This guide explains how to configure your NestJS Enterprise application for different environments (development, staging, production).

## Overview

All configurations are now environment-dependent using Docker environment variables. No hardcoded values for container names, volumes, or ports.

## Environment Files

### Development (.env.dev)

- **Purpose**: Local development with all features enabled
- **Database Port**: 5432
- **Redis Port**: 6379
- **Container Names**: app_dev, postgres_dev, redis_dev
- **Bind Address**: localhost (local access only)
- **Features**: Swagger enabled, Debug logging, Hot reload

### Staging (.env.stg)

- **Purpose**: Pre-production testing environment
- **Database Port**: 5435 (different from prod)
- **Redis Port**: 6385 (different from prod)
- **Container Names**: app_stg, postgres_stg, redis_stg
- **Bind Address**: 127.0.0.1 (local access only)
- **Features**: Swagger enabled, Info logging, Resource limits
- **Credentials**: Use different credentials than production

### Production (.env.prod)

- **Purpose**: Live production environment
- **Database Port**: 5432
- **Redis Port**: 6379
- **Container Names**: app_prod, postgres_prod, redis_prod
- **Bind Address**: 127.0.0.1 (local access only)
- **Features**: Swagger disabled, Warning logging, Strict resource limits
- **Credentials**: Use strong, unique credentials
- **Restart Policy**: Always restart on failure

## Key Environment Variables

### Docker Configuration

```env
# Container naming
APP_CONTAINER_NAME=app_dev
POSTGRES_CONTAINER_NAME=postgres_dev
REDIS_CONTAINER_NAME=redis_dev

# Volume naming
POSTGRES_VOLUME_NAME=postgres_dev_data
REDIS_VOLUME_NAME=redis_dev_data

# Project composition name
COMPOSE_PROJECT_NAME=nestjs-enterprise-dev
```

### Database Configuration

```env
# Connection details
POSTGRES_HOST=postgres              # Container hostname
POSTGRES_PORT=5432                  # Port inside container
POSTGRES_BIND_HOST=localhost        # External bind address
POSTGRES_USER=postgres              # Database user
POSTGRES_PASSWORD=***              # Strong password
POSTGRES_DB=nestjs_dev              # Database name

# Full connection string
DATABASE_URL="postgresql://user:pass@host:port/db?schema=public"
```

### Redis Configuration

```env
# Connection details
REDIS_HOST=localhost                # Container hostname
REDIS_PORT=6379                     # Port inside container
REDIS_PASSWORD=***                  # Strong password if set
REDIS_DB=0                          # Database number
REDIS_TTL=3600                      # Default TTL in seconds
REDIS_MAX_MEMORY=128mb              # Memory limit policy
```

## Running Containers

### Development

```bash
# Load development environment
docker-compose --env-file .env.dev -f docker-compose.yml -f docker-compose.dev.yml up -d

# Or use provided script
pnpm run docker:dev:up
```

### Staging

```bash
# Load staging environment
docker-compose --env-file .env.stg -f docker-compose.yml -f docker-compose.stg.yml up -d

# Or use provided script
pnpm run docker:stg:up
```

### Production

```bash
# Load production environment
docker-compose --env-file .env.prod -f docker-compose.yml -f docker-compose.prod.yml up -d

# Or use provided script
pnpm run docker:prod:up
```

## Important Security Notes

### For Production

1. **Change ALL default passwords**:
   - `POSTGRES_PASSWORD`
   - `REDIS_PASSWORD`
   - `JWT_SECRET`
   - `JWT_REFRESH_SECRET`
   - `IMAGE_ENCRYPTION_KEY`

2. **Use strong passwords**:
   - Minimum 32 characters for secrets
   - Mix of uppercase, lowercase, numbers, and symbols
   - Use cryptographically secure random generators

3. **Network Security**:
   - `POSTGRES_BIND_HOST=127.0.0.1` restricts to localhost only
   - Use reverse proxy (Nginx) for external access
   - Enable SSL/TLS for all connections

4. **Environment Variables**:
   - Never commit `.env.prod` to version control
   - Use `.gitignore` to exclude env files
   - Use secure secret management (Vault, AWS Secrets Manager)

### For Development

- Local credentials are acceptable for development
- Swagger API docs are enabled for testing
- Debug logging provides detailed information
- No restart policy (manual restart)

### For Staging

- Intermediate security posture
- Similar to production but with slightly relaxed limits
- Useful for final testing before production
- Different ports to avoid conflicts

## Volume Management

### Persistent Data

```env
# Development volumes
POSTGRES_VOLUME_NAME=postgres_dev_data
REDIS_VOLUME_NAME=redis_dev_data

# Staging volumes
POSTGRES_VOLUME_NAME=postgres_stg_data
REDIS_VOLUME_NAME=redis_stg_data

# Production volumes
POSTGRES_VOLUME_NAME=postgres_prod_data
REDIS_VOLUME_NAME=redis_prod_data
```

Volumes are automatically created by Docker and persist data across container restarts.

### Cleanup

```bash
# List all volumes
docker volume ls

# Remove specific volume
docker volume rm nestjs-enterprise-dev_postgres_dev_data

# Remove all unused volumes
docker volume prune
```

## Configuration Per Environment

### Development Configuration

- Fast feedback loop
- All debugging tools enabled
- No strict resource limits
- Auto-restart disabled
- Maximum verbosity logging

### Staging Configuration

- Production-like behavior
- Resource limits applied
- Auto-restart enabled
- Info-level logging
- Intermediate security

### Production Configuration

- High availability
- Strict resource limits
- Critical security measures
- Auto-restart with failure handling
- Minimal logging (warnings only)
- Swagger disabled
- No debug features

## Troubleshooting

### Port Already in Use

If port is already in use, change in environment file:

```env
# For dev: use different port
POSTGRES_PORT=5435
REDIS_PORT=6385
```

### Container Name Conflicts

If container name exists, change in environment file:

```env
POSTGRES_CONTAINER_NAME=postgres_dev_v2
REDIS_CONTAINER_NAME=redis_dev_v2
```

### Database Connection Issues

1. Verify `POSTGRES_HOST` matches container name (or use 'postgres' for Docker)
2. Check `DATABASE_URL` format
3. Ensure credentials are correct
4. Check firewall/network policies

### Redis Connection Issues

1. Verify `REDIS_HOST` is correct
2. Ensure `REDIS_PORT` matches exposed port
3. Check if password is set but not provided in connection
4. Verify Redis is running: `docker ps`

## Verification Steps

After starting containers, verify everything is working:

```bash
# Check containers are running
docker ps

# Check logs
docker logs app_dev

# Test database connection
docker exec postgres_dev pg_isready -U postgres

# Test Redis connection
docker exec redis_dev redis-cli ping

# Check volumes
docker volume ls
```

## Additional Resources

- [Docker Compose Documentation](https://docs.docker.com/compose/)
- [PostgreSQL Docker Image](https://hub.docker.com/_/postgres)
- [Redis Docker Image](https://hub.docker.com/_/redis)
- [NestJS Documentation](https://docs.nestjs.com/)
