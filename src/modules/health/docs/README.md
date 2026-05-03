# Health Module Developer Guide

## Purpose

The health module exposes public liveness and readiness-style endpoints for monitoring systems. It contains no business logic and should stay dependency-light.

## Request Flow

### Composite Health Check

`GET /health`

1. `@Public()` bypasses global JWT auth.
2. `@HealthCheck()` delegates response shaping to Terminus.
3. `HealthCheckService.check()` runs the configured indicators.
4. `PrismaHealthIndicator.pingCheck()` verifies database connectivity.
5. `MemoryHealthIndicator` checks heap and RSS thresholds.
6. Terminus returns 200 when all indicators pass and 503 when any indicator fails.

### Ping

`GET /health/ping`

1. `@Public()` bypasses auth.
2. The controller returns a standardized app response with status, timestamp, uptime, and version.
3. No external service is contacted.

## Key Files

- `health.module.ts`: imports Terminus and HTTP modules.
- `health.controller.ts`: exposes `/health` and `/health/ping`.

## Dependencies

- `@nestjs/terminus` provides health check orchestration.
- `PrismaService` is injected from the global `PrismaModule`.
- `Responses.HEALTH_OK` defines the ping success response.
- `main.ts` excludes `health` and `health/ping` from the global API prefix.

## Complexity And Risk

- Low complexity.
- Keep `/health/ping` cheap and dependency-free.
- Be careful adding indicators to `/health`; anything slow or flaky can cause deployment platforms to mark healthy apps as unhealthy.
- If thresholds change, validate them under realistic production memory usage.

