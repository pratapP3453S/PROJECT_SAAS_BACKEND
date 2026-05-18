# Health Module Developer Guide

## Purpose

The health module exposes public liveness and readiness-style endpoints for
monitoring systems. It contains no business logic and stays dependency-light.

## Layer map

```
modules/health/
├── api/
│   └── v1/
│       ├── controllers/health.controller.ts
│       └── health-v1.module.ts          # imports TerminusModule, HttpModule
└── health.module.ts                     # aggregator (re-exports HealthV1Module)
```

Health is the smallest feature in the codebase — it has no `domain/`,
`application/`, or `infrastructure/` folders because there is no business
logic to keep separate from the controller.

## Routes

> **Note** — health routes are intentionally NOT URI-versioned. Load balancers
> and Kubernetes probes expect a stable `/health` path. The "v1" in the
> folder name is for code organisation; the controller uses `@Controller('health')`
> without a `version`, and `main.ts` excludes `health` and `health/ping` from
> the global `/api` prefix.

### Composite health check

`GET /health`

1. `@Public()` bypasses global JWT auth.
2. `@HealthCheck()` delegates response shaping to Terminus.
3. `HealthCheckService.check()` runs the configured indicators.
4. Database connectivity is verified via a raw Prisma query.
5. `MemoryHealthIndicator` checks heap and RSS thresholds.
6. Terminus returns 200 when all indicators pass and 503 when any indicator fails.

### Ping

`GET /health/ping`

1. `@Public()` bypasses auth.
2. The controller returns a standardized app response with status, timestamp, uptime, and version.
3. No external service is contacted.

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
- DO NOT add `version: '1'` to the controller — it would break every existing K8s probe configuration.
