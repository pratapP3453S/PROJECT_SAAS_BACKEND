import { ExecutionContext, createParamDecorator } from '@nestjs/common';
import { AuthenticatedRequest, AuthenticatedUser } from '../../shared/types/request.interface';

/**
 * @CurrentUser() — parameter decorator that extracts the authenticated user
 * from the request object.
 *
 * Prerequisite: JwtAuthGuard must have run and populated req.user via JwtStrategy.
 *
 * Usage:
 *  @CurrentUser()                    → returns the full AuthenticatedUser object
 *  @CurrentUser('id')               → returns user.id (string)
 *  @CurrentUser('email')            → returns user.email (string)
 *  @CurrentUser('role')             → returns user.role (Role enum)
 *
 * Flow:
 * 1. switchToHttp().getRequest() — retrieve the Express request.
 * 2. If `data` is a key of AuthenticatedUser, return user[data].
 * 3. Otherwise return the entire user object.
 *
 * Used by: AuthController.logout(), UserController.getMe(), UserController.updateMe()
 * See also: AuthenticatedUser → src/shared/types/request.interface.ts
 */
export const CurrentUser = createParamDecorator(
  (data: keyof AuthenticatedUser | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = request.user;
    return data ? user?.[data] : user;
  },
);
