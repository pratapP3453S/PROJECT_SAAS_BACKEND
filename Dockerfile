# =============================================================================
# Multi-Stage Dockerfile
# =============================================================================
# Stages:
#   base        — Node + pnpm toolchain, shared by all stages
#   deps        — All dependencies (dev + prod) for building and development
#   prod-deps   — Production-only dependencies (lean runtime node_modules)
#   builder     — TypeScript compile + Prisma client generation
#   development — Hot-reload dev server (target: development)
#   production  — Minimal runtime image (target: production)
# =============================================================================

# ─── Stage 1: Base ────────────────────────────────────────────────────────────
FROM node:20-alpine AS base

# Install pnpm via corepack (ships with Node 16.9+)
ENV pnpm_HOME="/pnpm"
ENV PATH="$pnpm_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate

# Security: run as non-root
RUN addgroup --system --gid 1001 nodejs \
  && adduser  --system --uid 1001 nestjs

WORKDIR /app

# ─── Stage 2: All Dependencies ────────────────────────────────────────────────
FROM base AS deps

COPY package.json pnpm-lock.yaml ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
  pnpm install --frozen-lockfile

# ─── Stage 3: Production-only Dependencies ────────────────────────────────────
FROM base AS prod-deps

COPY package.json pnpm-lock.yaml ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
  pnpm install --frozen-lockfile --prod

# ─── Stage 4: Builder ─────────────────────────────────────────────────────────
FROM deps AS builder

# Prisma 7 loads prisma.config.ts during generate. A syntactically valid URL is
# enough at build time; runtime/migration containers receive the real value.
ENV DATABASE_URL="postgresql://postgres:postgres@localhost:5432/build?schema=public"

# Copy full source
COPY . .

# Generate Prisma client and compile TypeScript
RUN pnpm prisma:generate \
  && pnpm build

# ─── Stage 5: Development ─────────────────────────────────────────────────────
FROM deps AS development

ENV NODE_ENV=development
ENV DATABASE_URL="postgresql://postgres:postgres@localhost:5432/build?schema=public"

# Copy source; node_modules already present from deps stage
COPY . .

# Generate Prisma client for dev
RUN pnpm prisma:generate
RUN mkdir -p dist uploads \
  && chown -R nestjs:nodejs /app

# Volumes are mounted at runtime by docker-compose (overrides this COPY)
EXPOSE 3000

USER nestjs

CMD [ "pnpm", "start:dev" ]

# ─── Stage 6: Production ──────────────────────────────────────────────────────
FROM base AS production

ENV NODE_ENV=production

# Copy production node_modules from prod-deps stage
COPY --from=prod-deps --chown=nestjs:nodejs /app/node_modules ./node_modules

# Copy generated Prisma client from builder (overwrites above if needed)
COPY --from=builder --chown=nestjs:nodejs /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder --chown=nestjs:nodejs /app/node_modules/@prisma/client ./node_modules/@prisma/client


# Copy compiled application
COPY --from=builder --chown=nestjs:nodejs /app/dist ./dist

# Copy Prisma schema + config for running migrations at startup
COPY --chown=nestjs:nodejs prisma ./prisma
COPY --chown=nestjs:nodejs prisma.config.ts ./prisma.config.ts
COPY --chown=nestjs:nodejs package.json ./package.json

EXPOSE 3000

USER nestjs

CMD [ "pnpm", "start:prod" ]
