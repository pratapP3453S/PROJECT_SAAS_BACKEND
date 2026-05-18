import { SetMetadata } from '@nestjs/common';
import { Role } from '@prisma/client';
import { ROLES_KEY } from '../../shared/constants/app.constants';

/**
 * @Roles(...roles) — restricts a route or controller to specific Prisma Role values.
 *
 * Mechanism: Sets ROLES_KEY metadata to the provided Role array.
 * RolesGuard reads this via Reflector.getAllAndOverride() and compares
 * req.user.role against the required roles.
 *
 * Usage:
 *  @Roles(Role.ADMIN, Role.SUPER_ADMIN)  ← admin or super-admin only
 *  @Roles(Role.SUPER_ADMIN)              ← super-admin only
 *  (no decorator)                        ← any authenticated user allowed
 *
 * Used on: UserController (admin list, admin update, super-admin delete)
 * See also: RolesGuard → src/core/guards/roles.guard.ts
 */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
