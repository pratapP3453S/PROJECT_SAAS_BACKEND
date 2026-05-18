import { Module } from '@nestjs/common';
import { UserController } from './controllers/user.controller';
import { UserService } from '../../application/use-cases/user.service';
import { UserRepository } from '../../infrastructure/prisma/user.repository';

/**
 * UserV1Module — v1 API surface for the user feature.
 *
 * Wires the v1 UserController together with its application use-case
 * (UserService) and Prisma repository (UserRepository). Imported by the
 * top-level UserModule.
 *
 * Adding v2 later: copy this module to `api/v2/`, change the @Controller's
 * `version` to '2', and import UserV2Module from UserModule alongside this one.
 */
@Module({
  controllers: [UserController],
  providers: [UserService, UserRepository],
  exports: [UserService, UserRepository],
})
export class UserV1Module {}
