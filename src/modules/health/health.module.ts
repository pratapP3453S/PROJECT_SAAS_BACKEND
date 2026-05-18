import { Module } from '@nestjs/common';
import { HealthV1Module } from './api/v1/health-v1.module';

/**
 * HealthModule — feature aggregator for application health checks.
 *
 * Responsibility
 *  Re-exports the versioned API submodules (currently just v1). Adding `v2`
 *  later is purely additive: create `api/v2/health-v2.module.ts` and import
 *  it here alongside `HealthV1Module`.
 *
 * Why a thin wrapper?
 *  AppModule should depend on the feature, not on specific versions. This
 *  module is the single import point so version rollouts don't ripple up to
 *  the root module.
 *
 * Layers
 *  - api/v1/        controllers + module wiring
 *  - (no domain/application/infrastructure here — health is pure HTTP +
 *    indicators provided by @nestjs/terminus, with no business logic.)
 *
 * Used by: AppModule → imports: [..., HealthModule]
 */
@Module({
  imports: [HealthV1Module],
})
export class HealthModule {}
