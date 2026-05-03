import { Module } from '@nestjs/common';
import { UserController } from './user.controller';
import { UserRepository } from './user.repository';
import { UserService } from './user.service';

/**
 * UserModule — feature module for user profile management.
 *
 * Responsibility: Wires the user Controller → Service → Repository layer.
 * CacheService and PrismaService are injected automatically from their
 * respective @Global() modules (SharedModule and PrismaModule).
 *
 * Exports:
 *  UserService    : available to other modules that need user lookup (e.g. future
 *                   modules that associate records with a user).
 *  UserRepository : available for direct DB access in more complex feature modules.
 *
 * Used by: AppModule → imports: [..., UserModule]
 * See also:
 *  UserController → src/modules/user/user.controller.ts
 *  UserService    → src/modules/user/user.service.ts
 *  UserRepository → src/modules/user/user.repository.ts
 */
@Module({
  controllers: [UserController],
  providers: [UserService, UserRepository],
  exports: [UserService, UserRepository],
})
export class UserModule {}
