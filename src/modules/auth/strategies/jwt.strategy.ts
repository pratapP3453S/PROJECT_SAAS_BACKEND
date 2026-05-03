import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { JwtPayload } from '../../../common/interfaces/jwt-payload.interface';
import { AuthenticatedUser } from '../../../common/interfaces/request.interface';
import { PrismaService } from '../../../database/prisma/prisma.service';

/**
 * JwtStrategy — Passport strategy for access token verification.
 *
 * Responsibility: Validates the JWT signature and expiry, then performs a
 * live database lookup to confirm the user still exists and is not suspended
 * or soft-deleted. Attaches the result to req.user via passport.
 *
 * Extends: PassportStrategy(Strategy, 'jwt') — named 'jwt' so AuthGuard('jwt')
 * can resolve it by name.
 *
 * Constructor config:
 *  jwtFromRequest : reads the Bearer token from the Authorization header.
 *  ignoreExpiration: false — expired tokens are rejected before validate() runs.
 *  secretOrKey    : reads from jwt.secret config namespace; falls back to
 *                   JWT_SECRET env var for compatibility.
 *
 * validate(payload) flow:
 * 1. payload.sub (userId) is extracted by passport after signature verification.
 * 2. prisma.user.findUnique(id) with select { id, email, role, status, deletedAt }.
 * 3. If not found or soft-deleted → throw 401 ERR_TOKEN_INVALID.
 * 4. If status === 'SUSPENDED' → throw 401 ERR_ACCOUNT_SUSPENDED.
 * 5. Return AuthenticatedUser { id, email, role } — passport attaches to req.user.
 *
 * Called by: JwtAuthGuard (via super.canActivate → passport middleware)
 * See also: JwtAuthGuard → src/common/guards/jwt-auth.guard.ts
 *           JwtPayload   → src/common/interfaces/jwt-payload.interface.ts
 *           AuthenticatedUser → src/common/interfaces/request.interface.ts
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey:
        configService.get<string>('jwt.secret') ||
        configService.get<string>('JWT_SECRET', 'secret'),
    });
  }

  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, role: true, status: true, deletedAt: true },
    });

    if (!user || user.deletedAt) {
      throw new UnauthorizedException({
        name: 'UnauthorizedError',
        code: 'ERR_TOKEN_INVALID',
        message: 'Token is invalid.',
      });
    }

    if (user.status === 'SUSPENDED') {
      throw new UnauthorizedException({
        name: 'AccountSuspendedError',
        code: 'ERR_ACCOUNT_SUSPENDED',
        message: 'Your account has been suspended.',
      });
    }

    return { id: user.id, email: user.email, role: user.role };
  }
}
