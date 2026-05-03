# Environment Configuration Guide

Complete reference for configuring your application with `.env.dev`, `.env.stg`, and `.env.prod` files.

---

## 📁 Environment Files Overview

Three separate environment files control the behavior of your application:

| File | Environment | Purpose | Location |
|---|---|---|---|
| `.env.dev` | Development | Local development with hot reload | Local machine |
| `.env.stg` | Staging | Pre-production testing | VPS |
| `.env.prod` | Production | Live environment | VPS |

---

## 🔧 Core Configuration Variables

### Application Environment

```env
# Development
NODE_ENV=development
COMPOSE_PROJECT_NAME=nestjs-enterprise-dev

# Staging
NODE_ENV=staging
COMPOSE_PROJECT_NAME=nestjs-enterprise-stg

# Production
NODE_ENV=production
COMPOSE_PROJECT_NAME=nestjs-enterprise-prod
```

| Variable | Purpose | Values |
|---|---|---|
| `NODE_ENV` | Runtime environment | `development`, `staging`, `production` |
| `COMPOSE_PROJECT_NAME` | Docker Compose prefix | Unique per environment |

---

## 🐳 Docker Container Configuration

These variables control container names and volumes.

```env
# Container Names
APP_CONTAINER_NAME=app_dev                 # Development
APP_CONTAINER_NAME=app_stg                 # Staging
APP_CONTAINER_NAME=app_prod                # Production

POSTGRES_CONTAINER_NAME=postgres_dev       # Development
POSTGRES_CONTAINER_NAME=postgres_stg       # Staging
POSTGRES_CONTAINER_NAME=postgres_prod      # Production

REDIS_CONTAINER_NAME=redis_dev             # Development
REDIS_CONTAINER_NAME=redis_stg             # Staging
REDIS_CONTAINER_NAME=redis_prod            # Production
```

```env
# Volume Names (persistent data storage)
POSTGRES_VOLUME_NAME=postgres_dev_data     # Development
POSTGRES_VOLUME_NAME=postgres_stg_data     # Staging
POSTGRES_VOLUME_NAME=postgres_prod_data    # Production

REDIS_VOLUME_NAME=redis_dev_data           # Development
REDIS_VOLUME_NAME=redis_stg_data           # Staging
REDIS_VOLUME_NAME=redis_prod_data          # Production
```

---

## 🔌 Port Configuration

Controls which ports your services listen on.

```env
# Application Port (external access)
PORT=5000                                  # Development
PORT=5005                                  # Staging
PORT=5010                                  # Production

# PostgreSQL Port (external access)
POSTGRES_PORT=5400                         # Development
POSTGRES_PORT=5435                         # Staging
POSTGRES_PORT=5430                         # Production

# Redis Port (external access)
REDIS_PORT=6300                            # Development
REDIS_PORT=6385                            # Staging
REDIS_PORT=6370                            # Production

# Bind Host (which network interface to use)
POSTGRES_BIND_HOST=localhost               # Development (local only)
POSTGRES_BIND_HOST=127.0.0.1               # Staging (local only)
POSTGRES_BIND_HOST=127.0.0.1               # Production (local only)
```

**Note:** Ports are intentionally different to prevent conflicts when running multiple environments on the same server.

---

## 🗄️ Database Configuration

### PostgreSQL Connection

```env
# Database Credentials
POSTGRES_USER=postgres                     # Development (simple for local)
POSTGRES_USER=stg_user                     # Staging (specific user)
POSTGRES_USER=prod_user                    # Production (specific user)

POSTGRES_PASSWORD=postgres                 # Development (simple for local)
POSTGRES_PASSWORD=stg-secure-password-change-me-12345!    # Staging (CHANGE THIS)
POSTGRES_PASSWORD=prod-very-strong-password-change-me-secure!  # Production (CHANGE THIS)

POSTGRES_DB=nestjs_dev                     # Development
POSTGRES_DB=nestjs_stg                     # Staging
POSTGRES_DB=nestjs_prod                    # Production

# Internal connection (used inside containers)
POSTGRES_HOST=postgres                     # Always 'postgres' (Docker service name)

# Full connection string
DATABASE_URL="postgresql://user:password@host:port/database?schema=public"
```

