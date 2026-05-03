#!/bin/sh
# =============================================================================
# Production entrypoint
# Runs Prisma migrations then starts the compiled NestJS app.
# Exits with non-zero status on any failure — Docker will restart the container.
# =============================================================================
set -e

echo "⏳ Waiting for database to be ready..."
# Prisma's migrate deploy will retry the connection itself, but we wait
# briefly here to give Postgres a head start before we even try.
sleep 2

echo "🔄 Running database migrations..."
node_modules/.bin/prisma migrate deploy

echo "🌱 Checking if seed is needed (skipped in production by default)..."
# Uncomment the next line to run seed on every cold start (idempotent upserts):
# node_modules/.bin/ts-node -r tsconfig-paths/register prisma/seed.ts

echo "🚀 Starting application..."
exec node dist/main
