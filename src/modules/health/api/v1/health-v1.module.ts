import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { HttpModule } from '@nestjs/axios';
import { HealthController } from './controllers/health.controller';

/**
 * HealthV1Module — v1 API surface for the health feature.
 *
 * Wires the v1 HealthController and the indicator providers it needs.
 * Imported by `HealthModule` (the feature aggregator) and through it by
 * AppModule.
 *
 * NOTE: HealthController does NOT use URI versioning — see the comment on
 * its `@Controller('health')` decorator. The "v1" in the folder name reflects
 * code organisation, not the route path.
 */
@Module({
  imports: [TerminusModule, HttpModule],
  controllers: [HealthController],
})
export class HealthV1Module {}
