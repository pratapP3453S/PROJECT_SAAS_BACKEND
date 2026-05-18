import { Module } from '@nestjs/common';
import { AuthV1Module } from './api/v1/auth-v1.module';

/**
 * AuthModule — feature aggregator for authentication flows.
 *
 * Composes the versioned API submodules and re-exports the things downstream
 * features need (auth providers like JwtModule).
 *
 * Layout under modules/auth/
 *  - domain/         entity types (AuthTokens, PublicUser, …)
 *  - infrastructure/ Prisma repository + JWT/Passport strategy
 *  - application/    AuthService — use-case orchestration
 *  - api/v1/         AuthController + request DTOs + AuthV1Module
 *  - auth.module.ts  this file (composition root)
 *
 * Imported by: AppModule
 */
@Module({
  imports: [AuthV1Module],
  exports: [AuthV1Module],
})
export class AuthModule {}
