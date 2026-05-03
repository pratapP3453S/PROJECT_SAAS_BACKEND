-- =============================================================================
-- PostgreSQL initialization script
-- Runs once when the container is first created (not on restarts).
-- =============================================================================

-- Enable extensions used by Prisma / the application
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";   -- Used for fast ILIKE full-text search

-- Set default timezone
SET timezone = 'UTC';
