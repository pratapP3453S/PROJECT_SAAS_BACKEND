import { Module } from '@nestjs/common';
import { UserV1Module } from './api/v1/user-v1.module';

/**
 * UserModule — feature aggregator for user profile management.
 *
 * Layer
 *  This is the public surface AppModule imports. It composes the versioned
 *  API submodules and re-exports them so the providers UserV1Module declares
 *  (UserService + UserRepository) flow up to consuming modules without being
 *  duplicated.
 *
 * Important: providers are declared ONCE in UserV1Module. Listing them again
 * here would create two NestJS instances and break shared state (cache TTLs,
 * Prisma connections behave fine because they're @Global, but injecting them
 * twice still confuses things). Re-exporting the submodule is the canonical
 * way to bubble its exports up.
 *
 * Layout under modules/user/
 *  - domain/         entity types and pure rules
 *  - infrastructure/ Prisma repository (concrete persistence)
 *  - application/    UserService (use-cases) — depends on domain + infrastructure
 *  - api/v1/         HTTP controller + request DTOs + UserV1Module
 *  - user.module.ts  this file (composition root)
 */
@Module({
  imports: [UserV1Module],
  exports: [UserV1Module],
})
export class UserModule {}
