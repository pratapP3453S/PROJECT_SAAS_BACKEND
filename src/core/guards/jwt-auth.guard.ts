import { ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { Observable } from 'rxjs';
import { IS_PUBLIC_KEY } from '../../shared/constants/app.constants';

/**
 * JwtAuthGuard — global JWT authentication guard.
 *
 * Responsibility: Validates the Authorization Bearer token on every incoming
 * request. Routes decorated with @Public() are exempted. Registered globally
 * via APP_GUARD in AppModule so all routes are protected by default.
 *
 * Extends: AuthGuard('jwt') — delegates to JwtStrategy (passport-jwt) for
 * token signature verification and payload extraction.
 *
 * canActivate flow:
 * 1. Read IS_PUBLIC_KEY metadata from the route handler and controller class
 *    via Reflector.getAllAndOverride(). If true, return immediately (public route).
 * 2. Otherwise, call super.canActivate() which triggers JwtStrategy.validate()
 *    via passport. On success, attaches the AuthenticatedUser to req.user.
 *
 * handleRequest flow (called after passport resolves):
 * 1. If err or no user: throw UnauthorizedException with specific error code:
 *    - 'jwt expired' info → ERR_TOKEN_EXPIRED
 *    - any other failure → ERR_TOKEN_INVALID
 * 2. If user present: return user (attached to req.user by passport).
 *
 * Dependencies:
 *  - JwtStrategy  : src/modules/auth/infrastructure/jwt/jwt.strategy.ts
 *  - @Public()    : src/core/decorators/public.decorator.ts
 *  - IS_PUBLIC_KEY: src/shared/constants/app.constants.ts
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext): boolean | Promise<boolean> | Observable<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    return super.canActivate(context);
  }

  handleRequest<TUser = unknown>(err: Error | null, user: TUser, info: Error | null): TUser {
    if (err || !user) {
      const message =
        info?.message === 'jwt expired' ? 'Token has expired.' : 'Invalid or missing token.';
      throw new UnauthorizedException({
        name: 'UnauthorizedError',
        code: err?.message === 'jwt expired' ? 'ERR_TOKEN_EXPIRED' : 'ERR_TOKEN_INVALID',
        message,
      });
    }
    return user;
  }
}
