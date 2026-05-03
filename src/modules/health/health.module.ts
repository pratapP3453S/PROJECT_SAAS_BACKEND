import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { HttpModule } from '@nestjs/axios';
import { HealthController } from './health.controller';

/**
 * HealthModule — application health check module.
 *
 * Responsibility: Wires @nestjs/terminus health indicators with the HealthController.
 * PrismaService is injected automatically from PrismaModule (@Global).
 *
 * Imports:
 *  TerminusModule : provides HealthCheckService, PrismaHealthIndicator,
 *                   MemoryHealthIndicator (and others if needed later).
 *  HttpModule     : provides HttpService for optional HTTP health checks
 *                   (e.g. checking a downstream API's /health endpoint).
 *
 * Routes exposed (no auth — @Public()):
 *  GET /health      : composite check (DB ping + heap/RSS memory limits)
 *  GET /health/ping : lightweight liveness check (always 200 if process runs)
 *
 * Used by: AppModule → imports: [..., HealthModule]
 * See also: HealthController → src/modules/health/health.controller.ts
 */
@Module({
  imports: [TerminusModule, HttpModule],
  controllers: [HealthController],
})
export class HealthModule {}
