import { Controller, Get } from '@nestjs/common';
import {
  HealthCheck,
  HealthCheckService,
  HealthIndicatorResult,
  MemoryHealthIndicator,
} from '@nestjs/terminus';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '../../../../../core/decorators/public.decorator';
import { Responses } from '../../../../../shared/constants/response.constants';
import { ApiResponse as AppResponse } from '../../../../../shared/responses/api.response';
import { PrismaService } from '../../../../../core/database/prisma/prisma.service';

/**
 * HealthController — application health and liveness endpoints.
 *
 * Responsibility: Exposes two @Public() routes that external monitoring systems
 * (load balancers, Kubernetes liveness probes, uptime monitors) can poll to
 * determine application health. Contains no business logic.
 *
 * Route prefix : /health  (excluded from the api/v1 prefix — see main.ts)
 * Guard        : @Public() on both routes — no auth required.
 * Dependencies : @nestjs/terminus health indicators + PrismaService
 *
 * Route map:
 *  GET /health       → check()  — composite health check (DB + memory); returns
 *                                  200 if all indicators pass, 503 if any fail.
 *                                  @HealthCheck() sets the response body shape.
 *  GET /health/ping  → ping()   — lightweight liveness check; always 200 if the
 *                                  process is running (no external dependencies).
 *
 * check() indicators:
 *  db.pingCheck('database', prisma)               : sends a raw query to Postgres.
 *  memory.checkHeap('memory_heap', 150 * 1024²)   : heap RSS below 150 MB.
 *  memory.checkRSS('memory_rss',  300 * 1024²)    : total RSS below 300 MB.
 *
 * ping() response shape:
 *  { status: 'ok', timestamp, uptime (seconds), version }
 *
 * NOTE: This route is intentionally NOT URI-versioned. Kubernetes liveness/readiness
 * probes and load balancers expect a stable `/health` path that never changes
 * across API versions. The global prefix exclusion in main.ts keeps it at `/health`.
 */
@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly memory: MemoryHealthIndicator,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Composite health check — database connectivity and memory usage.
   * Route: GET /health  |  Public (no auth required)
   *
   * Flow:
   * 1. HealthCheckService.check([]) runs all indicators in parallel.
   * 2. db.pingCheck('database', prisma) — executes a raw Prisma query; fails if
   *    the database is unreachable or the connection pool is exhausted.
   * 3. memory.checkHeap('memory_heap', 150 MB) — fails if V8 heap exceeds 150 MB.
   * 4. memory.checkRSS('memory_rss', 300 MB)   — fails if total RSS exceeds 300 MB.
   * 5. Returns 200 with { status: 'ok', info: {}, details: {} } if all pass.
   *    Returns 503 with indicator detail if any check fails.
   *
   * Used by: load balancers, Kubernetes readiness probes, uptime monitors.
   */
  @Public()
  @Get()
  @HealthCheck()
  @ApiOperation({ summary: 'Application health check' })
  @ApiResponse({ status: 200, description: 'Application is healthy' })
  @ApiResponse({ status: 503, description: 'Application is unhealthy' })
  check() {
    return this.health.check([
      () => this.checkDatabase(),
      () => this.memory.checkHeap('memory_heap', 150 * 1024 * 1024), // 150MB
      () => this.memory.checkRSS('memory_rss', 300 * 1024 * 1024), // 300MB
    ]);
  }

  private async checkDatabase(): Promise<HealthIndicatorResult> {
    await this.prisma.$queryRaw`SELECT 1`;
    return { database: { status: 'up' } };
  }

  @Public()
  @Get('ping')
  @ApiOperation({ summary: 'Simple ping check' })
  ping() {
    return AppResponse.fromDefinition(Responses.HEALTH_OK, {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: process.env.APP_VERSION || '1.0.0',
    });
  }
}