### Update Database Credentials

1. **Development** (local): Keep simple for easy testing
   ```env
   POSTGRES_USER=postgres
   POSTGRES_PASSWORD=postgres
   ```

2. **Staging** (VPS): Use strong password
   ```env
   POSTGRES_USER=stg_user
   POSTGRES_PASSWORD=your-strong-staging-password-32chars!
   ```

3. **Production** (VPS): Use very strong password
   ```env
   POSTGRES_USER=prod_user
   POSTGRES_PASSWORD=your-very-secure-production-password-40chars!
   ```

---

## ⚡ Redis Configuration

### Redis Connection

```env
# Redis Credentials
REDIS_HOST=localhost                       # Always localhost from container
REDIS_PORT=6300                            # Development
REDIS_PORT=6385                            # Staging
REDIS_PORT=6370                            # Production

REDIS_PASSWORD=                            # Development (empty)
REDIS_PASSWORD=stg-redis-password-change-me!  # Staging (CHANGE THIS)
REDIS_PASSWORD=prod-very-strong-redis-password-change-me!  # Production (CHANGE THIS)

REDIS_DB=0                                 # Default database (0-15)

# Memory Management
REDIS_MAX_MEMORY=128mb                     # Development
REDIS_MAX_MEMORY=256mb                     # Staging
REDIS_MAX_MEMORY=512mb                     # Production

REDIS_TTL=3600                             # Default TTL in seconds (1 hour)
REDIS_TTL=7200                             # Staging (2 hours)
REDIS_TTL=14400                            # Production (4 hours)
```

---

## 🔐 Security Configuration

### JWT Secrets

```env
# Access Token Secret (at least 32 characters)
JWT_SECRET=dev-secret-at-least-32-chars-long-1234567890!         # Development
JWT_SECRET=stg-secret-at-least-32-chars-long-change-me-1234!     # Staging (CHANGE)
JWT_SECRET=prod-secret-at-least-32-chars-long-very-secure!       # Production (CHANGE)

# Token Expiration
JWT_EXPIRES_IN=7d                          # 7 days
JWT_EXPIRES_IN=14d                         # 14 days (Staging)
JWT_EXPIRES_IN=7d                          # 7 days (Production)

# Refresh Token Secret
JWT_REFRESH_SECRET=dev-refresh-secret-at-least-32-chars-long!    # Development
JWT_REFRESH_SECRET=stg-refresh-secret-at-least-32-chars-long-change!  # Staging
JWT_REFRESH_SECRET=prod-refresh-secret-at-least-32-chars-long-secure!  # Production

JWT_REFRESH_EXPIRES_IN=30d                 # 30 days
JWT_REFRESH_EXPIRES_IN=60d                 # 60 days (Staging)
JWT_REFRESH_EXPIRES_IN=30d                 # 30 days (Production)
```

### Encryption Key

Used for encrypting sensitive data (e.g., uploaded images, personal info).

```env
# Must be exactly 32 characters for AES-256
IMAGE_ENCRYPTION_KEY=dev-key-exactly-32-chars-00000000!          # Development
IMAGE_ENCRYPTION_KEY=stg-key-exactly-32-chars-change-me-000!     # Staging (CHANGE)
IMAGE_ENCRYPTION_KEY=prod-key-exactly-32-chars-very-secure!      # Production (CHANGE)
```

**Generate a secure key:**
```bash
node -e "console.log(require('crypto').randomBytes(16).toString('hex'))"
# Take first 32 characters
```

---

## 🌐 CORS Configuration

Allow requests only from specific origins.

