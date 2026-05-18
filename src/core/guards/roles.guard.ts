import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { ROLES_KEY } from '../../shared/constants/app.constants';
import { AuthenticatedRequest } from '../../shared/types/request.interface';

/**
 * RolesGuard — role-based access control guard.
 *
 * Responsibility: Restricts routes to specific Prisma Role values (USER, ADMIN,
 * SUPER_ADMIN). Must run AFTER JwtAuthGuard so req.user is already populated.
 * Registered globally via APP_GUARD in AppModule (second guard in the chain).
 *
 * canActivate flow:
 * 1. Read ROLES_KEY metadata from handler and class via Reflector.
 *    If no @Roles() decorator is present, allow all authenticated users through.
 * 2. Extract req.user from the authenticated request.
 *    If no user (unauthenticated call somehow past JwtAuthGuard), throw 403.
 * 3. Check user.role is included in requiredRoles array.
 *    Match → return true (request proceeds).
 *    No match → throw ForbiddenException with ERR_INSUFFICIENT_PERMISSIONS.
 *
 * Usage:
 *  @Roles(Role.ADMIN, Role.SUPER_ADMIN)   ← restrict to admins only
 *  @Roles(Role.SUPER_ADMIN)               ← super admin only
 *  (no decorator)                         ← any authenticated user
 *
 * Dependencies:
 *  - @Roles()   : src/core/decorators/roles.decorator.ts
 *  - ROLES_KEY  : src/shared/constants/app.constants.ts
 *  - AuthenticatedRequest: src/shared/types/request.interface.ts
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const { user } = request;

    if (!user) {
      throw new ForbiddenException({
        name: 'ForbiddenError',
        code: 'ERR_FORBIDDEN',
        message: 'Access denied.',
      });
    }

    const hasRole = requiredRoles.includes(user.role);
    if (!hasRole) {
      throw new ForbiddenException({
        name: 'ForbiddenError',
        code: 'ERR_INSUFFICIENT_PERMISSIONS',
        message: `This action requires one of the following roles: ${requiredRoles.join(', ')}.`,
      });
    }

    return true;
  }
}