```env
# Development (local testing)
CORS_ORIGINS=http://localhost:3000,http://localhost:4200

# Staging (pre-production domains)
CORS_ORIGINS=https://staging.example.com,https://app-staging.example.com

# Production (live domains only)
CORS_ORIGINS=https://yourapp.com,https://www.yourapp.com
```

**Never use wildcard `*` in production.**

---

## ⏱️ Rate Limiting

Control request rate limiting.

```env
# Sliding window (seconds)
THROTTLE_TTL=60                            # Development
THROTTLE_TTL=120                           # Staging
THROTTLE_TTL=60                            # Production

# Max requests per window
THROTTLE_LIMIT=1000                        # Development (generous)
THROTTLE_LIMIT=500                         # Staging (moderate)
THROTTLE_LIMIT=100                         # Production (strict)
```

---

## 📱 Application Info

```env
APP_NAME="NestJS Enterprise API"           # Display name
APP_VERSION=1.0.0                          # Version string
API_PREFIX=api/v1                          # API base path
```

---

## 📋 Complete Environment Files

### .env.dev (Development)

```env
# Application Environment
NODE_ENV=development
COMPOSE_PROJECT_NAME=nestjs-enterprise-dev
PORT=5000

# Docker Container Configuration
APP_CONTAINER_NAME=app_dev
POSTGRES_CONTAINER_NAME=postgres_dev
REDIS_CONTAINER_NAME=redis_dev
POSTGRES_VOLUME_NAME=postgres_dev_data
REDIS_VOLUME_NAME=redis_dev_data

# Database Configuration
POSTGRES_HOST=postgres
POSTGRES_PORT=5400
POSTGRES_BIND_HOST=localhost
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres
POSTGRES_DB=nestjs_dev
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/nestjs_dev?schema=public"

# Redis Configuration
REDIS_HOST=localhost
REDIS_PORT=6300
REDIS_PASSWORD=
REDIS_DB=0
REDIS_TTL=3600
REDIS_MAX_MEMORY=128mb

# Application Configuration
APP_NAME="NestJS Enterprise API"
APP_VERSION=1.0.0
API_PREFIX=api/v1

# CORS Configuration
CORS_ORIGINS=http://localhost:3000,http://localhost:4200

# JWT Configuration
JWT_SECRET=dev-secret-at-least-32-chars-long-1234567890!
JWT_EXPIRES_IN=7d
JWT_REFRESH_SECRET=dev-refresh-secret-at-least-32-chars-long!
JWT_REFRESH_EXPIRES_IN=30d

# Encryption
IMAGE_ENCRYPTION_KEY=dev-key-exactly-32-chars-00000000!

# Rate Limiting
THROTTLE_TTL=60
THROTTLE_LIMIT=1000
```

### .env.stg (Staging)

```env
# Application Environment
NODE_ENV=staging
COMPOSE_PROJECT_NAME=nestjs-enterprise-stg
PORT=5005

# Docker Container Configuration
APP_CONTAINER_NAME=app_stg
POSTGRES_CONTAINER_NAME=postgres_stg
REDIS_CONTAINER_NAME=redis_stg
POSTGRES_VOLUME_NAME=postgres_stg_data
REDIS_VOLUME_NAME=redis_stg_data

# Database Configuration
POSTGRES_HOST=postgres
POSTGRES_PORT=5435
POSTGRES_BIND_HOST=127.0.0.1
POSTGRES_USER=stg_user
POSTGRES_PASSWORD=stg-secure-password-change-me-12345!
POSTGRES_DB=nestjs_stg
DATABASE_URL="postgresql://stg_user:stg-secure-password-change-me-12345!@localhost:5435/nestjs_stg?schema=public"

# Redis Configuration
REDIS_HOST=localhost
REDIS_PORT=6385
REDIS_PASSWORD=stg-redis-password-change-me!
REDIS_DB=0
REDIS_TTL=7200
REDIS_MAX_MEMORY=256mb

# Application Configuration
APP_NAME="NestJS Enterprise API"
APP_VERSION=1.0.0
API_PREFIX=api/v1

# CORS Configuration
CORS_ORIGINS=https://staging.example.com,https://app-staging.example.com

# JWT Configuration
JWT_SECRET=stg-secret-at-least-32-chars-long-change-me-1234!
JWT_EXPIRES_IN=14d
JWT_REFRESH_SECRET=stg-refresh-secret-at-least-32-chars-long-change!
JWT_REFRESH_EXPIRES_IN=60d

# Encryption
IMAGE_ENCRYPTION_KEY=stg-key-exactly-32-chars-change-me-000!

# Rate Limiting
THROTTLE_TTL=120
THROTTLE_LIMIT=500
```

### .env.prod (Production)

```env
# Application Environment
NODE_ENV=production
COMPOSE_PROJECT_NAME=nestjs-enterprise-prod
PORT=5010

# Docker Container Configuration
APP_CONTAINER_NAME=app_prod
POSTGRES_CONTAINER_NAME=postgres_prod
REDIS_CONTAINER_NAME=redis_prod
POSTGRES_VOLUME_NAME=postgres_prod_data
REDIS_VOLUME_NAME=redis_prod_data

# Database Configuration
POSTGRES_HOST=postgres
POSTGRES_PORT=5430
POSTGRES_BIND_HOST=127.0.0.1
POSTGRES_USER=prod_user
POSTGRES_PASSWORD=prod-very-strong-password-change-me-secure!
POSTGRES_DB=nestjs_prod
DATABASE_URL="postgresql://prod_user:prod-very-strong-password-change-me-secure!@localhost:5432/nestjs_prod?schema=public"

# Redis Configuration
REDIS_HOST=localhost
REDIS_PORT=6370
REDIS_PASSWORD=prod-very-strong-redis-password-change-me!
REDIS_DB=0
REDIS_TTL=14400
REDIS_MAX_MEMORY=512mb

# Application Configuration
APP_NAME="NestJS Enterprise API"
APP_VERSION=1.0.0
API_PREFIX=api/v1

# CORS Configuration
CORS_ORIGINS=https://yourapp.com,https://www.yourapp.com

# JWT Configuration
JWT_SECRET=prod-secret-at-least-32-chars-long-very-secure!
JWT_EXPIRES_IN=7d
JWT_REFRESH_SECRET=prod-refresh-secret-at-least-32-chars-long-secure!
JWT_REFRESH_EXPIRES_IN=30d

# Encryption
IMAGE_ENCRYPTION_KEY=prod-key-exactly-32-chars-very-secure!

# Rate Limiting
THROTTLE_TTL=60
THROTTLE_LIMIT=100
```

---

## 🔐 Security Checklist

Before deploying, ensure you've:

- [ ] Changed all `POSTGRES_PASSWORD` values
- [ ] Changed all `REDIS_PASSWORD` values
- [ ] Changed all `JWT_SECRET` values (at least 32 chars)
- [ ] Changed `IMAGE_ENCRYPTION_KEY` (exactly 32 chars)
- [ ] Updated `CORS_ORIGINS` to your actual domains
- [ ] In production, set `JWT_EXPIRES_IN` appropriately (not too long)
- [ ] Used strong passwords (mix of upper, lower, numbers, symbols)
- [ ] Never commit `.env` files to git (use `.env.example`)
- [ ] Rotate keys/passwords regularly

---

## 💡 Tips & Best Practices

1. **Different credentials per environment**: Never reuse passwords
2. **Secure password generation**: Use `openssl rand -base64 32`
3. **Store securely**: Use a password manager (1Password, LastPass)
4. **Regular rotation**: Update passwords every 90 days
5. **Monitor**: Log all database access in staging/production
6. **Backup**: Before changing credentials, backup your data

---

## 📚 Related Documentation

- [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md) — How to deploy
- [DOCKER_QUICKSTART.md](DOCKER_QUICKSTART.md) — Quick commands
